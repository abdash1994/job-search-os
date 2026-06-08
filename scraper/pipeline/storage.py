"""
Supabase storage layer for the job scraper pipeline.

Handles batch upserts of job listings, scraper run logging,
user resume retrieval, and relevance score persistence.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from loguru import logger

_JOBS_TABLE = "jobs"
_SCRAPER_RUNS_TABLE = "scraper_runs"
_USER_PROFILES_TABLE = "user_profiles"
_USER_JOBS_TABLE = "user_jobs"

# Batch size for Supabase upserts to stay within payload limits
_UPSERT_BATCH_SIZE = 100


class Storage:
    """
    Handles all Supabase read/write operations for the scraper pipeline.

    Args:
        supabase_client: Initialized supabase-py client instance.
    """

    def __init__(self, supabase_client: Any) -> None:
        self._client = supabase_client

    async def save_jobs(self, jobs: list[dict[str, Any]]) -> int:
        """
        Batch upsert job listings into the Supabase `jobs` table.

        Uses URL as the conflict resolution key — existing jobs with the same
        URL are updated rather than duplicated.

        Args:
            jobs: List of normalized job dicts to persist.

        Returns:
            Number of jobs successfully upserted.
        """
        if not jobs:
            return 0

        total_saved = 0
        for batch_start in range(0, len(jobs), _UPSERT_BATCH_SIZE):
            batch = jobs[batch_start : batch_start + _UPSERT_BATCH_SIZE]
            rows = [self._prepare_job_row(job) for job in batch]

            try:
                self._client.table(_JOBS_TABLE).upsert(
                    rows,
                    on_conflict="url",
                ).execute()
                total_saved += len(rows)
                logger.debug(
                    f"Storage: upserted batch {batch_start//100 + 1} "
                    f"({len(rows)} jobs)"
                )
            except Exception as exc:
                logger.error(
                    f"Storage: batch upsert failed at offset {batch_start}: {exc}"
                )
                # Try row-by-row fallback for this batch
                for row in rows:
                    try:
                        self._client.table(_JOBS_TABLE).upsert(
                            [row], on_conflict="url"
                        ).execute()
                        total_saved += 1
                    except Exception as row_exc:
                        logger.debug(
                            f"Storage: failed to save job '{row.get('title')}': {row_exc}"
                        )

        logger.info(f"Storage: saved {total_saved} / {len(jobs)} jobs")
        return total_saved

    async def log_scraper_run(
        self,
        source: str,
        status: str,
        jobs_found: int,
        jobs_new: int,
        proxy_used: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """
        Insert a scraper run record into the `scraper_runs` table.

        Args:
            source: Source name (e.g. "We Work Remotely").
            status: Run status — "success", "partial", or "failed".
            jobs_found: Total jobs scraped from the source.
            jobs_new: Jobs that were new (not duplicates).
            proxy_used: Proxy URL used for this run, if any.
            error: Error message if the run failed.
        """
        now = datetime.now(timezone.utc).isoformat()
        # Map legacy status values to DB enum: running|success|blocked|error
        status_map = {"partial": "success", "failed": "error"}
        db_status = status_map.get(status, status)
        row = {
            "source": source,
            "status": db_status,
            "jobs_found": jobs_found,
            "jobs_new": jobs_new,
            "proxy_used": proxy_used,
            "error_message": error[:2000] if error else None,
            "started_at": now,
            "completed_at": now,
        }
        try:
            self._client.table(_SCRAPER_RUNS_TABLE).insert(row).execute()
            logger.debug(f"Storage: logged run for '{source}' — {status}")
        except Exception as exc:
            logger.warning(f"Storage: failed to log scraper run for '{source}': {exc}")

    async def get_user_resumes(self) -> list[dict[str, Any]]:
        """
        Fetch all user profiles that have a non-empty resume_text.

        Returns:
            List of dicts with keys: user_id (str), resume_text (str).
        """
        try:
            result = (
                self._client
                .table(_USER_PROFILES_TABLE)
                .select("id, resume_text")
                .not_.is_("resume_text", "null")
                .neq("resume_text", "")
                .execute()
            )
            profiles = result.data or []
            logger.info(f"Storage: loaded {len(profiles)} user profiles with resumes")
            return [
                {
                    "user_id": p["id"],
                    "resume_text": p["resume_text"],
                }
                for p in profiles
                if p.get("resume_text")
            ]
        except Exception as exc:
            logger.error(f"Storage: failed to fetch user resumes: {exc}")
            return []

    async def save_relevance_scores(
        self, scores: list[dict[str, Any]]
    ) -> int:
        """
        Batch upsert relevance scores into the `user_jobs` table.

        Each score links a user to a job with a relevance score and breakdown.
        Conflicts on (user_id, job_id) update the existing score.

        Args:
            scores: List of dicts with keys:
                      user_id (str), job_id (str), relevance_score (float),
                      relevance_breakdown (dict).

        Returns:
            Number of scores successfully upserted.
        """
        if not scores:
            return 0

        total_saved = 0
        for batch_start in range(0, len(scores), _UPSERT_BATCH_SIZE):
            batch = scores[batch_start : batch_start + _UPSERT_BATCH_SIZE]
            rows = [self._prepare_score_row(s) for s in batch]

            try:
                self._client.table(_USER_JOBS_TABLE).upsert(
                    rows,
                    on_conflict="user_id,job_id",
                ).execute()
                total_saved += len(rows)
            except Exception as exc:
                logger.error(
                    f"Storage: relevance score batch failed at offset {batch_start}: {exc}"
                )

        logger.info(f"Storage: saved {total_saved} relevance scores")
        return total_saved

    async def get_recent_job_ids(self, limit: int = 1000) -> list[str]:
        """
        Fetch IDs of recently scraped jobs for scoring.

        Args:
            limit: Maximum number of job IDs to return.

        Returns:
            List of job ID strings.
        """
        try:
            result = (
                self._client
                .table(_JOBS_TABLE)
                .select("id")
                .order("scraped_at", desc=True)
                .limit(limit)
                .execute()
            )
            return [row["id"] for row in (result.data or []) if row.get("id")]
        except Exception as exc:
            logger.error(f"Storage: failed to fetch recent job IDs: {exc}")
            return []

    async def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        """
        Fetch full job records by a list of IDs.

        Args:
            job_ids: List of job UUID strings.

        Returns:
            List of job dicts.
        """
        if not job_ids:
            return []
        try:
            result = (
                self._client
                .table(_JOBS_TABLE)
                .select("*")
                .in_("id", job_ids)
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(f"Storage: failed to fetch jobs by IDs: {exc}")
            return []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _prepare_job_row(job: dict[str, Any]) -> dict[str, Any]:
        """
        Prepare a job dict for Supabase insertion.

        Serializes complex fields (skills_required, raw_data) to JSON-safe types.
        """
        row = {k: v for k, v in job.items()}

        # Ensure skills_required is a list (Supabase text[] column)
        skills = row.get("skills_required", [])
        if not isinstance(skills, list):
            row["skills_required"] = []

        # raw_data must be a dict for jsonb column
        raw_data = row.get("raw_data", {})
        if not isinstance(raw_data, dict):
            try:
                row["raw_data"] = json.loads(str(raw_data))
            except Exception:
                row["raw_data"] = {}

        # Coerce numeric salary fields
        for field in ("salary_min", "salary_max"):
            val = row.get(field)
            if val is not None:
                try:
                    row[field] = float(val)
                except (TypeError, ValueError):
                    row[field] = None

        return row

    @staticmethod
    def _prepare_score_row(score: dict[str, Any]) -> dict[str, Any]:
        """
        Prepare a relevance score dict for Supabase insertion.

        Serializes breakdown dict to ensure it's JSON-serializable.
        """
        row = {k: v for k, v in score.items()}

        # Ensure breakdown is a plain dict
        breakdown = row.get("relevance_breakdown", {})
        if not isinstance(breakdown, dict):
            row["relevance_breakdown"] = {}

        # Round score to 2 decimal places
        score_val = row.get("relevance_score", 0.0)
        try:
            row["relevance_score"] = round(float(score_val), 2)
        except (TypeError, ValueError):
            row["relevance_score"] = 0.0

        return row
