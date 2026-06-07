"""
Deduplication utilities for job listings.

Provides URL-based deduplication and content fingerprinting
to prevent storing duplicate jobs across scraper runs.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from loguru import logger


class Deduplicator:
    """
    Deduplicates job listings using URL matching and content fingerprinting.

    Supports both in-memory set operations and Supabase-backed persistence.
    """

    def is_duplicate(self, job_url: str, existing_urls_set: set[str]) -> bool:
        """
        Check whether a job URL already exists in a set of known URLs.

        Normalizes the URL before comparison (strips trailing slashes,
        lowercases scheme/host).

        Args:
            job_url: The job URL to check.
            existing_urls_set: Set of already-known URLs.

        Returns:
            True if the URL is a duplicate.
        """
        normalized = self._normalize_url(job_url)
        return normalized in existing_urls_set

    def generate_fingerprint(self, job: dict[str, Any]) -> str:
        """
        Generate a content-based fingerprint for a job.

        Uses a hash of (title + company + url) — all normalized to lowercase.
        Useful for detecting duplicate jobs that appear at different URLs
        (e.g., job posted on multiple boards).

        Args:
            job: Normalized job dict.

        Returns:
            Hex string MD5 fingerprint.
        """
        title = (job.get("title", "") or "").lower().strip()
        company = (job.get("company", "") or "").lower().strip()
        url = self._normalize_url(job.get("url", "") or "")

        # Normalize whitespace
        title = re.sub(r"\s+", " ", title)
        company = re.sub(r"\s+", " ", company)

        content = f"{title}|{company}|{url}"
        return hashlib.md5(content.encode("utf-8")).hexdigest()

    async def filter_new(
        self,
        jobs: list[dict[str, Any]],
        supabase_client: Any,
    ) -> list[dict[str, Any]]:
        """
        Filter a list of jobs to only those not already in Supabase.

        Queries the `jobs` table for all existing URLs, then returns
        only the jobs whose URL is not already stored.

        Args:
            jobs: List of normalized job dicts to filter.
            supabase_client: Initialized Supabase client.

        Returns:
            Subset of input jobs that are not yet in the database.
        """
        if not jobs:
            return []

        # Fetch existing URLs in batch
        existing_urls: set[str] = set()
        try:
            result = (
                supabase_client
                .table("jobs")
                .select("url")
                .execute()
            )
            for row in result.data or []:
                url = row.get("url", "")
                if url:
                    existing_urls.add(self._normalize_url(url))

            logger.debug(f"Deduplicator: loaded {len(existing_urls)} existing URLs from Supabase")
        except Exception as exc:
            logger.error(f"Deduplicator: failed to load existing URLs: {exc}")
            # Proceed without dedup rather than crashing the pipeline
            return jobs

        new_jobs: list[dict] = []
        seen_in_batch: set[str] = set()

        for job in jobs:
            url = job.get("url", "") or ""
            normalized = self._normalize_url(url)

            if not normalized:
                continue

            # Check both DB and within current batch
            if normalized not in existing_urls and normalized not in seen_in_batch:
                new_jobs.append(job)
                seen_in_batch.add(normalized)

        logger.info(
            f"Deduplicator: {len(jobs)} total → {len(new_jobs)} new "
            f"({len(jobs) - len(new_jobs)} duplicates filtered)"
        )
        return new_jobs

    def filter_batch_duplicates(
        self, jobs: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Remove duplicates within a single batch of jobs (no DB call).

        Uses URL normalization as the primary key. Fingerprints are used
        as a secondary check.

        Args:
            jobs: List of normalized job dicts.

        Returns:
            Deduplicated list.
        """
        seen_urls: set[str] = set()
        seen_fingerprints: set[str] = set()
        result: list[dict] = []

        for job in jobs:
            url = self._normalize_url(job.get("url", "") or "")
            fp = self.generate_fingerprint(job)

            if url in seen_urls or fp in seen_fingerprints:
                continue

            seen_urls.add(url)
            seen_fingerprints.add(fp)
            result.append(job)

        return result

    @staticmethod
    def _normalize_url(url: str) -> str:
        """
        Normalize a URL for comparison.

        Lowercases scheme and host, strips trailing slashes and
        common tracking parameters.

        Args:
            url: Raw URL string.

        Returns:
            Normalized URL string.
        """
        if not url:
            return ""

        url = url.strip()

        # Strip common UTM/tracking params
        url = re.sub(r"[?&](utm_[^&]*)(&|$)", "", url)
        url = re.sub(r"[?&](ref=[^&]*)(&|$)", "", url)
        url = url.rstrip("?&")

        # Normalize trailing slash
        url = url.rstrip("/")

        # Lowercase scheme + host
        if "://" in url:
            scheme, rest = url.split("://", 1)
            if "/" in rest:
                host, path = rest.split("/", 1)
                url = f"{scheme.lower()}://{host.lower()}/{path}"
            else:
                url = f"{scheme.lower()}://{rest.lower()}"

        return url
