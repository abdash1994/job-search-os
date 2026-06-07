"""
Scraper engine entry point.

Orchestrates all scrapers, the dedup/normalize pipeline, Supabase storage,
and job-resume relevance scoring. Runs once (--once) or on a schedule
driven by SCRAPE_INTERVAL_HOURS.

Usage:
    python main.py          # Run on schedule
    python main.py --once   # Single run then exit
"""

from __future__ import annotations

import argparse
import asyncio
import os
import signal
import sys
from pathlib import Path
from typing import Any, Optional

import yaml
from dotenv import load_dotenv
from loguru import logger
from supabase import create_client, Client

from pipeline.dedup import Deduplicator
from pipeline.normalizer import Normalizer
from pipeline.storage import Storage
from proxy.fetcher import refresh_proxy_pool
from proxy.pool import ProxyPool
from scoring.base import ScoringProvider
from scoring.tfidf import TFIDFScorer

# Scraper imports
from scrapers.weworkremotely import WeWorkRemotelyScraper
from scrapers.workingnomads import WorkingNomadsScraper
from scrapers.remote_co import RemoteCoScraper
from scrapers.nodesk import NoDeskScraper
from scrapers.remote100k import Remote100KScraper
from scrapers.skipthedrive import SkipTheDriveScraper
from scrapers.justremote import JustRemoteScraper
from scrapers.topstartups import TopStartupsScraper
from scrapers.wellfound import WellfoundScraper
from scrapers.crunchbase import CrunchbaseScraper

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level=os.getenv("LOG_LEVEL", "INFO"),
    colorize=True,
)
logger.add(
    "logs/scraper_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="7 days",
    compression="gz",
    level="DEBUG",
    serialize=False,
)

_SHUTDOWN_EVENT = asyncio.Event()


def _load_config() -> dict[str, Any]:
    """Load and return the sites.yaml configuration."""
    config_path = Path(__file__).parent / "config" / "sites.yaml"
    with config_path.open("r") as f:
        return yaml.safe_load(f)


def _load_scoring_config() -> dict[str, Any]:
    """Load and return the scoring.yaml configuration."""
    config_path = Path(__file__).parent / "config" / "scoring.yaml"
    with config_path.open("r") as f:
        return yaml.safe_load(f)


