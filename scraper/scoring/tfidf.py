"""
TF-IDF based job-resume relevance scorer.

Uses scikit-learn's TfidfVectorizer and cosine similarity for efficient
batch scoring of job descriptions against a candidate's resume.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
from loguru import logger
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from base.base_scraper import TECH_SKILLS, _SKILLS_CANONICAL
from scoring.base import ScoreResult, ScoringProvider

# Experience level keywords for classification
_EXP_LEVELS: dict[str, list[str]] = {
    "junior": [
        "junior", "entry", "entry-level", "0-2 years", "1 year", "new grad",
        "graduate", "fresher", "intern", "associate",
    ],
    "mid": [
        "mid", "intermediate", "2-5 years", "3+ years", "mid-level",
        "mid level", "2 years", "3 years", "4 years",
    ],
    "senior": [
        "senior", "sr.", "sr ", "lead", "principal", "staff", "5+ years",
        "7+ years", "10+ years", "experienced", "expert",
    ],
    "manager": [
        "manager", "director", "vp ", "head of", "chief", "cto", "cpo",
        "engineering manager", "team lead",
    ],
}

_LEVEL_ORDER = ["junior", "mid", "senior", "manager"]


class TFIDFScorer(ScoringProvider):
    """
    Relevance scorer using TF-IDF vectorization and cosine similarity.

    Scores are computed as a weighted combination of:
      - 40%: TF-IDF cosine similarity between resume and job description
      - 25%: Job title keyword overlap with resume
      - 25%: Skills overlap between extracted job skills and resume skills
      - 10%: Experience level match

    The vectorizer is fit lazily on first use and re-fit when the
    corpus changes significantly.
    """

    def __init__(
        self,
        max_features: int = 5000,
        ngram_range: tuple[int, int] = (1, 2),
        min_df: int = 1,
    ) -> None:
        self._vectorizer = TfidfVectorizer(
            max_features=max_features,
            ngram_range=ngram_range,
            min_df=min_df,
            stop_words="english",
            sublinear_tf=True,
            strip_accents="unicode",
        )
        self._is_fitted = False
        self._corpus_texts: list[str] = []

    def score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
    ) -> ScoreResult:
        """
        Score a single job against a resume.

        Args:
            resume_text: Candidate's full resume text.
            job_description: Job description text.
            job_title: Job title (used for title_match component).

        Returns:
            ScoreResult with breakdown of each scoring component.
        """
        full_job_text = f"{job_title} {job_description}".strip()
        results = self.batch_score(resume_text, [{"description": job_description, "title": job_title}])
        return results[0]

    def batch_score(
        self,
        resume_text: str,
        jobs: list[dict],
    ) -> list[ScoreResult]:
        """
        Score multiple jobs against a resume using vectorized TF-IDF.

        Builds a corpus of [resume] + [all job texts], fits the vectorizer,
        then computes cosine similarities in a single matrix operation.

        Args:
            resume_text: Candidate's full resume text.
            jobs: List of job dicts with 'description' and 'title' keys.

        Returns:
            List of ScoreResult objects in the same order as input jobs.
        """
        if not jobs:
            return []

        if not resume_text:
            logger.warning("TFIDFScorer: empty resume text — returning zero scores")
            return [self._zero_score() for _ in jobs]

        # Build corpus: resume + all job descriptions
        job_texts = [
            self._prepare_text(j.get("description", ""), j.get("title", ""))
            for j in jobs
        ]
        corpus = [self._prepare_text(resume_text)] + job_texts

        try:
            tfidf_matrix = self._vectorizer.fit_transform(corpus)
        except Exception as exc:
            logger.error(f"TFIDFScorer: vectorizer failed: {exc}")
            return [self._zero_score() for _ in jobs]

        resume_vec = tfidf_matrix[0]
        job_vecs = tfidf_matrix[1:]

        # Cosine similarities for all jobs at once
        cosine_scores = cosine_similarity(resume_vec, job_vecs)[0]

        # Extract resume skills once
        resume_skills = set(s.lower() for s in _extract_skills_from_text(resume_text))
        resume_level = _detect_experience_level(resume_text)

        results: list[ScoreResult] = []
        for idx, job in enumerate(jobs):
            try:
                result = self._build_score_result(
                    job=job,
                    cosine_sim=float(cosine_scores[idx]),
                    resume_skills=resume_skills,
                    resume_level=resume_level,
                    resume_text=resume_text,
                )
                results.append(result)
            except Exception as exc:
                logger.debug(f"TFIDFScorer: scoring error for job {idx}: {exc}")
                results.append(self._zero_score())

        return results

    def _build_score_result(
        self,
        job: dict[str, Any],
        cosine_sim: float,
        resume_skills: set[str],
        resume_level: str,
        resume_text: str,
    ) -> ScoreResult:
        """Compute all scoring components and combine into a ScoreResult."""
        description = job.get("description", "") or ""
        title = job.get("title", "") or ""

        # --- Component 1: TF-IDF cosine similarity (raw 0–1 → 0–100) ---
        tfidf_score = min(cosine_sim * 150, 100.0)  # Scale up (typical cosine is low)

        # --- Component 2: Skills match ---
        job_skills = set(s.lower() for s in _extract_skills_from_text(f"{title} {description}"))
        matched = resume_skills & job_skills
        missing = job_skills - resume_skills

        skills_score = 0.0
        if job_skills:
            skills_score = (len(matched) / len(job_skills)) * 100

        # Canonical casing for matched/missing lists
        matched_canonical = [_SKILLS_CANONICAL.get(s, s) for s in matched]
        missing_canonical = [_SKILLS_CANONICAL.get(s, s) for s in missing]

        # --- Component 3: Title match ---
        title_score = _compute_title_match(resume_text, title)

        # --- Component 4: Experience level match ---
        job_level = _detect_experience_level(f"{title} {description}")
        exp_score = _experience_match_score(resume_level, job_level)

        # --- Weighted overall ---
        overall = (
            tfidf_score * 0.40
            + skills_score * 0.25
            + title_score * 0.25
            + exp_score * 0.10
        )
        overall = max(0.0, min(100.0, overall))

        return ScoreResult(
            overall=overall,
            title_match=title_score,
            skills_match=skills_score,
            experience_match=exp_score,
            breakdown={
                "tfidf_cosine": round(cosine_sim, 4),
                "tfidf_scaled": round(tfidf_score, 2),
                "skills_score": round(skills_score, 2),
                "title_score": round(title_score, 2),
                "exp_score": round(exp_score, 2),
                "resume_level": resume_level,
                "job_level": job_level,
                "total_job_skills": len(job_skills),
                "matched_count": len(matched),
            },
            matched_skills=sorted(matched_canonical),
            missing_skills=sorted(missing_canonical),
        )

    @staticmethod
    def _prepare_text(*texts: str) -> str:
        """Combine and clean multiple text inputs for vectorization."""
        combined = " ".join(t for t in texts if t)
        # Remove URLs, emails, special chars
        combined = re.sub(r"https?://\S+", " ", combined)
        combined = re.sub(r"\S+@\S+", " ", combined)
        combined = re.sub(r"[^\w\s]", " ", combined)
        combined = re.sub(r"\s+", " ", combined)
        return combined.strip().lower()

    @staticmethod
    def _zero_score() -> ScoreResult:
        """Return a zero ScoreResult for error cases."""
        return ScoreResult(
            overall=0.0,
            title_match=0.0,
            skills_match=0.0,
            experience_match=0.0,
            breakdown={},
            matched_skills=[],
            missing_skills=[],
        )

    def get_provider_name(self) -> str:
        return "TF-IDF"


# ---------------------------------------------------------------------------
# Module-level helpers shared with scoring providers
# ---------------------------------------------------------------------------

def _extract_skills_from_text(text: str) -> list[str]:
    """Extract canonical tech skills from text using word-boundary matching."""
    if not text:
        return []
    found: list[str] = []
    seen: set[str] = set()
    lower = text.lower()
    for skill_lower, canonical in _SKILLS_CANONICAL.items():
        pattern = r"\b" + re.escape(skill_lower) + r"\b"
        if re.search(pattern, lower) and canonical not in seen:
            found.append(canonical)
            seen.add(canonical)
    return found


def _detect_experience_level(text: str) -> str:
    """
    Detect the experience level implied by text.

    Returns one of: "junior", "mid", "senior", "manager", or "unknown".
    """
    lower = text.lower()
    # Check from most senior down (greedy match)
    for level in reversed(_LEVEL_ORDER):
        for keyword in _EXP_LEVELS[level]:
            if keyword in lower:
                return level
    return "unknown"


def _compute_title_match(resume_text: str, job_title: str) -> float:
    """
    Score how well a job title aligns with the resume's experience section.

    Uses word overlap between title tokens and resume content.
    Returns 0–100.
    """
    if not job_title:
        return 50.0  # Neutral score when no title provided

    title_words = set(re.findall(r"\b\w{3,}\b", job_title.lower()))
    resume_lower = resume_text.lower()

    if not title_words:
        return 50.0

    matches = sum(1 for w in title_words if w in resume_lower)
    return min((matches / len(title_words)) * 100, 100.0)


def _experience_match_score(resume_level: str, job_level: str) -> float:
    """
    Compute an experience level alignment score.

    Returns 100 for exact match, penalizes over/under-qualification.
    Returns 0–100.
    """
    if resume_level == "unknown" or job_level == "unknown":
        return 70.0  # Neutral when level cannot be determined

    if resume_level == job_level:
        return 100.0

    if resume_level not in _LEVEL_ORDER or job_level not in _LEVEL_ORDER:
        return 70.0

    r_idx = _LEVEL_ORDER.index(resume_level)
    j_idx = _LEVEL_ORDER.index(job_level)
    gap = abs(r_idx - j_idx)

    if gap == 1:
        return 75.0
    if gap == 2:
        return 50.0
    return 25.0
