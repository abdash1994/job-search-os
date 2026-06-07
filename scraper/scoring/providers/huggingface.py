"""
HuggingFace sentence-transformers scoring provider stub.

Set HUGGINGFACE_API_KEY and SCORING_PROVIDER=huggingface in your .env to enable.
"""

from __future__ import annotations

import os

from scoring.base import ScoreResult, ScoringProvider

# TODO: Implementation would use the HuggingFace Inference API as follows:
#
# import requests
# import numpy as np
# from base.base_scraper import _extract_skills_from_text  (from scoring.tfidf)
#
# MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# API_URL = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{MODEL}"
#
# class HuggingFaceScorer(ScoringProvider):
#     def __init__(self, model: str = "sentence-transformers/all-MiniLM-L6-v2"):
#         self.api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model}"
#         self.headers = {"Authorization": f"Bearer {os.environ['HUGGINGFACE_API_KEY']}"}
#
#     def _embed(self, texts: list[str]) -> np.ndarray:
#         response = requests.post(
#             self.api_url,
#             headers=self.headers,
#             json={"inputs": texts, "options": {"wait_for_model": True}},
#             timeout=30
#         )
#         response.raise_for_status()
#         return np.array(response.json())
#
#     def _cosine(self, a: np.ndarray, b: np.ndarray) -> float:
#         return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
#
#     def score(self, resume_text: str, job_description: str, job_title: str = "") -> ScoreResult:
#         embeddings = self._embed([resume_text[:512], f"{job_title} {job_description}"[:512]])
#         cosine = self._cosine(embeddings[0], embeddings[1])
#         overall = min(cosine * 120, 100.0)  # Scale 0-1 cosine to 0-100
#         return ScoreResult(
#             overall=overall,
#             title_match=overall,
#             skills_match=overall,
#             experience_match=70.0,  # Neutral; semantic scorer doesn't detect level
#             breakdown={"cosine_similarity": round(cosine, 4)},
#             matched_skills=[],
#             missing_skills=[],
#         )
#
#     def batch_score(self, resume_text: str, jobs: list[dict]) -> list[ScoreResult]:
#         job_texts = [f"{j.get('title','')} {j.get('description','')}".strip()[:512] for j in jobs]
#         all_texts = [resume_text[:512]] + job_texts
#         embeddings = self._embed(all_texts)
#         resume_emb = embeddings[0]
#         results = []
#         for job_emb in embeddings[1:]:
#             cosine = self._cosine(resume_emb, job_emb)
#             score = min(cosine * 120, 100.0)
#             results.append(ScoreResult(
#                 overall=score, title_match=score, skills_match=score,
#                 experience_match=70.0, breakdown={"cosine_similarity": round(cosine, 4)},
#                 matched_skills=[], missing_skills=[],
#             ))
#         return results


class HuggingFaceScorer(ScoringProvider):
    """
    Stub HuggingFace sentence-transformer scoring provider.

    Raises NotImplementedError until HUGGINGFACE_API_KEY is configured.
    Set HUGGINGFACE_API_KEY and SCORING_PROVIDER=huggingface to enable.
    """

    def __init__(self, model: str = "sentence-transformers/all-MiniLM-L6-v2") -> None:
        self.model = model
        if not os.getenv("HUGGINGFACE_API_KEY"):
            raise NotImplementedError(
                "HuggingFaceScorer requires HUGGINGFACE_API_KEY. "
                "Set HUGGINGFACE_API_KEY and SCORING_PROVIDER=huggingface to enable HuggingFace scoring."
            )

    def score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
    ) -> ScoreResult:
        raise NotImplementedError(
            "Set HUGGINGFACE_API_KEY and SCORING_PROVIDER=huggingface to enable HuggingFace scoring"
        )

    def batch_score(
        self,
        resume_text: str,
        jobs: list[dict],
    ) -> list[ScoreResult]:
        raise NotImplementedError(
            "Set HUGGINGFACE_API_KEY and SCORING_PROVIDER=huggingface to enable HuggingFace scoring"
        )

    def get_provider_name(self) -> str:
        return "HuggingFace"
