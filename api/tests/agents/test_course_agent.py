"""Unit tests for the Studio 'Generate with AI' course agent.

Exercises the behaviours the design promises, with a fake LLM, retrieval and repository
(no network): a grounded draft, the honest no-sources path, the repair loop recovering
from a malformed first attempt, and the eligibility re-check dropping a source that becomes
unapproved during generation.
"""

import pytest

from app.agents.course.agent import CourseAgent, _normalize
from app.domain.search import Retrieved
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable


class FakeLLM(LLMGateway):
    async def assess(self, value, source):
        pass  # explicit offline fixture

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def structured(self, **kwargs):
        if kwargs["system"].startswith("EVIDENCE_SUPPORT_REVIEW_V1"):
            from tests.support_fake import support_reply
            self.support_calls = getattr(self, "support_calls", []) + [kwargs]
            return support_reply(kwargs)
        self.calls.append(kwargs)
        if not self.outputs:
            raise LLMUnavailable("no more fake outputs")
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out

    async def close(self):
        pass


class FakeRetrieval:
    def __init__(self, retrieved):
        self._retrieved = retrieved

    async def retrieve(self, query, *, lesson=None, k=None):
        return self._retrieved


class FakeRepo:
    """Offline curriculum and source snapshots used by the agents."""
    def __init__(self, sources):
        self._sources = sources

    async def curriculum(self):
        from app.domain.courses import DEFAULT_LEVELS, SUBJECTS
        return {"subjects": SUBJECTS, "levels": DEFAULT_LEVELS}

    async def get_sources(self, ids):
        return {sid: self._sources[sid] for sid in ids if sid in self._sources}


def _approved_source(sid):
    # Generic IDs exercise drafting plumbing, not canonical scripture provenance.
    return {"id": sid, "kind": "tafsir", "ref_en": "Explanation of Al-Baqarah 2:255",
            "text_en": "Allah - there is no deity except Him.", "text_ar": "",
            "review_status": "approved"}


def _good_draft():
    bi = lambda s: {"en": s, "ar": s}  # noqa: E731 - terse test helper
    return {
        "title": bi("Tawhid"), "summary": bi("The oneness of God."),
        "cards": [
            {"kind": "concept", "title": bi("What is tawhid"), "body": bi("God is one."),
             "takeaway": bi("One God."), "sources": ["s1"]},
            {"kind": "practice", "title": bi("Reflect"), "body": bi("Notice signs of oneness."),
             "takeaway": bi("Reflect daily."), "sources": ["s1"]},
        ],
        "quiz": [{"question": bi("How many gods?"), "options": [bi("One"), bi("Two"), bi("Many")],
                  "answer": 0, "explanation": bi("Islam affirms one God.")}],
    }


def _agent(llm, sources):
    repo = FakeRepo(sources)
    retrieved = Retrieved(dict(sources), {sid: 0.9 for sid in sources})
    return CourseAgent(repo, llm, FakeRetrieval(retrieved))


@pytest.mark.asyncio
async def test_generates_grounded_lesson():
    sources = {"s1": _approved_source("s1")}
    llm = FakeLLM(_good_draft())
    out = await _agent(llm, sources).draft("teach tawhid", lang="en")
    assert out["lesson"] is not None
    assert out["grounded"] is True
    assert len(out["lesson"]["cards"]) == 2
    # every card cites an allowed source
    assert all(c.get("sources") for c in out["lesson"]["cards"])
    assert out["review"] is None and len(llm.calls) == 1
    assert not getattr(llm, "support_calls", [])


@pytest.mark.asyncio
async def test_generation_uses_course_classification():
    draft = {**_good_draft(), "subject": "aqidah", "level": 3, "tracks": ["explore", "deepen"]}
    draft["quiz"][0]["source"] = "s1"
    llm = FakeLLM(draft)
    out = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid")
    course = out["lesson"]
    assert course["subject"] == "aqidah" and course["level"] == 3
    assert course["tracks"] == ["explore"]
    assert course["quiz"][0]["source"] == "s1"
    schema = llm.calls[0]["schema"]["properties"]
    assert {"subject", "level", "tracks"} <= schema.keys()
    assert schema["tracks"]["maxItems"] == 1
    assert not {"tags", "track", "module"} & schema.keys()
    assert len(llm.calls) == 1


