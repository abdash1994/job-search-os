"""
We Work Remotely scraper — RSS feed-based.

Parses all configured RSS feeds (full-stack, back-end, front-end,
devops, design, product, sales, support, management) using feedparser.
"""

from __future__ import annotations

import asyncio
from typing import Any

import feedparser
from loguru import logger

from base.base_scraper import BaseScraper


class WeWorkRemotelyScraper(BaseScraper):
    """Scrapes job listings from weworkremotely.com via RSS feeds."""

    async def scrape(self) -> list[dict]:
        """
        Parse all RSS feed URLs configured for We Work Remotely.

        Returns:
            List of normalized job dicts.
        """
        rss_feeds: list[str] = self.config.get("rss_feeds", [])
        if not rss_feeds:
            logger.warning(f"[{self.source_name}] No RSS feeds configured")
            return []

        logger.info(f"[{self.source_name}] Scraping {len(rss_feeds)} RSS feeds")

        all_jobs: list[dict] = []
        for feed_url in rss_feeds:
            jobs = await self._parse_feed(feed_url)
            all_jobs.extend(jobs)
            await asyncio.sleep(self.rate_limit)

        logger.info(f"[{self.source_name}] Found {len(all_jobs)} total jobs")
        return all_jobs

    async def _parse_feed(self, feed_url: str) -> list[dict]:
        """
        Parse a single RSS feed URL and return normalized jobs.

        Args:
            feed_url: Full URL to the RSS feed.

        Returns:
            List of normalized job dicts.
        """
        try:
            # feedparser is synchronous — run in executor to avoid blocking event loop
            loop = asyncio.get_event_loop()
            feed = await loop.run_in_executor(None, feedparser.parse, feed_url)
        except Exception as exc:
            logger.error(f"[{self.source_name}] Failed to parse feed {feed_url}: {exc}")
            return []

        if feed.bozo and feed.bozo_exception:
            logger.warning(
                f"[{self.source_name}] Feed parse warning for {feed_url}: {feed.bozo_exception}"
            )

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
        Convert a feedparser entry to a normalized job dict.

        Args:
            entry: feedparser entry object.

        Returns:
            Normalized job dict, or None if title/link are missing.
        """
        title: str = getattr(entry, "title", "") or ""
        link: str = getattr(entry, "link", "") or ""

        if not title or not link:
            return None

        # WWR title format: "Company: Job Title at Region"
        company = ""
        job_title = title
        if ":" in title:
            parts = title.split(":", 1)
            company = parts[0].strip()
            job_title = parts[1].strip()

        # Extract description — prefer summary with HTML stripped
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
            from datetime import datetime, timezone
            try:
                posted_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass

        # Determine category/location from feed tags
        tags = getattr(entry, "tags", [])
        tag_terms = [t.get("term", "") for t in tags if isinstance(t, dict)]
        location = "Remote"
        for tag in tag_terms:
            if any(c in tag for c in ("USA", "US", "UK", "Europe", "Worldwide")):
                location = tag
                break

        raw = {
            "title": job_title,
            "company": company,
            "url": link,
            "description": description,
            "location": location,
            "posted_at": posted_at,
            "tags": tag_terms,
        }
        return self._normalize_job(raw)
