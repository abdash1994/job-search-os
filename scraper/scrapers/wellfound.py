"""
Wellfound (formerly AngelList Talent) scraper — Playwright-based.

Uses stealth mode and human-like interaction since Wellfound
is a React SPA that requires JavaScript rendering.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from anti_detect.stealth import apply_stealth, human_delay, is_blocked_async, random_scroll
from base.base_scraper import BaseScraper
from proxy.fetcher import get_tor_proxy


class WellfoundScraper(BaseScraper):
    """Scrapes job listings from wellfound.com using Playwright with stealth."""

    async def scrape(self) -> list[dict]:
        """
        Fetch Wellfound jobs page via Playwright, with up to 3 block-rotation retries.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://wellfound.com/jobs")
        logger.info(f"[{self.source_name}] Starting Playwright scrape of {jobs_url}")

        proxy_url: Optional[str] = None
        if self.config.get("use_proxy") and self.proxy_pool:
            proxy_url = self.proxy_pool.get_proxy()

        for attempt in range(3):
            html = await self._scrape_with_playwright(jobs_url, proxy_url)
            if html:
                jobs = self._parse_jobs(html, jobs_url)
                logger.info(
                    f"[{self.source_name}] Extracted {len(jobs)} jobs (attempt {attempt+1})"
                )
                return jobs

            logger.warning(
                f"[{self.source_name}] Attempt {attempt+1} failed — rotating proxy"
            )
            if self.proxy_pool:
                if proxy_url:
                    self.proxy_pool.mark_failure(proxy_url)
                proxy_url = self.proxy_pool.rotate()
            await asyncio.sleep(self.rate_limit * 2)

        logger.error(f"[{self.source_name}] All 3 attempts failed")
        return []

    async def _scrape_with_playwright(
        self,
        url: str,
        proxy_url: Optional[str],
    ) -> Optional[str]:
        """
        Launch Playwright, apply stealth, navigate and extract HTML.

        Args:
            url: Target URL to scrape.
            proxy_url: Optional proxy URL to use.

        Returns:
            Page HTML string, or None on failure/block.
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
                ],
            }
            if proxy_url:
                launch_args["proxy"] = {"server": proxy_url}

            browser = await pw.chromium.launch(**launch_args)
            context = await browser.new_context(
                locale="en-US",
                timezone_id="America/New_York",
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            page = await context.new_page()
            await apply_stealth(page)

            await page.goto(url, wait_until="networkidle", timeout=45000)
            await human_delay(3, 7)

            # Check for block immediately after load
            blocked, reason = await is_blocked_async(page)
            if blocked:
                logger.warning(f"[{self.source_name}] Blocked: {reason}")
                return None

            # Wait for job cards to load
            try:
                await page.wait_for_selector(
                    "[data-test='StartupResult'], .job-listing, [class*='JobSearchResult']",
                    timeout=15000,
                )
            except Exception:
                logger.debug(f"[{self.source_name}] Primary job selector not found — continuing anyway")

            await random_scroll(page)
            await human_delay(2, 4)

            # Scroll to load more jobs (infinite scroll or lazy load)
            await self._scroll_to_load_more(page)

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

    async def _scroll_to_load_more(self, page: Any) -> None:
        """Scroll down incrementally to trigger lazy-loading of additional job cards."""
        for _ in range(5):
            try:
                prev_height = await page.evaluate("document.body.scrollHeight")
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(2)
                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height == prev_height:
                    break
            except Exception:
                break

    def _parse_jobs(self, html: str, base_url: str) -> list[dict]:
        """
        Parse job listings from rendered Wellfound HTML.

        Tries multiple selector strategies since Wellfound's class names
        may vary with deployments.

        Args:
            html: Rendered page HTML.
            base_url: Base URL for resolving relative links.

        Returns:
            List of normalized job dicts.
        """
        soup = BeautifulSoup(html, "lxml")

        # Try multiple known selector patterns
        card_selectors = [
            "[data-test='StartupResult']",
            "[class*='JobSearchResult']",
            "[class*='job-listing']",
            ".styles_component__",
            "div[class*='StartupResult']",
            "li[class*='job']",
        ]

        job_cards: list[Tag] = []
        for sel in card_selectors:
            job_cards = soup.select(sel)
            if len(job_cards) > 2:
                logger.debug(f"[{self.source_name}] Found {len(job_cards)} cards with '{sel}'")
                break

        if not job_cards:
            logger.warning(f"[{self.source_name}] Could not find job cards in HTML")
            return []

        jobs: list[dict] = []
        for card in job_cards:
            try:
                job = self._extract_card(card, base_url)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug(f"[{self.source_name}] Card extraction error: {exc}")

        return jobs

    def _extract_card(self, card: Tag, base_url: str) -> Optional[dict]:
        """Extract job info from a single Wellfound job card."""
        # Title
        title_el = (
            card.find("h2")
            or card.find("h3")
            or card.select_one("[class*='title']")
            or card.select_one("[class*='role']")
        )
        title = title_el.get_text(strip=True) if title_el else ""

        # Company
        company_el = card.select_one(
            "[class*='company'], [class*='startup'], [data-test='startup-name']"
        )
        company = company_el.get_text(strip=True) if company_el else ""

        # Location
        location_el = card.select_one("[class*='location'], [class*='remote']")
        location = location_el.get_text(strip=True) if location_el else "Remote"

        # Salary
        salary_el = card.select_one("[class*='salary'], [class*='compensation']")
        salary_text = salary_el.get_text(strip=True) if salary_el else ""

        # URL
        link_el = card.find("a", href=True)
        url = ""
        if link_el:
            url = self._make_absolute_url(str(link_el["href"]), base_url)

        if not title or not url:
            return None

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "location": location,
            "salary": salary_text,
            "description": card.get_text(separator=" ", strip=True),
        }
        return self._normalize_job(raw)
