"""
Remote100K scraper — HTML-based using httpx + BeautifulSoup.

Targets high-paying remote job listings from remote100k.com.
"""

from __future__ import annotations

from typing import Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from base.base_scraper import BaseScraper


class Remote100KScraper(BaseScraper):
    """Scrapes high-salary remote job listings from remote100k.com."""

    async def scrape(self) -> list[dict]:
        """
        Fetch the Remote100K homepage and extract all job listings.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://remote100k.com/")
        selectors: dict = self.config.get("selectors", {})
        base_url: str = self.config.get("url", "https://remote100k.com")

        logger.info(f"[{self.source_name}] Fetching {jobs_url}")
        html = await self._fetch_html(jobs_url)
        if not html:
            logger.warning(f"[{self.source_name}] No HTML returned")
            return []

        soup = BeautifulSoup(html, "lxml")
        job_list_selector = selectors.get("job_list", "div.job-card, article")

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
        """Extract job fields from a single job card element."""
        title = self._select_text(card, selectors.get("title", "h2, h3"))
        company = self._select_text(card, selectors.get("company", ".company-name, .company"))
        location = self._select_text(card, selectors.get("location", ".location, .remote-location"))
        salary_text = self._select_text(card, selectors.get("salary", ".salary"))

        # URL extraction
        url = ""
        url_sel = selectors.get("url", "a")
        url_el = self._select_first(card, url_sel)
        if url_el:
            href = url_el.get("href", "")
            url = self._make_absolute_url(str(href), base_url)

        # Fallback: try the card itself as a link
        if not url:
            href = card.get("href") or ""
            if href:
                url = self._make_absolute_url(str(href), base_url)

        if not title or not url:
            return None

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "location": location or "Remote",
            "salary": salary_text,
            "description": card.get_text(separator=" ", strip=True),
        }
        return self._normalize_job(raw)

    def _select_text(self, element: Tag, selector: str) -> str:
        """Return stripped text from first match of a comma-separated CSS selector."""
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found.get_text(strip=True)
        return ""

    def _select_first(self, element: Tag, selector: str) -> Optional[Tag]:
        """Return first matching Tag for a comma-separated selector."""
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found
        return None
