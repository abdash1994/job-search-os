"""
NoDesk scraper — HTML-based using httpx + BeautifulSoup.

Fetches the jobs listing page and extracts job cards
using CSS selectors from the site config.
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag
from loguru import logger

from base.base_scraper import BaseScraper


class NoDeskScraper(BaseScraper):
    """Scrapes remote job listings from nodesk.co."""

    async def scrape(self) -> list[dict]:
        """
        Fetch the NoDesk jobs page and extract all job listings.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://nodesk.co/remote-jobs/")
        selectors: dict = self.config.get("selectors", {})
        base_url: str = self.config.get("url", "https://nodesk.co")

        logger.info(f"[{self.source_name}] Fetching {jobs_url}")
        html = await self._fetch_html(jobs_url)
        if not html:
            logger.warning(f"[{self.source_name}] No HTML returned")
            return []

        soup = BeautifulSoup(html, "lxml")
        job_list_selector = selectors.get("job_list", "article.job")

        # BeautifulSoup doesn't support comma-separated selectors in all parsers;
        # split and try each
        job_cards: list[Tag] = []
        for sel in job_list_selector.split(","):
            job_cards = soup.select(sel.strip())
            if job_cards:
                break

        logger.info(f"[{self.source_name}] Found {len(job_cards)} job cards")

        jobs: list[dict] = []
        for card in job_cards:
            try:
                job = self._extract_job(card, selectors, base_url)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug(f"[{self.source_name}] Skipping card: {exc}")

        logger.info(f"[{self.source_name}] Extracted {len(jobs)} valid jobs")
        return jobs

    def _extract_job(
        self,
        card: Tag,
        selectors: dict[str, str],
        base_url: str,
    ) -> Optional[dict]:
        """
        Extract job fields from a single BeautifulSoup Tag.

        Args:
            card: The job card Tag element.
            selectors: CSS selector mapping from sites.yaml.
            base_url: Site base URL for resolving relative links.

        Returns:
            Normalized job dict, or None if essential fields are missing.
        """
        title = self._select_text(card, selectors.get("title", "h2 a"))
        company = self._select_text(card, selectors.get("company", ".company"))
        location = self._select_text(card, selectors.get("location", ".location"))

        # URL — get href from the title anchor
        url = ""
        url_selector = selectors.get("url", "h2 a")
        url_el = self._select_first(card, url_selector)
        if url_el:
            href = url_el.get("href", "")
            url = self._make_absolute_url(str(href), base_url)

        if not title or not url:
            return None

        # Posted date from <time> element
        posted_at = None
        time_el = card.find("time")
        if time_el:
            posted_at = time_el.get("datetime") or time_el.get_text(strip=True)

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "location": location or "Remote",
            "description": card.get_text(separator=" ", strip=True),
            "posted_at": posted_at,
        }
        return self._normalize_job(raw)

    def _select_text(self, element: Tag, selector: str) -> str:
        """Return stripped text from first match of a CSS selector, or empty string."""
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found.get_text(strip=True)
        return ""

    def _select_first(self, element: Tag, selector: str) -> Optional[Tag]:
        """Return first matching Tag for a comma-separated selector list."""
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found
        return None