def test_generation_normalization_discards_legacy_classification():
    normalized = _normalize({**_good_draft(), "subject": "unknown", "level": 5,
                             "tracks": ["deepen", "unknown", "deepen"], "tags": ["old"], "module": "old"}, {"s1"})
    assert normalized["subject"] == "islam" and normalized["level"] == 1
    assert normalized["tracks"] == ["deepen"]
    assert not {"tags", "track", "module"} & normalized.keys()


@pytest.mark.parametrize("field", ["cards", "quiz"])
def test_generation_schema_rejects_oversized_course(field):
    import jsonschema

    from app.agents.course.prompts import draft_schema
    from app.domain.courses import DEFAULT_LEVELS, SUBJECTS
    from app.domain.structured_output import strict_schema

    draft = {**_good_draft(), "subject": "aqidah", "level": 1, "tracks": ["deepen"]}
    draft["quiz"][0]["source"] = "s1"
    schema = strict_schema(draft_schema(SUBJECTS, DEFAULT_LEVELS))
    jsonschema.validate(draft, schema)
    draft[field] *= 4
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(draft, schema)


@pytest.mark.asyncio
async def test_no_sources_returns_no_draft():
    llm = FakeLLM(_good_draft())  # should never be called
    out = await _agent(llm, {}).draft("obscure topic", lang="en")
    assert out["lesson"] is None
    assert out["grounded"] is False
    assert "no approved sources" in out["reason"]
    assert llm.calls == []  # the model is not invoked when nothing is retrieved


@pytest.mark.asyncio
async def test_bad_first_attempt_is_repaired_not_aborted():
    sources = {"s1": _approved_source("s1")}
    # Attempt 1: LLM unavailable (malformed/failed). Attempt 2: good draft.
    llm = FakeLLM(LLMUnavailable("boom"), _good_draft())
    out = await _agent(llm, sources).draft("teach tawhid", lang="en")
    assert out["lesson"] is not None            # recovered rather than aborting on first failure
    assert out["attempts"] >= 2


@pytest.mark.asyncio
async def test_generation_never_calls_an_editorial_reviewer():
    llm = FakeLLM(_good_draft(), RuntimeError("review must not run"))
    out = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid")
    assert out["lesson"] is not None and out["grounded"] is True
    assert out["attempts"] == 1
    assert out["review"] is None and len(llm.calls) == 1
    assert len(llm.outputs) == 1 and not getattr(llm, "support_calls", [])


@pytest.mark.asyncio
async def test_pages_are_saved_without_review_driven_repair():
    duplicate = _good_draft()
    duplicate["cards"] = [dict(duplicate["cards"][0]) for _ in range(6)]
    llm = FakeLLM(duplicate)
    out = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid")
    assert out["attempts"] == 1 and out["review"] is None
    assert len(out["lesson"]["cards"]) == 6 and len(llm.calls) == 1


@pytest.mark.asyncio
async def test_source_unapproved_during_generation_is_dropped():
    # Retrieval saw s1 as approved, but by the time we finalize it is no longer approved.
    retrieved_sources = {"s1": _approved_source("s1")}
    now_unapproved = {"s1": {**_approved_source("s1"), "review_status": "pending"}}
    repo = FakeRepo(now_unapproved)
    retrieved = Retrieved(dict(retrieved_sources), {"s1": 0.9})
    llm = FakeLLM(_good_draft())
    agent = CourseAgent(repo, llm, FakeRetrieval(retrieved))
    out = await agent.draft("teach tawhid", lang="en")
    assert out["lesson"] is None and out["reason_code"] == "source_changed"
    assert out["review"] is None and len(llm.calls) == 1


async def test_draft_schema_and_fallback_follow_current_offered_levels():
    from app.domain.courses import DEFAULT_LEVELS
    repo = FakeRepo({"s1": _approved_source("s1")})
    config = {"subjects": [{"id": "custom", "title": {"en": "Custom", "ar": "مخصص"}, "levels": [5]}],
              "levels": [*DEFAULT_LEVELS, {"id": 5, "title": {"en": "Advanced", "ar": "متقدم"}}]}

    async def curriculum():
        return config

    repo.curriculum = curriculum
    llm = FakeLLM(_good_draft())
    retrieved = Retrieved(repo._sources, {"s1": 0.9})
    agent = CourseAgent(repo, llm, FakeRetrieval(retrieved))
    out = await agent.draft("teach a new subject")
    assert out["lesson"]["subject"] == "custom" and out["lesson"]["level"] == 5
    schema = llm.calls[0]["schema"]["properties"]
    assert schema["subject"]["enum"] == ["custom"]
    assert schema["level"]["enum"] == [1, 2, 3, 4, 5]
    assert '"levels": [5]' in llm.calls[0]["messages"][0]["content"]


