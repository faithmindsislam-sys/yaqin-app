"""Offline provider and service boundary regressions; no live AWS policy is implied."""
import copy
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

from app.agents.course.agent import CourseAgent
from app.agents.review.agent import ReviewAgent
from app.agents.tutor.agent import TutorAgent
from app.configuration.settings import Settings
from app.contracts.tutor import AskRequest, ExplainRequest
from app.domain.errors import ApiError
from app.domain.operations import CURRENT, Budget
from app.domain.safety import SafetyBlocked, SafetyFailure, content_text
from app.domain.search import Retrieved
from app.domain.users import User
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.gateways.bedrock.safety import MAX_TEXT, BedrockSafety
from app.gateways.http_agent_gateway import HttpAgentGateway
from app.services.lesson_service import LessonService
from tests.agents.test_course_agent import FakeRepo, FakeRetrieval, _approved_source, _good_draft
from tests.conftest import FakeLLM

pytestmark = pytest.mark.runtime_safety


def safety():
    gate = BedrockSafety(Settings(_env_file=None, yaqin_aws_profile="test", guardrail_id="abc", guardrail_version="1"))
    gate._client = Mock()
    gate._client.apply_guardrail.side_effect = lambda **kw: {
        "action": "NONE", "guardrailCoverage": {"textCharacters": {"guarded": len(kw["content"][0]["text"]["text"])}}}
    return gate


@pytest.mark.parametrize("text", ["Why is abuse wrong?", "I respectfully disagree with this interpretation.", "ما حكم العنف؟"])
async def test_sensitive_educational_input_can_pass(text):
    gate = safety()
    await gate.assess(text, "INPUT")
    kw = gate._client.apply_guardrail.call_args.kwargs
    assert kw["source"] == "INPUT" and kw["guardrailVersion"] == "1"
    assert kw["content"] == [{"text": {"text": text, "qualifiers": ["guard_content"]}}]


async def test_exact_moderation_reuse_is_operation_policy_provider_and_direction_scoped():
    gate = safety()
    other = safety()
    budget = Budget(time.monotonic() + 10, 200000, 8)
    token = CURRENT.set(budget)
    try:
        await gate.assess({"body": {"en": "English", "ar": "العربية"}}, "INPUT")
        await gate.assess("English\nالعربية", "INPUT")
        assert gate._client.apply_guardrail.call_count == budget.assessments == 1
        await gate.assess("English\nالعربية", "OUTPUT")
        await gate.assess("changed", "INPUT")
        gate.settings.guardrail_version = "2"
        await gate.assess("English\nالعربية", "INPUT")
        await other.assess("English\nالعربية", "INPUT")
        assert gate._client.apply_guardrail.call_count == 4
        assert other._client.apply_guardrail.call_count == 1
        assert budget.assessments == 5
        budget.deadline = time.monotonic() - 1
        with pytest.raises(ApiError, match="limits"):
            await gate.assess("English\nالعربية", "INPUT")
    finally:
        CURRENT.reset(token)
    token = CURRENT.set(Budget(time.monotonic() + 10, 200000, 8))
    try:
        await gate.assess("English\nالعربية", "INPUT")
        assert gate._client.apply_guardrail.call_count == 5
    finally:
        CURRENT.reset(token)


@pytest.mark.parametrize("response", [{"action": "GUARDRAIL_INTERVENED"}, {"action": "NONE"}])
async def test_failed_moderation_is_never_reused(response):
    gate = safety()
    gate._client.apply_guardrail.side_effect = None
    gate._client.apply_guardrail.return_value = response
    budget = Budget(time.monotonic() + 10, 200000, 8)
    token = CURRENT.set(budget)
    try:
        for _ in range(2):
            with pytest.raises(SafetyFailure):
                await gate.assess("private", "INPUT")
        assert not budget.assessment_cache
        assert gate._client.apply_guardrail.call_count == budget.assessments == 2
    finally:
        CURRENT.reset(token)


@pytest.mark.parametrize("response", [{"action": "GUARDRAIL_INTERVENED"}, {},
                                      {"action": "NONE"}, {"action": "NONE", "guardrailCoverage": {"textCharacters": {"guarded": 1}}}])
async def test_intervention_missing_or_partial_assessment_never_passes(response):
    gate = safety()
    gate._client.apply_guardrail.side_effect = None
    gate._client.apply_guardrail.return_value = response
    with pytest.raises(SafetyFailure):
        await gate.assess("private content", "OUTPUT")
    assert gate._client.apply_guardrail.call_count == 1


