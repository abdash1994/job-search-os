"""
Job data normalization pipeline.

Cleans and standardizes text fields, job types, countries,
and dates across all scraped job listings.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bs4 import BeautifulSoup
from dateutil import parser as dateutil_parser
from loguru import logger

# ---------------------------------------------------------------------------
# Job type normalization map
# ---------------------------------------------------------------------------
_JOB_TYPE_MAP: dict[str, str] = {
    # Full-time variants
    "full time": "full-time",
    "full-time": "full-time",
    "fulltime": "full-time",
    "permanent": "full-time",
    "regular": "full-time",
    "salaried": "full-time",
    # Contract variants
    "contract": "contract",
    "contractor": "contract",
    "freelance": "contract",
    "consulting": "contract",
    "temp": "contract",
    "temporary": "contract",
    "fixed term": "contract",
    "fixed-term": "contract",
    # Part-time variants
    "part time": "part-time",
    "part-time": "part-time",
    "parttime": "part-time",
    "hourly": "part-time",
    # Internship variants
    "internship": "internship",
    "intern": "internship",
    "co-op": "internship",
    "coop": "internship",
    "apprenticeship": "internship",
    "graduate": "internship",
    "trainee": "internship",
}

# ---------------------------------------------------------------------------
# Country normalization map (common variations → ISO name)
# ---------------------------------------------------------------------------
_COUNTRY_MAP: dict[str, str] = {
    # United States
    "us": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "america": "United States",
    # United Kingdom
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "gb": "United Kingdom",
    "great britain": "United Kingdom",
    "england": "United Kingdom",
    "britain": "United Kingdom",
    # Canada
    "ca": "Canada",
    "canada": "Canada",
    # Australia
    "au": "Australia",
    "aus": "Australia",
    "australia": "Australia",
    # Germany
    "de": "Germany",
    "germany": "Germany",
    "deutschland": "Germany",
    # France
    "fr": "France",
    "france": "France",
    # Spain
    "es": "Spain",
    "spain": "Spain",
    # Brazil
    "br": "Brazil",
    "brazil": "Brazil",
    "brasil": "Brazil",
    # India
    "in": "India",
    "india": "India",
    # Netherlands
    "nl": "Netherlands",
    "netherlands": "Netherlands",
    "the netherlands": "Netherlands",
    # Poland
    "pl": "Poland",
    "poland": "Poland",
    # Portugal
    "pt": "Portugal",
    "portugal": "Portugal",
    # Singapore
    "sg": "Singapore",
    "singapore": "Singapore",
    # Other special values
    "worldwide": "Worldwide",
    "global": "Worldwide",
    "anywhere": "Worldwide",
    "remote": "Remote",
    "europe": "Europe",
    "latam": "Latin America",
    "latin america": "Latin America",
    "apac": "Asia Pacific",
    "asia pacific": "Asia Pacific",
    "emea": "EMEA",
}

# Relative date patterns: "3d", "2 weeks ago", "1 month ago", etc.
_RELATIVE_PATTERNS = [
    (re.compile(r"(\d+)\s*(second|sec)s?\s*(ago)?", re.I), "seconds"),
    (re.compile(r"(\d+)\s*(minute|min)s?\s*(ago)?", re.I), "minutes"),
    (re.compile(r"(\d+)\s*(hour|hr)s?\s*(ago)?", re.I), "hours"),
    (re.compile(r"(\d+)\s*(day|d)s?\s*(ago)?", re.I), "days"),
    (re.compile(r"(\d+)\s*(week|wk)s?\s*(ago)?", re.I), "weeks"),
    (re.compile(r"(\d+)\s*(month|mo)s?\s*(ago)?", re.I), "months"),
    (re.compile(r"(\d+)\s*(year|yr)s?\s*(ago)?", re.I), "years"),
    # Short forms: "3d", "2w", "1mo"
    (re.compile(r"^(\d+)d$", re.I), "days"),
    (re.compile(r"^(\d+)w$", re.I), "weeks"),
    (re.compile(r"^(\d+)mo$", re.I), "months"),
    (re.compile(r"^(\d+)h$", re.I), "hours"),
]


class Normalizer:
    """
    Normalizes raw scraped job data into consistent, clean values.

    Handles text cleaning, job type mapping, country normalization,
    and date parsing/conversion.
    """

    def clean_text(self, text: str) -> str:
        """
        Strip HTML tags and normalize whitespace from text.

        Args:
            text: Raw text that may contain HTML markup.

        Returns:
            Clean plain-text string.
        """
        if not text:
            return ""

        # Strip HTML
        if "<" in text and ">" in text:
            soup = BeautifulSoup(text, "lxml")
            text = soup.get_text(separator=" ")

        # Normalize whitespace
        text = re.sub(r"[\r\n\t]+", " ", text)
        text = re.sub(r"\s{2,}", " ", text)
        text = text.strip()

        # Remove zero-width characters
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)

        return text

    def normalize_job_type(self, text: str) -> str:
        """
        Map raw job type text to a standard value.

        Standard values: "full-time", "contract", "part-time", "internship".

        Args:
            text: Raw job type string from scraper.

        Returns:
            Standardized job type, defaults to "full-time" if unrecognized.
        """
        if not text:
            return "full-time"

        lower = text.lower().strip()

        # Direct match
        if lower in _JOB_TYPE_MAP:
            return _JOB_TYPE_MAP[lower]

        # Substring match
        for key, value in _JOB_TYPE_MAP.items():
            if key in lower:
                return value

        return "full-time"

    def normalize_country(self, text: str) -> str:
        """
        Map country name variations and abbreviations to ISO country names.

        Args:
            text: Raw country or location string.

        Returns:
            Normalized country name string.
        """
        if not text:
            return ""

        lower = text.lower().strip()

        # Direct match
        if lower in _COUNTRY_MAP:
            return _COUNTRY_MAP[lower]

        # Substring match for embedded country names
        for key, value in _COUNTRY_MAP.items():
            if len(key) > 2 and key in lower:  # Skip 2-char codes to avoid false matches
                return value

        return text.strip()

    def normalize_date(self, text: str) -> Optional[str]:
        """
        Convert relative ("3d ago", "2 weeks ago") and absolute date strings
        to ISO 8601 datetime strings in UTC.

        Args:
            text: Raw date string from scraper.

        Returns:
            ISO 8601 datetime string (e.g. "2024-05-01T12:00:00+00:00"),
            or None if parsing fails.
        """
        if not text:
            return None

        text = text.strip()
        now = datetime.now(timezone.utc)

        # Try relative date patterns
        for pattern, unit in _RELATIVE_PATTERNS:
            match = pattern.search(text)
            if match:
                amount = int(match.group(1))
                try:
                    if unit == "seconds":
                        dt = now - timedelta(seconds=amount)
                    elif unit == "minutes":
                        dt = now - timedelta(minutes=amount)
                    elif unit == "hours":
                        dt = now - timedelta(hours=amount)
                    elif unit == "days":
                        dt = now - timedelta(days=amount)
                    elif unit == "weeks":
                        dt = now - timedelta(weeks=amount)
                    elif unit == "months":
                        dt = now - timedelta(days=amount * 30)
                    elif unit == "years":
                        dt = now - timedelta(days=amount * 365)
                    else:
                        continue
                    return dt.isoformat()
                except Exception:
                    continue

        # Handle "just now", "today"
        lower = text.lower()
        if lower in ("just now", "just posted", "moments ago"):
            return now.isoformat()
        if lower == "today":
            return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        if lower == "yesterday":
            return (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Try ISO 8601 first
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except (ValueError, TypeError):
            pass

        # Fallback: dateutil parser for natural language dates
        try:
            dt = dateutil_parser.parse(text, default=now)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass

        logger.debug(f"Normalizer: could not parse date '{text}'")
        return None

    def normalize_pipeline(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Run all normalizations on a list of job dicts in place.

        Applies clean_text to description, normalize_job_type to job_type,
        normalize_country to country, and normalize_date to posted_at.

        Args:
            jobs: List of job dicts to normalize.

        Returns:
            The same list with fields normalized in-place.
        """
        normalized: list[dict] = []
        for job in jobs:
            try:
                normalized_job = dict(job)

                # Clean text fields
                normalized_job["description"] = self.clean_text(
                    job.get("description", "") or ""
                )
                normalized_job["title"] = self.clean_text(job.get("title", "") or "")
                normalized_job["company"] = self.clean_text(job.get("company", "") or "")
                normalized_job["location"] = self.clean_text(job.get("location", "") or "")

                # Normalize job type
                normalized_job["job_type"] = self.normalize_job_type(
                    job.get("job_type", "") or ""
                )

                # Normalize country
                raw_country = job.get("country", "") or ""
                if raw_country:
                    normalized_job["country"] = self.normalize_country(raw_country)

                # If no country but location contains hints, try extracting
                if not normalized_job.get("country"):
                    location = normalized_job.get("location", "")
                    if location:
                        normalized_job["country"] = self.normalize_country(location)

                # Normalize date
                raw_date = job.get("posted_at", "") or ""
                if raw_date:
                    parsed = self.normalize_date(str(raw_date))
                    if parsed:
                        normalized_job["posted_at"] = parsed

                normalized.append(normalized_job)
            except Exception as exc:
                logger.debug(f"Normalizer: skipping job due to error: {exc}")
                normalized.append(job)

        return normalized
