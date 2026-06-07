"""
Working Nomads scraper — JSON API-based.

Hits the public /api/exposed_jobs/ endpoint and maps API fields
to the normalized job schema.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from loguru import logger

from base.base_scraper import BaseScraper


class WorkingNomadsScraper(BaseScraper):
    """Scrapes job listings from workingnomads.com via public JSON API."""

    async def scrape(self) -> list[dict]:
        """
        Fetch all jobs from the Working Nomads API.

        Returns:
            List of normalized job dicts.
        """
        api_url: str = self.config.get("api_url", "https://www.workingnomads.com/api/exposed_jobs/")
        logger.info(f"[{self.source_name}] Fetching API: {api_url}")

        data = await self._fetch_json(api_url)
        if not data:
            logger.warning(f"[{self.source_name}] No data returned from API")
            return []

        # API returns a list directly
        entries: list[dict] = data if isinstance(data, list) else data.get("results", [])
        logger.info(f"[{self.source_name}] API returned {len(entries)} jobs")

        jobs: list[dict] = []
        for entry in entries:
            try:
                job = self._map_entry(entry)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug(f"[{self.source_name}] Skipping entry: {exc}")

        logger.info(f"[{self.source_name}] Normalized {len(jobs)} jobs")
        return jobs

    def _map_entry(self, entry: dict[str, Any]) -> Optional[dict]:
        """
        Map a Working Nomads API response entry to the normalized schema.

        API fields reference:
          id, title, company_name, url, description, location,
          pub_date, category, salary, tags

        Args:
            entry: Raw API response dict.

        Returns:
            Normalized job dict, or None if required fields are missing.
        """
        title: str = entry.get("title", "") or ""
        url: str = entry.get("url", "") or entry.get("apply_url", "") or ""

        if not title or not url:
            return None

        company: str = entry.get("company_name", "") or entry.get("company", "") or ""
        description: str = self._strip_html(entry.get("description", "") or "")
        location: str = entry.get("location", "") or "Remote"
        salary_raw: str = str(entry.get("salary", "") or "")

        # Parse pub_date — API returns ISO-8601 strings
        posted_at: Optional[str] = None
        pub_date = entry.get("pub_date", "")
        if pub_date:
            try:
                dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                posted_at = dt.isoformat()
            except (ValueError, TypeError):
                pass

        # Category mapping to job type
        category: str = entry.get("category", "") or ""
        job_type = "full-time"
        if "contract" in category.lower() or "freelance" in category.lower():
            job_type = "contract"
        elif "part" in category.lower():
            job_type = "part-time"

        raw = {
            "title": title,
            "company": company,
            "url": url,
            "description": description,
            "location": location,
            "salary": salary_raw,
            "job_type": job_type,
            "posted_at": posted_at,
            "category": category,
        }
        return self._normalize_job(raw)