@pytest.mark.parametrize("version", ["", "DRAFT", "0", "1.0"])
async def test_unpublished_configuration_never_contacts_aws(version):
    gate = safety()
    gate.settings.guardrail_version = version
    with pytest.raises(SafetyFailure):
        await gate.assess("text", "INPUT")
    gate._client.apply_guardrail.assert_not_called()


async def test_moderation_outage_and_oversize_fail_closed_without_payload_logs(caplog):
    gate = safety()
    gate._client.apply_guardrail.side_effect = RuntimeError("SECRET question and output")
    with pytest.raises(SafetyFailure, match="^safety_unavailable$"):
        await gate.assess("private", "OUTPUT")
    assert "SECRET" not in caplog.text
    assert gate._client.apply_guardrail.call_count == 1
    with pytest.raises(SafetyFailure):
        await gate.assess("x" * (MAX_TEXT + 1), "INPUT")
    assert gate._client.apply_guardrail.call_count == 1


@pytest.mark.parametrize("error_code,logged", [("AccessDeniedException", "AccessDeniedException"),
                                              ("ThrottlingException", "ThrottlingException"),
                                              ("SECRET_UNKNOWN_CODE", "provider_error")])
async def test_safety_diagnostics_identify_provider_error_without_private_data(caplog, error_code, logged):
    from botocore.exceptions import ClientError

    gate = safety()
    gate._client.apply_guardrail.side_effect = ClientError(
        {"Error": {"Code": error_code, "Message": "SECRET provider message"}}, "ApplyGuardrail")
    with pytest.raises(SafetyFailure):
        await gate.assess("SECRET request", "INPUT")
    assert f"reason=provider_failure source=INPUT error={logged}" in caplog.text
    assert "SECRET" not in caplog.text


@pytest.mark.parametrize("response,reason", [({"action": "GUARDRAIL_INTERVENED", "outputs": [{"text": "SECRET"}]},
                                             "intervention"),
                                            ({"action": "NONE"}, "incomplete_assessment")])
async def test_safety_diagnostics_distinguish_intervention_from_incomplete_assessment(caplog, response, reason):
    gate = safety()
    gate._client.apply_guardrail.side_effect = None
    gate._client.apply_guardrail.return_value = response
    with pytest.raises(SafetyFailure):
        await gate.assess("SECRET response", "OUTPUT")
    assert f"reason={reason} source=OUTPUT" in caplog.text
    assert "SECRET" not in caplog.text


async def test_invalid_assessment_source_is_not_logged(caplog):
    with pytest.raises(SafetyFailure):
        await safety().assess("SECRET content", "SECRET source")
    assert "reason=input_limits source=INVALID" in caplog.text
    assert "SECRET" not in caplog.text


@pytest.mark.parametrize("status,data,reason", [
    (503, {"error": "SECRET"}, "upstream_status"),
    (200, {"answer": "SECRET"}, "invalid_contract"),
    (200, {"schemaVersion": "1", "answer": "SECRET"}, "missing_safety_outcome"),
    (422, {"errorCode": "safety_blocked", "error": "SECRET"}, "safety_blocked"),
    (503, {"errorCode": "safety_unavailable", "error": "SECRET"}, "safety_unavailable"),
])
async def test_remote_safety_diagnostics_identify_boundary_without_payload(caplog, status, data, reason):
    remote = HttpAgentGateway(Settings(_env_file=None, agents_service_url="https://agents.test"))
    await remote.client.aclose()
    remote.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(status, json=data)))
    try:
        with pytest.raises(SafetyFailure):
            await remote.ask({"question": "SECRET"}, authorization="Bearer SECRET")
        assert f"reason={reason} status={status}" in caplog.text
        assert "SECRET" not in caplog.text
    finally:
        await remote.close()


@pytest.mark.parametrize("timeout,reason,error", [(True, "transport_error", "ReadTimeout"),
                                                  (False, "invalid_json", "JSONDecodeError")])
async def test_remote_transport_diagnostics_do_not_log_exception_text(caplog, timeout, reason, error):
    def response(req):
        if timeout:
            raise httpx.ReadTimeout("SECRET exception", request=req)
        return httpx.Response(200, text="SECRET invalid JSON")

    remote = HttpAgentGateway(Settings(_env_file=None, agents_service_url="https://agents.test"))
    await remote.client.aclose()
    remote.client = httpx.AsyncClient(transport=httpx.MockTransport(response))
    try:
        with pytest.raises(SafetyFailure):
            await remote.ask({}, authorization="Bearer SECRET")
        assert f"reason={reason} error={error}" in caplog.text
        assert "SECRET" not in caplog.text
    finally:
        await remote.close()


