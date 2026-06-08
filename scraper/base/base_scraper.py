"""
Abstract base class for all job scrapers.

Provides shared utilities: HTTP fetching with retry/proxy/UA rotation,
Playwright-based rendering, salary/location/skills extraction, and
job normalization to a standard schema.
"""

from __future__ import annotations

import asyncio
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from anti_detect.stealth import apply_stealth, human_delay, is_blocked, random_scroll
from anti_detect.user_agents import get_ua_headers

# ---------------------------------------------------------------------------
# Tech skill keyword list used across scraper and scoring modules
# ---------------------------------------------------------------------------
TECH_SKILLS: list[str] = [
    # Languages
    "Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C#", "C++", "C",
    "Swift", "Kotlin", "Ruby", "PHP", "Scala", "Elixir", "Haskell", "R", "MATLAB",
    "Bash", "Shell", "PowerShell", "Perl", "Dart",
    # Frontend
    "React", "Vue", "Angular", "Next.js", "Nuxt", "Svelte", "SvelteKit",
    "Tailwind", "CSS", "HTML", "SASS", "SCSS", "Webpack", "Vite", "Redux",
    "GraphQL", "REST", "WebSockets", "Electron", "React Native", "Flutter",
    # Backend
    "Node.js", "Express", "FastAPI", "Django", "Flask", "Spring Boot", "Spring",
    "Rails", "Laravel", "ASP.NET", ".NET", "Gin", "Echo", "NestJS", "Fiber",
    "gRPC", "Actix", "Rocket",
    # Databases
    "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch",
    "Cassandra", "DynamoDB", "Firestore", "Supabase", "PlanetScale",
    "CockroachDB", "ClickHouse", "BigQuery", "Snowflake", "Redshift", "SQL",
    # Cloud & DevOps
    "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Ansible",
    "CI/CD", "GitHub Actions", "Jenkins", "GitLab CI", "CircleCI", "ArgoCD",
    "Helm", "Linux", "Nginx", "Apache", "Cloudflare", "Vercel", "Netlify",
    "Heroku", "DigitalOcean", "Pulumi", "CDK",
    # Data & ML
    "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "Spark",
    "Kafka", "Airflow", "dbt", "Databricks", "MLflow", "Hugging Face",
    "OpenAI", "LangChain", "LlamaIndex", "CUDA", "Jupyter",
    # Mobile
    "iOS", "Android", "Xcode", "Jetpack Compose",
    # Design tools
    "Figma", "Sketch", "Adobe XD", "InVision", "Zeplin",
    # Other
    "Git", "Linux", "Agile", "Scrum", "Jira", "Confluence", "Notion",
    "Microservices", "Event-driven", "WebAssembly", "Wasm", "MQTT",
    "RabbitMQ", "Celery", "Prometheus", "Grafana", "DataDog", "Sentry",
]

# Lowercase set for fast lookup
_SKILLS_LOWER: set[str] = {s.lower() for s in TECH_SKILLS}
# Mapping from lowercase → canonical casing
_SKILLS_CANONICAL: dict[str, str] = {s.lower(): s for s in TECH_SKILLS}

# Salary regex patterns
_SALARY_PATTERNS = [
    # $100k-$150k / $100K-$150K
    re.compile(
        r"[\$£€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*k?\s*[-–to]+\s*[\$£€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*k?",
        re.IGNORECASE,
    ),
    # $120,000 / €85000 / £50k
    re.compile(
        r"([\$£€])\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(k|K)?",
        re.IGNORECASE,
    ),
    # 120000 USD / 85000 EUR
    re.compile(
        r"(\d{4,7})\s*(USD|EUR|GBP|CAD|AUD|INR)",
        re.IGNORECASE,
    ),
]

_CURRENCY_MAP = {"$": "USD", "£": "GBP", "€": "EUR"}

# Country/location keyword mapping
_COUNTRY_KEYWORDS: dict[str, str] = {
    "usa": "United States",
    "us": "United States",
    "united states": "United States",
    "u.s.": "United States",
    "uk": "United Kingdom",
    "united kingdom": "United Kingdom",
    "gb": "United Kingdom",
    "canada": "Canada",
    "ca": "Canada",
    "australia": "Australia",
    "au": "Australia",
    "germany": "Germany",
    "de": "Germany",
    "france": "France",
    "fr": "France",
    "spain": "Spain",
    "es": "Spain",
    "brazil": "Brazil",
    "br": "Brazil",
    "india": "India",
    "in": "India",
    "worldwide": "Worldwide",
    "global": "Worldwide",
    "anywhere": "Worldwide",
    "remote": "Remote",
    "europe": "Europe",
    "latam": "Latin America",
    "apac": "Asia Pacific",
    "emea": "EMEA",
}


