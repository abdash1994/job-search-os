"""
Top Startups scraper — HTML-based using httpx + BeautifulSoup.

Fetches startup job listings from topstartups.io.
"""

from __future__ import annotations

from typing import Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from base.base_scraper import BaseScraper


class TopStartupsScraper(BaseScraper):
    """Scrapes job listings from topstartups.io startup directory."""

    async def scrape(self) -> list[dict]:
        """
        Fetch Top Startups job listings page and extract all startup job cards.

        Returns:
            List of normalized job dicts.
        """
        jobs_url: str = self.config.get(
            "jobs_url",
            "https://topstartups.io/?industry=&hq=&size=&stage=&investor=&founded=",
        )
        selectors: dict = self.config.get("selectors", {})
        base_url: str = self.config.get("url", "https://topstartups.io")

        logger.info(f"[{self.source_name}] Fetching {jobs_url}")
        html = await self._fetch_html(jobs_url)
        if not html:
            logger.warning(f"[{self.source_name}] No HTML returned")
            return []

        soup = BeautifulSoup(html, "lxml")
        job_list_selector = selectors.get("job_list", ".startup-card, .company-card")

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

        logger.info(f"[{self.source_name}] Found {len(unique_cards)} startup cards")

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
        """
        Extract job listing info from a startup card.

        For topstartups.io, each card represents a startup rather than a
        specific job posting. We capture the startup as a "company hiring" entry.
        """
        company = self._select_text(card, selectors.get("company", ".startup-name, h3"))
        title = self._select_text(card, selectors.get("title", "h3 a, .startup-name a"))
        location = self._select_text(card, selectors.get("location", ".location, .hq"))

        # Title may be empty when company is the main headline
        if not title and company:
            title = f"Jobs at {company}"

        url = ""
        url_sel = selectors.get("url", "a.view-jobs")
        url_el = self._select_first(card, url_sel)
        if url_el:
            href = url_el.get("href", "")
            url = self._make_absolute_url(str(href), base_url)

        # Fallback to any <a> in the card
        if not url:
            any_a = card.find("a")
            if any_a:
                href = any_a.get("href", "")
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