@pytest.mark.parametrize("field", ["answer", "follow_ups", "feedback", "misconceptions", "cards", "quiz", "issues"])
async def test_decoded_tool_fields_are_assessed_before_return_or_schema_retry(field):
    gate = BedrockLLMGateway(Settings(_env_file=None, yaqin_aws_profile="test"))
    gate.safety = safety()
    payload = {field: [{"en": "BLOCK", "ar": "محظور"}]}  # deliberately invalid schema too
    gate._client = SimpleNamespace(messages=SimpleNamespace(create=AsyncMock(return_value=SimpleNamespace(
        stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", name="respond", input=payload)]))))
    seen = []

    def assess(**kw):
        text = kw["content"][0]["text"]["text"]
        seen.append((kw["source"], text))
        return {"action": "GUARDRAIL_INTERVENED"} if "BLOCK" in text else {
            "action": "NONE", "guardrailCoverage": {"textCharacters": {"guarded": len(text)}}}

    gate.safety._client.apply_guardrail.side_effect = assess
    with pytest.raises(SafetyBlocked):
        await gate.structured(system="TRUSTED INSTRUCTION", messages=[{"role": "user", "content": "question"}],
                              schema={"type": "object", "required": ["answer"]})
    assert gate._client.messages.create.await_count == 1
    assert "TRUSTED INSTRUCTION" not in seen[0][1]
    assert seen[-1] == ("OUTPUT", "BLOCK\nمحظور")


@pytest.mark.parametrize("exc", [SafetyBlocked(), SafetyFailure()])
async def test_input_safety_failure_never_calls_classifier_or_keyword_retrieval(exc):
    llm = FakeLLM()
    llm.assess = AsyncMock(side_effect=exc)
    retrieval = SimpleNamespace(retrieve=AsyncMock())
    tutor = TutorAgent(Mock(), llm, retrieval)
    result = await tutor.ask(AskRequest(question="private"))
    assert not result["sources"] and not result["follow_ups"] and not result["ai_generated"]
    assert "private" not in str(result) and not llm.calls
    retrieval.retrieve.assert_not_awaited()
    result = await tutor.explain_back(ExplainRequest(lesson_id="x", transcript="private", lang="ar"))
    assert not result["covered"] and not result["misconceptions"] and not result["sources"]


@pytest.mark.parametrize("code,status", [("safety_blocked", 422), ("safety_unavailable", 503), (None, 503)])
async def test_http_safety_failures_do_not_enter_local_model_fallback(code, status):
    remote = HttpAgentGateway(Settings(_env_file=None, agents_service_url="https://agents.test"))
    await remote.client.aclose()
    remote.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(
        status, json={"errorCode": code, "error": "SECRET"})))
    llm = FakeLLM({"tier": "A", "search_query": "wudu"})
    sources = {"quran:5:6": _approved_source("quran:5:6")}
    repo = SimpleNamespace(get_lesson=AsyncMock(return_value=None), log_tutor=AsyncMock())
    tutor = TutorAgent(repo, llm, FakeRetrieval(Retrieved(sources, {"quran:5:6": .9})), remote)
    result = await tutor.ask(AskRequest(question="wudu"), authorization="Bearer test")
    assert len(llm.calls) == 1 and not result["sources"] and not result["follow_ups"]
    assert "SECRET" not in str(result)
    await remote.close()


@pytest.mark.parametrize("stage", ["writer", "output", "sources"])
async def test_course_block_clears_candidates_without_review(stage):
    sources = {"s1": _approved_source("s1")}
    llm = FakeLLM(SafetyBlocked()) if stage == "writer" else FakeLLM(_good_draft())
    async def assess(value, source):
        if isinstance(value, dict) and ((stage == "output" and "lesson" in value) or (stage == "sources" and "s1" in value)):
            raise SafetyBlocked()
    llm.assess = assess
    repo = FakeRepo(sources)
    author = CourseAgent(repo, llm, FakeRetrieval(Retrieved(sources, {"s1": .9})))
    result = await author.draft("topic")
    assert result["lesson"] is None and result["review"] is None
    assert len(llm.calls) == (0 if stage == "sources" else 1)


@pytest.mark.parametrize("boundary", ["approve", "live"])
@pytest.mark.parametrize("exc", [SafetyBlocked(), SafetyFailure()])
async def test_manual_publication_does_not_depend_on_safety_service(boundary, exc):
    draft = {"id": "l1", "status": "published", "subject": "aqidah", "level": 1, "tracks": ["explore"],
             **_good_draft()}
    draft["cards"][0]["body"]["ar"] = "محظور"
    llm = FakeLLM()
    llm.assess = AsyncMock(side_effect=exc)
    repo = SimpleNamespace(get_lesson=AsyncMock(return_value=draft), get_sources=AsyncMock(return_value={"s1": {}}),
                           transition_lesson=AsyncMock(), update_published=AsyncMock(), get_account=AsyncMock(return_value={}),
                           curriculum=AsyncMock(return_value={"tracks": [{"id": "explore"}],
                                                             "subjects": [{"id": "aqidah", "levels": [1]}],
                                                             "levels": [{"id": 1}]}))
    service = LessonService(repo, ReviewAgent(repo, llm), Mock(), Mock())
    user = User(id="admin", role="admin")
    if boundary == "approve":
        await service.decide("l1", "approve", "", user)
        repo.transition_lesson.assert_awaited_once()
        repo.update_published.assert_not_awaited()
    else:
        await service.save_draft(copy.deepcopy(draft), user, live=True)
        repo.update_published.assert_awaited_once()
        repo.transition_lesson.assert_not_awaited()
    llm.assess.assert_not_awaited()
    assert not llm.calls


async def test_cached_review_cannot_skip_new_safety_assessment():
    llm = FakeLLM({"issues": []})
    reviewer = ReviewAgent(FakeRepo({}), llm)
    draft = {"id": "x", "title": {"en": "Study"}, "cards": []}
    assert (await reviewer.check(draft))["ready_for_reviewer"]
    llm.assess = AsyncMock(side_effect=SafetyFailure())
    result = await reviewer.check(draft)
    assert result["safety_outcome"] == "safety_unavailable" and not result["ready_for_reviewer"]
    assert len(llm.calls) == 1


async def test_missing_aws_configuration_fails_closed():
    gateway = BedrockLLMGateway(Settings(_env_file=None))
    with pytest.raises(SafetyFailure):
        await gateway.structured(system="trusted", messages=[], schema={})
    assert gateway._client is None


@pytest.mark.parametrize("outcome", [None, "unknown"])
async def test_successful_remote_http_without_allowed_safety_outcome_fails_closed(outcome):
    remote = HttpAgentGateway(Settings(_env_file=None, agents_service_url="https://agents.test"))
    await remote.client.aclose()
    remote.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={
        "schemaVersion": "1", "answer": "private", "makesReligiousClaim": True, "safetyOutcome": outcome})))
    with pytest.raises(SafetyFailure):
        await remote.ask({}, authorization="Bearer test")
    await remote.close()