@pytest.mark.parametrize("phase", ["written", "checking", "reviewed"])
async def test_resume_preserves_written_draft_without_writer_or_reviewer(phase):
    from copy import deepcopy
    state = {}
    sources = {"s1": _approved_source("s1")}

    async def checkpoint(saved):
        state.clear()
        state.update(deepcopy(saved))
        if saved.get("phase") == "written":
            raise RuntimeError("simulate execution interruption")

    with pytest.raises(RuntimeError):
        await _agent(FakeLLM(_good_draft()), sources).draft("teach tawhid", checkpoint=checkpoint)
    ids = [c["id"] for c in state["lesson"]["cards"]]
    state["phase"] = phase
    llm = FakeLLM()
    result = await _agent(llm, sources).draft("teach tawhid", resume=state)
    assert result["review"] is None and result["attempts"] == 1
    assert [c["id"] for c in result["lesson"]["cards"]] == ids
    assert llm.calls == [] and not getattr(llm, "support_calls", [])


@pytest.mark.parametrize("change", ["source", "policy", "prompt"])
async def test_resume_revalidates_sources_policy_and_prompt(change):
    from copy import deepcopy
    sources = {"s1": _approved_source("s1")}
    state = {}

    async def checkpoint(saved):
        state.clear()
        state.update(deepcopy(saved))
        if saved.get("phase") == "written":
            raise RuntimeError("interrupted before saving")

    with pytest.raises(RuntimeError):
        await _agent(FakeLLM(_good_draft()), sources).draft("teach tawhid", checkpoint=checkpoint)
    if change == "source":
        sources["s1"]["review_status"] = "pending"
    elif change == "policy":
        state["policy"] = "outdated"
    else:
        state["prompt"] = "different request"
    llm = FakeLLM()
    result = await _agent(llm, sources).draft("teach tawhid", resume=state)
    assert result["lesson"] is None and llm.calls == []


async def test_interrupted_writer_consumes_attempt_before_resume():
    from copy import deepcopy
    sources = {"s1": _approved_source("s1")}
    state = None
    calls = []
    async def checkpoint(saved):
        nonlocal state
        state = deepcopy(saved)
    for execution in range(3):
        llm = FakeLLM(RuntimeError("writer execution interrupted"))
        with pytest.raises(RuntimeError):
            await _agent(llm, sources).draft("teach tawhid", resume=state, checkpoint=checkpoint)
        calls.extend(llm.calls)
        assert state["phase"] == "writing_inflight"
        assert state["attempt"] == execution + 2
    # Direct author calls cannot reset the three-attempt ceiling either.
    llm = FakeLLM(_good_draft())
    out = await _agent(llm, sources).draft("teach tawhid", resume=state, checkpoint=checkpoint)
    assert out["lesson"] is None and out["attempts"] == 3
    assert len(calls) == 3 and not llm.calls


@pytest.mark.parametrize("first_output", [LLMUnavailable("writer unavailable"), {"cards": []}])
async def test_failed_writer_checkpoint_keeps_next_attempt_and_feedback(first_output):
    from copy import deepcopy
    state = None
    async def checkpoint(saved):
        nonlocal state
        state = deepcopy(saved)
        if saved.get("phase") == "writing" and saved.get("feedback"):
            raise RuntimeError("interrupt after failed writer")
    sources = {"s1": _approved_source("s1")}
    with pytest.raises(RuntimeError):
        await _agent(FakeLLM(first_output), sources).draft("teach tawhid", checkpoint=checkpoint)
    assert state["attempt"] == 2 and state["feedback"]
    llm = FakeLLM(_good_draft())
    out = await _agent(llm, sources).draft("teach tawhid", resume=state)
    assert out["attempts"] == 2 and out["review"] is None
    assert state["feedback"] in llm.calls[0]["messages"][0]["content"]
