"""
Abstract base class and shared data structures for scoring providers.

All scoring backends (TF-IDF, HuggingFace, Claude, Gemini) must implement
the ScoringProvider interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ScoreResult:
    """
    Structured result from a job-resume relevance scoring operation.

    Attributes:
        overall: Composite score from 0 to 100.
        title_match: How well the job title matches resume experience (0–100).
        skills_match: Percentage of job skills found in resume (0–100).
        experience_match: Experience level alignment score (0–100).
        breakdown: Dict of individual scoring component details.
        matched_skills: List of skills present in both resume and job description.
        missing_skills: List of required skills absent from the resume.
    """

    overall: float
    title_match: float
    skills_match: float
    experience_match: float
    breakdown: dict = field(default_factory=dict)
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for JSON/Supabase storage."""
        return {
            "overall": round(self.overall, 2),
            "title_match": round(self.title_match, 2),
            "skills_match": round(self.skills_match, 2),
            "experience_match": round(self.experience_match, 2),
            "breakdown": self.breakdown,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
        }


class ScoringProvider(ABC):
    """
    Abstract interface for job-resume relevance scoring backends.

    Implementations must be thread-safe for concurrent scoring of many
    jobs against a single resume.
    """

    @abstractmethod
    def score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
    ) -> ScoreResult:
        """
        Score the relevance of a single job against a resume.

        Args:
            resume_text: Full text of the candidate's resume.
            job_description: Full job description text.
            job_title: Job title string (optional, used for title_match).

        Returns:
            ScoreResult with component scores and skill breakdown.
        """
        ...

    @abstractmethod
    def batch_score(
        self,
        resume_text: str,
        jobs: list[dict],
    ) -> list[ScoreResult]:
        """
        Score multiple jobs against a single resume efficiently.

        Implementations should vectorize where possible rather than
        calling score() in a loop.

        Args:
            resume_text: Full text of the candidate's resume.
            jobs: List of job dicts with at least 'description' and 'title' keys.

        Returns:
            List of ScoreResult objects in the same order as input jobs.
        """
        ...

    def get_provider_name(self) -> str:
        """Return the human-readable name of this scoring provider."""
        return self.__class__.__name__