async def test_sdk_calls_use_one_attempt_and_bounded_timeouts(monkeypatch):
    import boto3

    gate = safety()
    client = gate._client
    gate._client = None
    session = Mock()
    session.client.return_value = client
    monkeypatch.setattr(boto3, "Session", Mock(return_value=session))
    await gate.assess("question", "INPUT")
    config = session.client.call_args.kwargs["config"]
    assert config.connect_timeout == 2 and config.read_timeout == 5
    assert config.retries == {"total_max_attempts": 1}


async def test_final_output_block_drops_all_generated_and_fallback_fields():
    llm = FakeLLM()
    # _ask (mocked here) owns the single INPUT check; ask() runs the single OUTPUT check.
    llm.assess = AsyncMock(side_effect=[SafetyBlocked()])
    tutor = TutorAgent(SimpleNamespace(log_tutor=AsyncMock()), llm, Mock())
    tutor._ask = AsyncMock(return_value={"tier": "A", "answer": [{"type": "text", "text": "BLOCK"}],
                                       "sources": {}, "follow_ups": ["BLOCK"], "ai_generated": True})
    result = await tutor.ask(AskRequest(question="question"))
    assert result["safety_outcome"] == "safety_blocked" and "BLOCK" not in str(result)
    assert not result["follow_ups"] and not result["sources"] and not result["ai_generated"]


def test_nested_bilingual_payload_extraction_and_production_configuration():
    assert content_text({"cards": [{"body": {"en": "English", "ar": "العربية"}}]}) == "English\nالعربية"
    from app.container import create_services

    with pytest.raises(RuntimeError, match="GUARDRAIL"):
        create_services(Mock(), Settings(_env_file=None, env="prod", quran_s3_uri="s3://test/quran/"))