def _init_supabase() -> Client:
    """Initialize and return the Supabase client from environment variables."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    if not url or not key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) must be set"
        )
    return create_client(url, key)


def _init_scoring_provider(scoring_config: dict) -> ScoringProvider:
    """
    Instantiate the configured scoring provider.

    Falls back to TF-IDF if the requested provider fails to initialize.
    """
    provider_name = os.getenv("SCORING_PROVIDER", "tfidf").lower()
    tfidf_cfg = scoring_config.get("scoring", {}).get("tfidf", {})

    if provider_name == "tfidf":
        logger.info("Scoring provider: TF-IDF")
        return TFIDFScorer(
            max_features=tfidf_cfg.get("max_features", 5000),
            ngram_range=tuple(tfidf_cfg.get("ngram_range", [1, 2])),
            min_df=tfidf_cfg.get("min_df", 1),
        )

    if provider_name == "claude":
        try:
            from scoring.providers.claude import ClaudeScorer
            logger.info("Scoring provider: Claude")
            return ClaudeScorer()
        except (ImportError, NotImplementedError) as exc:
            logger.warning(f"Claude scorer unavailable ({exc}) — falling back to TF-IDF")

    if provider_name == "gemini":
        try:
            from scoring.providers.gemini import GeminiScorer
            logger.info("Scoring provider: Gemini")
            return GeminiScorer()
        except (ImportError, NotImplementedError) as exc:
            logger.warning(f"Gemini scorer unavailable ({exc}) — falling back to TF-IDF")

    if provider_name == "huggingface":
        try:
            from scoring.providers.huggingface import HuggingFaceScorer
            logger.info("Scoring provider: HuggingFace")
            return HuggingFaceScorer()
        except (ImportError, NotImplementedError) as exc:
            logger.warning(f"HuggingFace scorer unavailable ({exc}) — falling back to TF-IDF")

    logger.info("Scoring provider: TF-IDF (default fallback)")
    return TFIDFScorer()


def _build_scrapers(
    sites_config: dict[str, Any],
    supabase: Client,
    proxy_pool: ProxyPool,
) -> list[Any]:
    """
    Instantiate all scrapers from the site configuration.

    Args:
        sites_config: Parsed sites.yaml content.
        supabase: Supabase client.
        proxy_pool: Initialized ProxyPool.

    Returns:
        List of BaseScraper instances.
    """
    sites = sites_config.get("sites", {})

    scraper_map = {
        "weworkremotely": WeWorkRemotelyScraper,
        "workingnomads": WorkingNomadsScraper,
        "remote_co": RemoteCoScraper,
        "nodesk": NoDeskScraper,
        "remote100k": Remote100KScraper,
        "skipthedrive": SkipTheDriveScraper,
        "justremote": JustRemoteScraper,
        "topstartups": TopStartupsScraper,
        "wellfound": WellfoundScraper,
        "crunchbase": CrunchbaseScraper,
    }

    scrapers = []
    for site_key, scraper_class in scraper_map.items():
        site_cfg = sites.get(site_key)
        if not site_cfg:
            logger.warning(f"No config found for site '{site_key}' — skipping")
            continue
        scrapers.append(scraper_class(site_cfg, supabase, proxy_pool))
        logger.debug(f"Registered scraper: {scraper_class.__name__}")

    logger.info(f"Initialized {len(scrapers)} scrapers")
    return scrapers


async def run_scraper(scraper: Any, storage: Storage) -> dict[str, Any]:
    """
    Run a single scraper and return a summary dict.

    Args:
        scraper: An initialized BaseScraper instance.
        storage: Storage instance for logging.

    Returns:
        Dict with keys: source, jobs_found, jobs, error.
    """
    source = scraper.source_name
    logger.info(f"Starting scraper: {source}")

    jobs: list[dict] = []
    error: Optional[str] = None

    try:
        jobs = await scraper.scrape()
        logger.info(f"[{source}] Completed: {len(jobs)} jobs scraped")
    except Exception as exc:
        error = str(exc)
        logger.error(f"[{source}] Scraper failed: {exc}")

    return {
        "source": source,
        "jobs_found": len(jobs),
        "jobs": jobs,
        "error": error,
    }


async def run_all_scrapers(
    scrapers: list[Any],
    storage: Storage,
    deduplicator: Deduplicator,
    normalizer: Normalizer,
    scoring_provider: ScoringProvider,
    supabase: Client,
) -> None:
    """
    Run all scrapers concurrently, process results, and persist to Supabase.

    Pipeline:
      1. Scrape all sources concurrently
      2. Collect all raw jobs
      3. Deduplicate against existing DB records
      4. Normalize text/dates/types
      5. Save new jobs to Supabase
      6. Score new jobs against all user resumes
      7. Save relevance scores
      8. Log run stats per source
    """
    logger.info(f"=== Starting scraper run: {len(scrapers)} sources ===")

    # Run all scrapers concurrently
    run_tasks = [run_scraper(s, storage) for s in scrapers]
    results = await asyncio.gather(*run_tasks, return_exceptions=False)

    # Collect all jobs across all scrapers
    all_raw_jobs: list[dict] = []
    for result in results:
        all_raw_jobs.extend(result.get("jobs", []))

    logger.info(f"Total raw jobs collected: {len(all_raw_jobs)}")

    # Dedup within the current batch first
    batch_deduped = deduplicator.filter_batch_duplicates(all_raw_jobs)
    logger.info(f"After in-batch dedup: {len(batch_deduped)} jobs")

    # Dedup against Supabase
    new_jobs = await deduplicator.filter_new(batch_deduped, supabase)
    logger.info(f"New jobs after DB dedup: {len(new_jobs)}")

    # Normalize
    normalized_jobs = normalizer.normalize_pipeline(new_jobs)

    # Save to Supabase
    jobs_saved = 0
    if normalized_jobs:
        jobs_saved = await storage.save_jobs(normalized_jobs)
        logger.info(f"Saved {jobs_saved} jobs to Supabase")

    # Log per-source run stats
    source_jobs_new: dict[str, int] = {}
    for job in new_jobs:
        src = job.get("source", "unknown")
        source_jobs_new[src] = source_jobs_new.get(src, 0) + 1

    for result in results:
        source = result["source"]
        new_count = source_jobs_new.get(source, 0)
        status = "failed" if result.get("error") else ("partial" if new_count == 0 else "success")
        await storage.log_scraper_run(
            source=source,
            status=status,
            jobs_found=result["jobs_found"],
            jobs_new=new_count,
            error=result.get("error"),
        )

    # Score new jobs against all user resumes
    if normalized_jobs:
        await _run_scoring(
            normalized_jobs=normalized_jobs,
            supabase=supabase,
            storage=storage,
            scoring_provider=scoring_provider,
        )

    logger.info(
        f"=== Run complete: {len(all_raw_jobs)} scraped, "
        f"{len(new_jobs)} new, {jobs_saved} saved ==="
    )


async def _run_scoring(
    normalized_jobs: list[dict],
    supabase: Client,
    storage: Storage,
    scoring_provider: ScoringProvider,
) -> None:
    """
    Score all new jobs against every user's resume and save results.

    Args:
        normalized_jobs: Newly saved job dicts (must include 'id' after DB insert).
        supabase: Supabase client for fetching job IDs.
        storage: Storage for reading resumes and writing scores.
        scoring_provider: Initialized scoring provider.
    """
    # Fetch user resumes
    user_resumes = await storage.get_user_resumes()
    if not user_resumes:
        logger.info("No user resumes found — skipping scoring")
        return

    # Get job IDs for newly saved jobs by fetching recent records
    recent_job_ids = await storage.get_recent_job_ids(limit=len(normalized_jobs) + 10)
    if not recent_job_ids:
        logger.warning("No job IDs found for scoring")
        return

    jobs_with_ids = await storage.get_jobs_by_ids(recent_job_ids)
    if not jobs_with_ids:
        return

    logger.info(
        f"Scoring {len(jobs_with_ids)} jobs against {len(user_resumes)} user resumes "
        f"using {scoring_provider.get_provider_name()}"
    )

    all_scores: list[dict] = []

    for user_profile in user_resumes:
        user_id = user_profile["user_id"]
        resume_text = user_profile["resume_text"]

        try:
            score_results = scoring_provider.batch_score(resume_text, jobs_with_ids)
        except Exception as exc:
            logger.error(f"Scoring failed for user {user_id}: {exc}")
            continue

        for job, score_result in zip(jobs_with_ids, score_results):
            job_id = job.get("id")
            if not job_id:
                continue
            all_scores.append({
                "user_id": user_id,
                "job_id": job_id,
                "relevance_score": score_result.overall,
                "relevance_breakdown": score_result.to_dict(),
            })

    if all_scores:
        saved = await storage.save_relevance_scores(all_scores)
        logger.info(f"Saved {saved} relevance scores")


def _setup_signal_handlers() -> None:
    """Register SIGTERM/SIGINT handlers for graceful shutdown."""

    def _handle_signal(signum: int, frame: Any) -> None:
        logger.info(f"Received signal {signum} — initiating graceful shutdown")
        # Schedule shutdown in the event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.call_soon_threadsafe(_SHUTDOWN_EVENT.set)
        else:
            sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)


async def _async_main(run_once: bool) -> None:
    """
    Main async entry point.

    Args:
        run_once: If True, runs the scraper pipeline once and exits.
                  If False, runs on a schedule defined by SCRAPE_INTERVAL_HOURS.
    """
    # Load environment
    load_dotenv()

    # Create logs directory
    Path("logs").mkdir(exist_ok=True)

    # Load configuration
    sites_config = _load_config()
    scoring_config = _load_scoring_config()

    # Initialize Supabase
    supabase = _init_supabase()
    logger.info("Supabase client initialized")

    # Initialize proxy pool (attempt to refresh on startup)
    proxy_pool = ProxyPool(supabase)
    if proxy_pool.size == 0:
        logger.info("Proxy pool empty — refreshing from sources")
        try:
            await refresh_proxy_pool(supabase)
            proxy_pool.refresh()
        except Exception as exc:
            logger.warning(f"Proxy refresh failed: {exc} — continuing without proxies")

    # Initialize pipeline components
    storage = Storage(supabase)
    deduplicator = Deduplicator()
    normalizer = Normalizer()
    scoring_provider = _init_scoring_provider(scoring_config)

    # Initialize scrapers
    scrapers = _build_scrapers(sites_config, supabase, proxy_pool)

    if run_once:
        logger.info("Running in --once mode")
        await run_all_scrapers(
            scrapers, storage, deduplicator, normalizer, scoring_provider, supabase
        )
        return

    # Scheduled mode
    interval_hours = float(os.getenv("SCRAPE_INTERVAL_HOURS", "6"))
    interval_seconds = interval_hours * 3600
    logger.info(f"Scheduled mode: running every {interval_hours} hours")

    # Use APScheduler for robust scheduling
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_all_scrapers,
        trigger="interval",
        hours=interval_hours,
        args=[scrapers, storage, deduplicator, normalizer, scoring_provider, supabase],
        id="scraper_run",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,  # Allow 5min grace for missed jobs
    )
    scheduler.start()
    logger.info("Scheduler started")

    # Run immediately on startup
    await run_all_scrapers(
        scrapers, storage, deduplicator, normalizer, scoring_provider, supabase
    )

    # Block until shutdown signal
    try:
        await _SHUTDOWN_EVENT.wait()
    finally:
        logger.info("Shutting down scheduler")
        scheduler.shutdown(wait=False)


def main() -> None:
    """Parse CLI arguments and launch the async event loop."""
    parser = argparse.ArgumentParser(description="Remote Job Aggregator Scraper")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run the scraper pipeline once and exit",
    )
    args = parser.parse_args()

    _setup_signal_handlers()

    try:
        asyncio.run(_async_main(run_once=args.once))
    except KeyboardInterrupt:
        logger.info("Interrupted by user — exiting")
    except Exception as exc:
        logger.exception(f"Fatal error in scraper engine: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
