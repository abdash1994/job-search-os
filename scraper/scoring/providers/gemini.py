"""
Google Gemini scoring provider stub.

Set GOOGLE_API_KEY and SCORING_PROVIDER=gemini in your .env to enable.
"""

from __future__ import annotations

import os

from scoring.base import ScoreResult, ScoringProvider

# TODO: Implementation would use the google-generativeai SDK as follows:
#
# import google.generativeai as genai
# import json
#
# class GeminiScorer(ScoringProvider):
#     def __init__(self, model: str = "gemini-1.5-flash"):
#         genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
#         self.model = genai.GenerativeModel(model)
#
#     def score(self, resume_text: str, job_description: str, job_title: str = "") -> ScoreResult:
#         prompt = f"""
#         You are a professional recruiter scoring job-resume fit.
#
#         Resume:
#         {resume_text[:3000]}
#
#         Job Title: {job_title}
#         Job Description:
#         {job_description[:3000]}
#
#         Respond with a JSON object containing:
#         - overall: float 0-100
#         - title_match: float 0-100
#         - skills_match: float 0-100
#         - experience_match: float 0-100
#         - matched_skills: list[str]
#         - missing_skills: list[str]
#         - breakdown: dict
#         """
#         response = self.model.generate_content(prompt)
#         result = json.loads(response.text)
#         return ScoreResult(**result)
#
#     def batch_score(self, resume_text: str, jobs: list[dict]) -> list[ScoreResult]:
#         return [self.score(resume_text, j.get("description", ""), j.get("title", "")) for j in jobs]


class GeminiScorer(ScoringProvider):
    """
    Stub Google Gemini scoring provider.

    Raises NotImplementedError until GOOGLE_API_KEY is configured.
    Install google-generativeai and set SCORING_PROVIDER=gemini to enable.
    """

    def __init__(self, model: str = "gemini-1.5-flash") -> None:
        self.model = model
        if not os.getenv("GOOGLE_API_KEY"):
            raise NotImplementedError(
                "GeminiScorer requires GOOGLE_API_KEY. "
                "Set GOOGLE_API_KEY and SCORING_PROVIDER=gemini to enable Gemini scoring."
            )

    def score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
    ) -> ScoreResult:
        raise NotImplementedError(
            "Set GOOGLE_API_KEY and SCORING_PROVIDER=gemini to enable Gemini scoring"
        )

    def batch_score(
        self,
        resume_text: str,
        jobs: list[dict],
    ) -> list[ScoreResult]:
        raise NotImplementedError(
            "Set GOOGLE_API_KEY and SCORING_PROVIDER=gemini to enable Gemini scoring"
        )

    def get_provider_name(self) -> str:
        return "Gemini"
