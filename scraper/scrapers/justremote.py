"""
JustRemote scraper — HTML-based using httpx + BeautifulSoup.

Fetches the remote jobs listing page from justremote.co.
"""

from __future__ import annotations

from typing import Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from base.base_scraper import BaseScraper


class JustRemoteScraper(BaseScraper):
    """Scrapes remote job listings from justremote.co."""

    async def scrape(self) -> list[dict]:
        """
        Fetch JustRemote job listings and extract all jobs.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get("jobs_url", "https://justremote.co/remote-jobs")
        selectors: dict = self.config.get("selectors", {})
        base_url: str = self.config.get("url", "https://justremote.co")

        logger.info(f"[{self.source_name}] Fetching {jobs_url}")
        html = await self._fetch_html(jobs_url)
        if not html:
            logger.warning(f"[{self.source_name}] No HTML returned")
            return []

        soup = BeautifulSoup(html, "lxml")
        job_list_selector = selectors.get("job_list", ".job, .listing")

        job_cards: list[Tag] = []
        for sel in job_list_selector.split(","):
            cards = soup.select(sel.strip())
            if cards:
                job_cards.extend(cards)

        # Deduplicate
        seen_ids: set[int] = set()
        unique_cards: list[Tag] = []
        for card in job_cards:
            if id(card) not in seen_ids:
                seen_ids.add(id(card))
                unique_cards.append(card)

        logger.info(f"[{self.source_name}] Found {len(unique_cards)} job cards")

        jobs: list[dict] = []
        for card in unique_cards:
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
        """Extract job fields from a single JustRemote card element."""
        title = self._select_text(card, selectors.get("title", "h2 a, h3 a, .title a"))
        company = self._select_text(card, selectors.get("company", ".company, .employer"))
        location = self._select_text(card, selectors.get("location", ".location, .country"))

        url = ""
        url_sel = selectors.get("url", "h2 a, h3 a, .title a")
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
