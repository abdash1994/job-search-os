"""
Claude (Anthropic) scoring provider stub.

Set ANTHROPIC_API_KEY and SCORING_PROVIDER=claude in your .env to enable.
"""

from __future__ import annotations

import os

from scoring.base import ScoreResult, ScoringProvider

# TODO: Implementation would use the anthropic Python SDK as follows:
#
# import anthropic
#
# class ClaudeScorer(ScoringProvider):
#     def __init__(self, model: str = "claude-3-haiku-20240307"):
#         self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
#         self.model = model
#
#     def score(self, resume_text: str, job_description: str, job_title: str = "") -> ScoreResult:
#         prompt = f"""
#         You are a professional recruiter. Score the match between this resume and job.
#
#         Resume:
#         {resume_text[:3000]}
#
#         Job Title: {job_title}
#         Job Description:
#         {job_description[:3000]}
#
#         Return a JSON object with:
#         - overall: float 0-100 (weighted match score)
#         - title_match: float 0-100
#         - skills_match: float 0-100
#         - experience_match: float 0-100
#         - matched_skills: list[str]
#         - missing_skills: list[str]
#         - breakdown: dict with reasoning
#         """
#         message = self.client.messages.create(
#             model=self.model,
#             max_tokens=1024,
#             messages=[{"role": "user", "content": prompt}]
#         )
#         import json
#         result = json.loads(message.content[0].text)
#         return ScoreResult(**result)
#
#     def batch_score(self, resume_text: str, jobs: list[dict]) -> list[ScoreResult]:
#         return [self.score(resume_text, j.get("description", ""), j.get("title", "")) for j in jobs]


class ClaudeScorer(ScoringProvider):
    """
    Stub Claude scoring provider.

    Raises NotImplementedError until ANTHROPIC_API_KEY is configured.
    Install the anthropic package and set SCORING_PROVIDER=claude to enable.
    """

    def __init__(self, model: str = "claude-3-haiku-20240307") -> None:
        self.model = model
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise NotImplementedError(
                "ClaudeScorer requires ANTHROPIC_API_KEY. "
                "Set ANTHROPIC_API_KEY and SCORING_PROVIDER=claude to enable Claude scoring."
            )

    def score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
    ) -> ScoreResult:
        raise NotImplementedError(
            "Set ANTHROPIC_API_KEY and SCORING_PROVIDER=claude to enable Claude scoring"
        )

    def batch_score(
        self,
        resume_text: str,
        jobs: list[dict],
    ) -> list[ScoreResult]:
        raise NotImplementedError(
            "Set ANTHROPIC_API_KEY and SCORING_PROVIDER=claude to enable Claude scoring"
        )

    def get_provider_name(self) -> str:
        return "Claude"
