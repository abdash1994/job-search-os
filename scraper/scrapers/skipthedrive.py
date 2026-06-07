"""
SkipTheDrive scraper — HTML-based using httpx + BeautifulSoup.

Fetches the homepage job listings from skipthedrive.com.
"""

from __future__ import annotations

from typing import Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from base.base_scraper import BaseScraper


class SkipTheDriveScraper(BaseScraper):
    """Scrapes remote job listings from skipthedrive.com."""

    async def scrape(self) -> list[dict]:
        """
        Fetch SkipTheDrive job listings page and extract all jobs.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://www.skipthedrive.com/")
        selectors: dict = self.config.get("selectors", {})
        base_url: str = self.config.get("url", "https://www.skipthedrive.com")

        logger.info(f"[{self.source_name}] Fetching {jobs_url}")
        html = await self._fetch_html(jobs_url)
        if not html:
            logger.warning(f"[{self.source_name}] No HTML returned")
            return []

        soup = BeautifulSoup(html, "lxml")
        job_list_selector = selectors.get("job_list", ".job-listing, .listing-item")

        job_cards: list[Tag] = []
        for sel in job_list_selector.split(","):
            cards = soup.select(sel.strip())
            if cards:
                job_cards.extend(cards)

        # Deduplicate by element id
        seen_ids: set[int] = set()
        unique_cards: list[Tag] = []
        for card in job_cards:
            card_id = id(card)
            if card_id not in seen_ids:
                seen_ids.add(card_id)
                unique_cards.append(card)
        job_cards = unique_cards

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
        """Extract job fields from a single SkipTheDrive listing element."""
        title = self._select_text(card, selectors.get("title", "h2 a, h3 a"))
        company = self._select_text(card, selectors.get("company", ".company"))
        location = self._select_text(card, selectors.get("location", ".location"))

        url = ""
        url_sel = selectors.get("url", "h2 a, h3 a")
        url_el = self._select_first(card, url_sel)
        if url_el:
            href = url_el.get("href", "")
            url = self._make_absolute_url(str(href), base_url)

        if not title or not url:
            return None

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "location": location or "Remote",
            "description": card.get_text(separator=" ", strip=True),
        }
        return self._normalize_job(raw)

    def _select_text(self, element: Tag, selector: str) -> str:
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found.get_text(strip=True)
        return ""

    def _select_first(self, element: Tag, selector: str) -> Optional[Tag]:
        for sel in selector.split(","):
            found = element.select_one(sel.strip())
            if found:
                return found
        return None
