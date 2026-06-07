"""
Crunchbase scraper — Playwright-based with Tor fallback.

Crunchbase is heavily bot-protected, so this scraper:
  1. Tries the proxy pool first (up to 3 attempts)
  2. Falls back to Tor if all proxies fail
  3. Uses very conservative delays (5–15s) to avoid rate limits
  4. Targets the /discover/jobs endpoint; falls back to scraping
     company "Jobs" tabs if the main jobs page is inaccessible
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from anti_detect.stealth import apply_stealth, human_delay, is_blocked_async, random_scroll
from base.base_scraper import BaseScraper
from proxy.fetcher import get_tor_proxy


_MIN_DELAY = 5.0
_MAX_DELAY = 15.0


class CrunchbaseScraper(BaseScraper):
    """
    Scrapes job listings from crunchbase.com using Playwright.

    Uses Tor as a final fallback when the proxy pool is exhausted.
    """

    async def scrape(self) -> list[dict]:
        """
        Attempt to scrape Crunchbase jobs with proxy rotation and Tor fallback.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://www.crunchbase.com/discover/jobs")
        logger.info(f"[{self.source_name}] Starting Playwright scrape of {jobs_url}")

        proxy_url: Optional[str] = None
        if self.config.get("use_proxy") and self.proxy_pool:
            proxy_url = self.proxy_pool.get_proxy()

        # Attempt with proxy pool
        for attempt in range(3):
            html = await self._scrape_page(jobs_url, proxy_url)
            if html:
                jobs = self._parse_jobs(html, jobs_url)
                if jobs:
                    logger.info(
                        f"[{self.source_name}] Extracted {len(jobs)} jobs (attempt {attempt+1})"
                    )
                    return jobs

            logger.warning(
                f"[{self.source_name}] Attempt {attempt+1} failed — rotating proxy"
            )
            if self.proxy_pool and proxy_url:
                self.proxy_pool.mark_failure(proxy_url)
                proxy_url = self.proxy_pool.rotate()
            await asyncio.sleep(_MIN_DELAY)

        # Tor fallback
        if self.config.get("requires_tor_fallback", False):
            logger.info(f"[{self.source_name}] Trying Tor fallback")
            tor_proxy = get_tor_proxy()
            if tor_proxy:
                html = await self._scrape_page(jobs_url, tor_proxy)
                if html:
                    jobs = self._parse_jobs(html, jobs_url)
                    if jobs:
                        logger.info(f"[{self.source_name}] Tor fallback succeeded: {len(jobs)} jobs")
                        return jobs
            else:
                logger.warning(f"[{self.source_name}] Tor not available")

        logger.error(f"[{self.source_name}] All scraping attempts failed")
        return []

    async def _scrape_page(
        self,
        url: str,
        proxy_url: Optional[str],
    ) -> Optional[str]:
        """
        Navigate to the target URL with Playwright and return page HTML.

        Args:
            url: Target URL.
            proxy_url: Optional proxy URL; None for direct connection.

        Returns:
            Page HTML string, or None on block/failure.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright not installed")
            return None

        pw = None
        browser = None
        try:
            pw = await async_playwright().__aenter__()

            launch_args: dict[str, Any] = {
                "headless": True,
                "args": [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                ],
            }
            if proxy_url:
                launch_args["proxy"] = {"server": proxy_url}

            browser = await pw.chromium.launch(**launch_args)
            context = await browser.new_context(
                locale="en-US",
                timezone_id="America/Chicago",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            page = await context.new_page()
            await apply_stealth(page)

            logger.debug(f"[{self.source_name}] Navigating to {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)

            # Conservative initial delay
            await human_delay(_MIN_DELAY, _MAX_DELAY)

            blocked, reason = await is_blocked_async(page)
            if blocked:
                logger.warning(f"[{self.source_name}] Blocked on load: {reason}")
                return None

            # Wait for dynamic content
            try:
                await page.wait_for_selector(
                    "[class*='JobCard'], [class*='job-card'], .entity-result",
                    timeout=20000,
                )
            except Exception:
                logger.debug(f"[{self.source_name}] Job card selector timed out — continuing")

            await random_scroll(page)
            await human_delay(_MIN_DELAY / 2, _MIN_DELAY)

            html = await page.content()
            return html

        except Exception as exc:
            logger.error(f"[{self.source_name}] Playwright error: {exc}")
            return None
        finally:
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            if pw:
                try:
                    await pw.__aexit__(None, None, None)
                except Exception:
                    pass

    def _parse_jobs(self, html: str, base_url: str) -> list[dict]:
        """
        Parse job listings from Crunchbase rendered HTML.

        Args:
            html: Rendered page HTML.
            base_url: Base URL for resolving relative links.

        Returns:
            List of normalized job dicts.
        """
        soup = BeautifulSoup(html, "lxml")

        # Try known Crunchbase job card patterns
        card_selectors = [
            "[class*='JobCard']",
            "[class*='job-card']",
            ".entity-result",
            "[class*='EntityCard']",
            "tr.mat-row",
        ]

        job_cards: list[Tag] = []
        for sel in card_selectors:
            job_cards = soup.select(sel)
            if len(job_cards) > 1:
                logger.debug(f"[{self.source_name}] Found {len(job_cards)} cards with '{sel}'")
                break

        if not job_cards:
            logger.warning(f"[{self.source_name}] No job cards found in HTML")
            return []

        jobs: list[dict] = []
        for card in job_cards:
            try:
                job = self._extract_card(card, base_url)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug(f"[{self.source_name}] Card error: {exc}")

        return jobs

    def _extract_card(self, card: Tag, base_url: str) -> Optional[dict]:
        """Extract job info from a single Crunchbase card element."""
        # Title — try common patterns
        title_el = (
            card.select_one("[class*='title']")
            or card.select_one("[class*='role']")
            or card.select_one("[class*='job-title']")
            or card.find("h3")
            or card.find("h2")
        )
        title = title_el.get_text(strip=True) if title_el else ""

        # Company
        company_el = (
            card.select_one("[class*='company']")
            or card.select_one("[class*='organization']")
            or card.select_one("[class*='entity-name']")
        )
        company = company_el.get_text(strip=True) if company_el else ""

        # Location
        location_el = card.select_one("[class*='location']")
        location = location_el.get_text(strip=True) if location_el else "Remote"

        # URL
        link_el = card.find("a", href=True)
        url = ""
        if link_el:
            url = self._make_absolute_url(str(link_el["href"]), "https://www.crunchbase.com")

        if not title or not url:
            return None

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "location": location,
            "description": card.get_text(separator=" ", strip=True),
        }
        return self._normalize_job(raw)