class BaseScraper(ABC):
    """
    Abstract base class for all remote job scrapers.

    Subclasses implement `scrape()` which must return a list of normalized
    job dicts conforming to the standard schema.

    Args:
        site_config: Configuration dict from sites.yaml for this site.
        supabase_client: Initialized Supabase client.
        proxy_pool: ProxyPool instance for proxy rotation.
    """

    def __init__(
        self,
        site_config: dict[str, Any],
        supabase_client: Any,
        proxy_pool: Any,
    ) -> None:
        self.config = site_config
        self.supabase = supabase_client
        self.proxy_pool = proxy_pool
        self.source_name: str = site_config.get("name", "Unknown")
        self.rate_limit: float = float(site_config.get("rate_limit_seconds", 2))
        self._http_client: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def scrape(self) -> list[dict]:
        """
        Fetch and return a list of normalized job dicts for this source.

        Returns:
            List of job dicts conforming to the standard schema.
        """
        ...

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    async def _get_http_client(self, proxy_url: Optional[str] = None) -> httpx.AsyncClient:
        """Build or return a cached httpx AsyncClient with proxy and UA headers."""
        headers = get_ua_headers()
        proxies = {"http://": proxy_url, "https://": proxy_url} if proxy_url else None
        return httpx.AsyncClient(
            headers=headers,
            proxies=proxies,  # type: ignore[arg-type]
            timeout=30.0,
            follow_redirects=True,
            verify=False,
        )

    async def _fetch_html(
        self,
        url: str,
        proxy_url: Optional[str] = None,
    ) -> Optional[str]:
        """
        Fetch a URL and return the HTML body as a string.

        Uses UA rotation, optional proxy, and tenacity retries (3 attempts,
        exponential backoff). Detects block pages and raises on detection.

        Args:
            url: Target URL.
            proxy_url: Optional proxy URL string; uses pool if None.

        Returns:
            HTML string, or None on unrecoverable failure.
        """
        if proxy_url is None and self.proxy_pool:
            proxy_url = self.proxy_pool.rotate()

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=2, max=10),
                retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
                reraise=True,
            ):
                with attempt:
                    client = await self._get_http_client(proxy_url)
                    async with client:
                        response = await client.get(url)
                        response.raise_for_status()

                    html = response.text
                    blocked, reason = is_blocked(response.text)
                    if blocked:
                        logger.warning(f"[{self.source_name}] Blocked fetching {url}: {reason}")
                        if self.proxy_pool and proxy_url:
                            self.proxy_pool.mark_failure(proxy_url)
                            proxy_url = self.proxy_pool.rotate()
                        raise httpx.RequestError(f"Blocked: {reason}", request=response.request)

                    if proxy_url and self.proxy_pool:
                        self.proxy_pool.mark_success(proxy_url)

                    await asyncio.sleep(self.rate_limit)
                    return html

        except Exception as exc:
            logger.error(f"[{self.source_name}] Failed to fetch {url}: {exc}")
            return None

    async def _fetch_json(
        self,
        url: str,
        proxy_url: Optional[str] = None,
        params: Optional[dict] = None,
    ) -> Optional[Any]:
        """
        Fetch a URL and return parsed JSON.

        Args:
            url: Target URL.
            proxy_url: Optional proxy URL.
            params: Optional query parameters.

        Returns:
            Parsed JSON (dict or list), or None on failure.
        """
        if proxy_url is None and self.proxy_pool:
            proxy_url = self.proxy_pool.rotate()

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=2, max=10),
                retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
                reraise=True,
            ):
                with attempt:
                    client = await self._get_http_client(proxy_url)
                    async with client:
                        response = await client.get(url, params=params)
                        response.raise_for_status()
                        await asyncio.sleep(self.rate_limit)
                        return response.json()

        except Exception as exc:
            logger.error(f"[{self.source_name}] Failed to fetch JSON {url}: {exc}")
            return None

    async def _fetch_with_playwright(
        self,
        url: str,
        proxy_url: Optional[str] = None,
        wait_selector: Optional[str] = None,
    ) -> Optional[str]:
        """
        Fetch a JavaScript-rendered page using Playwright with stealth mode.

        Applies anti-detection measures, simulates human scrolling,
        and rotates proxies on block detection.

        Args:
            url: Target URL.
            proxy_url: Optional proxy URL; uses pool if None.
            wait_selector: CSS selector to wait for before extracting HTML.

        Returns:
            Page HTML as string, or None on failure.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright not installed")
            return None

        if proxy_url is None and self.proxy_pool:
            proxy_url = self.proxy_pool.rotate()

        for attempt in range(3):
            pw = None
            browser = None
            try:
                pw = await async_playwright().__aenter__()

                launch_kwargs: dict[str, Any] = {
                    "headless": True,
                    "args": [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-blink-features=AutomationControlled",
                        "--disable-dev-shm-usage",
                    ],
                }
                if proxy_url:
                    proxy_parts = proxy_url.replace("://", "||").split("||")
                    if len(proxy_parts) == 2:
                        launch_kwargs["proxy"] = {"server": proxy_url}

                browser = await pw.chromium.launch(**launch_kwargs)
                context = await browser.new_context(
                    locale=random.choice(["en-US", "en-GB", "en-CA"]),
                    timezone_id=random.choice(["America/New_York", "America/Los_Angeles", "Europe/London"]),
                )
                page = await context.new_page()
                await apply_stealth(page)

                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await human_delay(2, 5)

                if wait_selector:
                    try:
                        await page.wait_for_selector(wait_selector, timeout=10000)
                    except Exception:
                        logger.debug(f"Selector '{wait_selector}' not found in time")

                await random_scroll(page)
                await human_delay(1, 3)

                html = await page.content()
                blocked, reason = is_blocked(html)

                if blocked:
                    logger.warning(
                        f"[{self.source_name}] Playwright blocked (attempt {attempt+1}): {reason}"
                    )
                    if self.proxy_pool and proxy_url:
                        self.proxy_pool.mark_failure(proxy_url)
                        proxy_url = self.proxy_pool.rotate()
                    await asyncio.sleep(self.rate_limit * 2)
                    continue

                if proxy_url and self.proxy_pool:
                    self.proxy_pool.mark_success(proxy_url)

                return html

            except Exception as exc:
                logger.error(
                    f"[{self.source_name}] Playwright attempt {attempt+1} failed: {exc}"
                )
                await asyncio.sleep(self.rate_limit)
            finally:
                if browser:
                    try:
                        await browser.close()
                    except Exception:
                        pass
                if pw:
                    try:
                        await pw.__aexit__(None, None, None)
                    except Exception:
                        pass

        return None

    # ------------------------------------------------------------------
    # Normalization helpers
    # ------------------------------------------------------------------

    def _normalize_job(self, raw: dict[str, Any]) -> dict[str, Any]:
        """
        Map a raw scraped dict to the standard job schema.

        Args:
            raw: Raw job data dict from a scraper.

        Returns:
            Normalized job dict with all standard fields populated.
        """
        description = raw.get("description", "") or ""
        title = raw.get("title", "") or ""
        location_text = raw.get("location", "") or ""

        location_info = self._extract_location(location_text)
        salary_info = self._extract_salary(
            raw.get("salary", "") or description or title
        )
        skills = self._extract_skills(f"{title} {description}")

        return {
            "source": self.source_name,
            "title": title.strip(),
            "company": (raw.get("company", "") or "").strip(),
            "url": (raw.get("url", "") or "").strip(),
            "description": description.strip(),
            "location": location_info.get("location", "Remote"),
            "country": location_info.get("country", ""),
            "state_region": location_info.get("state", ""),
            "job_type": raw.get("job_type", "full-time"),
            "salary_min": int(salary_info["min"]) if salary_info.get("min") is not None else None,
            "salary_max": int(salary_info["max"]) if salary_info.get("max") is not None else None,
            "salary_currency": salary_info.get("currency", "USD"),
            "skills_required": skills,
            "posted_at": raw.get("posted_at") or datetime.now(timezone.utc).isoformat(),
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "raw_data": raw,
        }

    def _extract_salary(self, text: str) -> dict[str, Any]:
        """
        Parse salary information from free-form text.

        Handles patterns like "$100k-$150k", "€80,000", "£50k",
        "120000 USD", "100k to 150k".

        Args:
            text: Free-form text potentially containing salary information.

        Returns:
            Dict with keys: min (float|None), max (float|None), currency (str).
        """
        if not text:
            return {"min": None, "max": None, "currency": "USD"}

        text = text.replace(",", "")
        result: dict[str, Any] = {"min": None, "max": None, "currency": "USD"}

        # Try range pattern first: $100k-$150k
        range_match = re.search(
            r"([\$£€])?\s*(\d+(?:\.\d+)?)\s*(k|K)?\s*[-–to]+\s*([\$£€])?\s*(\d+(?:\.\d+)?)\s*(k|K)?",
            text,
        )
        if range_match:
            currency_sym = range_match.group(1) or range_match.group(4) or "$"
            result["currency"] = _CURRENCY_MAP.get(currency_sym, "USD")
            min_val = float(range_match.group(2))
            max_val = float(range_match.group(5))
            if range_match.group(3) in ("k", "K"):
                min_val *= 1000
            if range_match.group(6) in ("k", "K"):
                max_val *= 1000
            result["min"] = min_val
            result["max"] = max_val
            return result

        # Try single value: $120k, €85000
        single_match = re.search(
            r"([\$£€])\s*(\d+(?:\.\d+)?)\s*(k|K)?",
            text,
        )
        if single_match:
            result["currency"] = _CURRENCY_MAP.get(single_match.group(1), "USD")
            val = float(single_match.group(2))
            if single_match.group(3) in ("k", "K"):
                val *= 1000
            result["min"] = val
            return result

        # Try numeric + currency code: 120000 USD
        code_match = re.search(
            r"(\d{4,7})\s*(USD|EUR|GBP|CAD|AUD|INR)",
            text,
            re.IGNORECASE,
        )
        if code_match:
            result["min"] = float(code_match.group(1))
            result["currency"] = code_match.group(2).upper()

        return result

    def _extract_location(self, text: str) -> dict[str, str]:
        """
        Parse location text into structured location fields.

        Handles patterns like "Remote, USA", "Worldwide", "Europe only",
        "San Francisco, CA", "Berlin, Germany".

        Args:
            text: Free-form location string.

        Returns:
            Dict with keys: location (str), country (str), state (str).
        """
        if not text:
            return {"location": "Remote", "country": "", "state_region": ""}

        lower = text.lower().strip()

        # Check for worldwide/remote first
        for keyword in ("worldwide", "global", "anywhere", "fully remote"):
            if keyword in lower:
                return {"location": "Worldwide", "country": "Worldwide", "state_region": ""}

        if lower in ("remote", "remote only", "100% remote", "remote work"):
            return {"location": "Remote", "country": "", "state_region": ""}

        # Try to extract country
        country = ""
        for keyword, country_name in _COUNTRY_KEYWORDS.items():
            if keyword in lower:
                country = country_name
                break

        # Try to extract US state abbreviation
        state = ""
        us_state_match = re.search(
            r"\b([A-Z]{2})\b",
            text,  # Use original case
        )
        if us_state_match:
            state = us_state_match.group(1)

        # Clean up the display location
        location = text.strip()
        if len(location) > 100:
            location = location[:100]

        return {
            "location": location,
            "country": country,
            "state_region": state,
        }

    def _extract_skills(self, text: str) -> list[str]:
        """
        Extract recognized tech skills from free-form text.

        Uses word-boundary matching against the curated TECH_SKILLS list.

        Args:
            text: Job description or title text.

        Returns:
            Deduplicated list of matched canonical skill names.
        """
        if not text:
            return []

        found: list[str] = []
        seen: set[str] = set()
        text_lower = text.lower()

        for skill_lower, canonical in _SKILLS_CANONICAL.items():
            # Use word boundary matching to avoid partial matches
            pattern = r"\b" + re.escape(skill_lower) + r"\b"
            if re.search(pattern, text_lower) and canonical not in seen:
                found.append(canonical)
                seen.add(canonical)

        return found

    def _strip_html(self, html: str) -> str:
        """Strip HTML tags and normalize whitespace from a string."""
        if not html:
            return ""
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ")
        return re.sub(r"\s+", " ", text).strip()

    def _make_absolute_url(self, href: str, base_url: str) -> str:
        """Convert a relative URL to absolute using the site's base URL."""
        if not href:
            return ""
        if href.startswith(("http://", "https://")):
            return href
        return urljoin(base_url, href)


# Avoid circular import issues at module level
import random
