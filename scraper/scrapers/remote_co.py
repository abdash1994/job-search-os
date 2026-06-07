"""
Remote.co scraper — RSS feed-based.

Parses the site's WordPress RSS feed for remote job listings.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

import feedparser
from loguru import logger

from base.base_scraper import BaseScraper


class RemoteCoScraper(BaseScraper):
    """Scrapes job listings from remote.co via RSS feed."""

    async def scrape(self) -> list[dict]:
        """
        Parse all configured RSS feeds for Remote.co.

        Returns:
            List of normalized job dicts.
        """
        rss_feeds: list[str] = self.config.get("rss_feeds", [])
        if not rss_feeds:
            logger.warning(f"[{self.source_name}] No RSS feeds configured")
            return []

        logger.info(f"[{self.source_name}] Scraping {len(rss_feeds)} RSS feed(s)")

        all_jobs: list[dict] = []
        for feed_url in rss_feeds:
            jobs = await self._parse_feed(feed_url)
            all_jobs.extend(jobs)
            await asyncio.sleep(self.rate_limit)

        logger.info(f"[{self.source_name}] Found {len(all_jobs)} total jobs")
        return all_jobs

    async def _parse_feed(self, feed_url: str) -> list[dict]:
        """
        Parse a single RSS feed and extract job entries.

        Args:
            feed_url: Full URL to the RSS feed.

        Returns:
            List of normalized job dicts.
        """
        try:
            loop = asyncio.get_event_loop()
            feed = await loop.run_in_executor(None, feedparser.parse, feed_url)
        except Exception as exc:
            logger.error(f"[{self.source_name}] Failed to parse feed {feed_url}: {exc}")
            return []

        jobs: list[dict] = []
        for entry in feed.entries:
            try:
                job = self._entry_to_job(entry)
                if job:
                    jobs.append(job)
            except Exception as exc:
                logger.debug(f"[{self.source_name}] Skipping malformed entry: {exc}")

        logger.debug(f"[{self.source_name}] {feed_url}: {len(jobs)} jobs")
        return jobs

    def _entry_to_job(self, entry: Any) -> dict | None:
        """
        Convert a feedparser entry from remote.co to a normalized job dict.

        Remote.co RSS format typically has:
          - title: "Job Title at Company Name"
          - link: job detail page URL
          - summary: HTML description
          - published_parsed: time tuple

        Args:
            entry: feedparser entry object.

        Returns:
            Normalized job dict, or None if required fields are missing.
        """
        title: str = getattr(entry, "title", "") or ""
        link: str = getattr(entry, "link", "") or ""

        if not title or not link:
            return None

        # Parse "Job Title at Company Name" format
        company = ""
        job_title = title
        at_match = re.search(r"\s+at\s+(.+)$", title, re.IGNORECASE)
        if at_match:
            company = at_match.group(1).strip()
            job_title = title[: at_match.start()].strip()

        # Strip HTML from description
        description_html = (
            getattr(entry, "summary", "")
            or getattr(entry, "description", "")
            or ""
        )
        description = self._strip_html(description_html)

        # Parse posted date
        published = getattr(entry, "published_parsed", None)
        posted_at = None
        if published:
            try:
                posted_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass

        # Extract categories/tags for location hints
        tags = getattr(entry, "tags", [])
        location_hints = [t.get("term", "") for t in tags if isinstance(t, dict)]
        location = "Remote"
        if location_hints:
            location = location_hints[0]

        raw = {
            "title": job_title,
            "company": company,
            "url": link,
            "description": description,
            "location": location,
            "posted_at": posted_at,
        }
        return self._normalize_job(raw)
