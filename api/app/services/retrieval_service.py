"""Direct approved page evidence for explicit actions; hybrid search for broader questions."""

from __future__ import annotations

import hashlib
import re

from app.domain.lessons import lesson_source_ids
from app.domain.operations import diagnostic, stage
from app.domain.search import Hit, Retrieved
from app.domain.source_policy import source_view
from app.domain.support import evidence_texts
from app.gateways.embedding_gateway import EmbeddingGateway
from app.repositories.repository import Repository

LESSON_BOOST = 0.15
BM25_FLOOR = 0.2  # relative to the best keyword hit


class RetrievalService:
    def __init__(self, repository: Repository, embeddings: EmbeddingGateway, *, k: int, vector_floor: float):
        self.repository = repository
        self.embeddings = embeddings
        self.k = k
        self.vector_floor = vector_floor

    async def retrieve(self, query: str, *, lesson: dict | None = None, k: int | None = None) -> Retrieved:
        k = k or self.k
        vector = await self.embeddings.embed(query)
        with stage("source_search", search_mode="hybrid" if vector is not None else "keyword", k=k):
            hits: list[Hit] = await self.repository.search(query, k=k, embedding=vector)
        floor = self.vector_floor if vector is not None else BM25_FLOOR

        scores: dict[str, float] = {h.source_id: h.score for h in hits if h.score >= floor}
        for sid in lesson_source_ids(lesson):
            # A question asked inside a lesson is about that lesson's material.
            scores[sid] = max(scores.get(sid, 0.0), floor) + LESSON_BOOST

        ranked = sorted(scores, key=lambda i: -scores[i])[: k + len(lesson_source_ids(lesson))]
        with stage("source_load", source_count=len(ranked)):
            found = await self.repository.get_sources(ranked)
        ordered = {i: found[i] for i in ranked if i in found and found[i].get("review_status") == "approved"}
        result = await self._with_related(ordered, scores, k)
        diagnostic("retrieval_result", retrieval_mode="hybrid" if vector is not None else "keyword",
                   query_hash=hashlib.sha256(query.encode()).hexdigest(), hit_count=len(hits), floor=floor,
                   lesson_source_ids=lesson_source_ids(lesson), source_ids=result.ids, scores=result.scores)
        return result

    async def page_sources(self, page: dict) -> Retrieved | None:
        """For explicit page actions only. Incomplete evidence falls back to normal retrieval."""
        ids = page.get("sources")
        if (not isinstance(ids, list) or not ids
                or any(not isinstance(sid, str) or not re.fullmatch(r"[a-z]+:[^\s\]]{1,120}", sid) for sid in ids)):
            return None
        ids = list(dict.fromkeys(ids))
        # Match the page-context citation cap; never silently select part of its evidence.
        if len(ids) > 12:
            return None
        found = await self.repository.get_sources(ids)
        if any(not isinstance(found.get(sid), dict) or found[sid].get("id") != sid
               or found[sid].get("review_status") != "approved"
               or not any(value.strip() for value in evidence_texts(found[sid])) for sid in ids):
            return None
        result = await self._with_related({sid: found[sid] for sid in ids}, {sid: 1.0 for sid in ids}, self.k)
        diagnostic("retrieval_result", retrieval_mode="page_sources", source_ids=result.ids, scores=result.scores)
        return result

    async def _with_related(self, ordered: dict, scores: dict, k: int) -> Retrieved:
        # A single explicit relation adds a candidate under its OWN identity, never replaces
        # a legacy narration. Ambiguous relations need independent retrieval/reviewer choice.
        related = {}
        for sid, source in ordered.items():
            links = source.get("see_also")
            if (source.get("kind") == "hadith" and isinstance(links, list) and len(links) == 1
                    and isinstance(links[0], str) and re.fullmatch(r"hadith:henc:[1-9][0-9]*", links[0])):
                related[links[0]] = sid
        if related:
            canonical = await self.repository.get_sources(list(related)[:k])
            for sid, source in canonical.items():
                if (sid in related and source.get("id") == sid and source.get("review_status") == "approved" and source.get("kind") == "hadith"
                        and source_view(source).get("translation_status_en") == "published"):
                    ordered.setdefault(sid, source)
                    scores.setdefault(sid, scores[related[sid]])
        # Provider precedence changes candidate order, not text, IDs or source approval.
        ordered = dict(sorted(ordered.items(), key=lambda pair: not (
            pair[1].get("kind") == "hadith"
            and source_view(pair[1]).get("translation_status_en") == "published")))
        return Retrieved(ordered, {i: round(scores[i], 4) for i in ordered})
