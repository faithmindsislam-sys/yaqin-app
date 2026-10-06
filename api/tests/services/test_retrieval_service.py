from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.domain.search import Hit
from app.gateways.embedding_gateway import EmbeddingGateway
from app.services.retrieval_service import RetrievalService


class StubEmbeddings(EmbeddingGateway):
    def __init__(self, vector):
        self.vector = vector

    async def embed(self, text: str):
        return self.vector

    async def close(self):
        pass


@pytest.mark.parametrize("vector,expected", [(None, ["approved"]), ([0.1], [])])
async def test_injected_embeddings_select_threshold_and_pending_sources_are_excluded(vector, expected):
    repository = SimpleNamespace(
        search=AsyncMock(return_value=[Hit("approved", 0.25, "text"), Hit("pending", 0.9, "text")]),
        get_sources=AsyncMock(
            return_value={"approved": {"review_status": "approved"}, "pending": {"review_status": "pending"}}
        ),
    )
    service = RetrievalService(repository, StubEmbeddings(vector), k=8, vector_floor=0.32)
    result = await service.retrieve("question")
    assert result.ids == expected
    repository.search.assert_awaited_once_with("question", k=8, embedding=vector)


@pytest.mark.parametrize("status,links,expect_canonical", [
    ("approved", ["hadith:henc:3313"], True),
    ("pending", ["hadith:henc:3313"], False),
    ("approved", ["hadith:henc:3313", "hadith:henc:999"], False),
])
async def test_explicit_relation_adds_only_approved_canonical_candidate_under_own_id(status, links, expect_canonical):
    from tests.domain.test_source_policy import HENC
    legacy = {"id": "hadith:bukhari:164", "kind": "hadith", "text_ar": "Legacy Arabic wording.",
              "text_en": "Legacy English wording.", "review_status": "approved", "see_also": links}
    canonical = {**HENC, "review_status": status}
    rows = {s["id"]: s for s in (legacy, canonical)}
    async def get_sources(ids):
        return {sid: rows[sid] for sid in ids if sid in rows}
    repository = SimpleNamespace(search=AsyncMock(return_value=[Hit(legacy["id"], 0.8, "text")]), get_sources=get_sources)
    result = await RetrievalService(repository, StubEmbeddings(None), k=8, vector_floor=0.32).retrieve("question")
    assert result.sources[legacy["id"]] == legacy
    assert (canonical["id"] in result.sources) == expect_canonical
    if expect_canonical:
        assert result.ids[0] == canonical["id"] and result.sources[canonical["id"]] == canonical


async def test_page_sources_loads_complete_original_evidence_without_embedding_or_search():
    sources = {sid: {"id": sid, "kind": "fiqh", "review_status": "approved", "text_en": f"Original {sid}"}
               for sid in ("fiqh:one", "fiqh:two")}
    repository = SimpleNamespace(get_sources=AsyncMock(return_value=sources), search=AsyncMock())
    embeddings = SimpleNamespace(embed=AsyncMock())
    service = RetrievalService(repository, embeddings, k=8, vector_floor=0.32)
    result = await service.page_sources({"sources": ["fiqh:one", "fiqh:two", "fiqh:one"],
                                       "body": {"en": "Course prose is not evidence"}})
    assert result.ids == ["fiqh:one", "fiqh:two"] and result.sources == sources
    repository.get_sources.assert_awaited_once_with(["fiqh:one", "fiqh:two"])
    embeddings.embed.assert_not_awaited()
    repository.search.assert_not_awaited()


@pytest.mark.parametrize("invalid", ["missing", "pending", "wrong-id", "empty", "unsupported-translation"])
async def test_page_sources_never_accepts_partial_pending_or_unusable_evidence(invalid):
    source = {"id": "fiqh:one", "kind": "fiqh", "review_status": "approved", "text_en": "Original evidence"}
    if invalid == "pending":
        source["review_status"] = "pending"
    elif invalid == "wrong-id":
        source["id"] = "fiqh:other"
    elif invalid == "empty":
        source["text_en"] = " "
    elif invalid == "unsupported-translation":
        source["kind"] = "quran"  # Unsupported English cannot stand in for absent original Arabic.
    repository = SimpleNamespace(get_sources=AsyncMock(return_value={} if invalid == "missing" else {"fiqh:one": source}))
    service = RetrievalService(repository, None, k=8, vector_floor=0.32)
    assert await service.page_sources({"sources": ["fiqh:one"]}) is None


@pytest.mark.parametrize("ids", [None, [], "fiqh:one", [None], [{"id": "fiqh:one"}], [""], ["no-colon"], ["quran:5:6]]"],
                                 [f"fiqh:{n}" for n in range(13)]])
async def test_page_sources_invalid_or_oversized_citations_leave_normal_retrieval_available(ids):
    repository = SimpleNamespace(get_sources=AsyncMock())
    service = RetrievalService(repository, None, k=8, vector_floor=0.32)
    assert await service.page_sources({"sources": ids}) is None
    repository.get_sources.assert_not_awaited()


async def test_page_sources_preserves_canonical_provider_relation_under_its_own_identity():
    from tests.domain.test_source_policy import HENC
    legacy = {"id": "hadith:bukhari:164", "kind": "hadith", "review_status": "approved",
              "text_ar": "Original Arabic", "see_also": [HENC["id"]]}
    canonical = {**HENC, "review_status": "approved"}
    repository = SimpleNamespace(get_sources=AsyncMock(side_effect=[{legacy["id"]: legacy}, {canonical["id"]: canonical}]))
    service = RetrievalService(repository, None, k=8, vector_floor=0.32)
    result = await service.page_sources({"sources": [legacy["id"]]})
    assert result.ids == [canonical["id"], legacy["id"]]
    assert result.sources[legacy["id"]] == legacy and result.sources[canonical["id"]] == canonical
