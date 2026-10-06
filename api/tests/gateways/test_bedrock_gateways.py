import io
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.configuration.settings import Settings
from app.domain.safety import SafetyBlocked
from app.domain.errors import ApiError
from app.domain.operations import CURRENT, Budget
from app.domain.structured_output import strict_schema
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.gateways.llm_gateway import LLMUnavailable

SCHEMA = strict_schema({"answer": {"type": "string"}})


def tool_response(output):
    return SimpleNamespace(
        stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", name="respond", input=output)]
    )


def model_gateway(*responses):
    gateway = BedrockLLMGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    gateway._client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(side_effect=responses)), close=AsyncMock()
    )
    return gateway


async def test_structured_response_validates_and_retries_once():
    gateway = model_gateway(tool_response({"answer": 42}), tool_response({"answer": "valid"}))
    result = await gateway.structured(system="test", messages=[], schema=SCHEMA, effort="low", max_tokens=10)
    assert result == {"answer": "valid"}
    assert gateway._client.messages.create.await_count == 2
    kwargs = gateway._client.messages.create.call_args.kwargs
    assert kwargs["model"] == gateway.settings.bedrock_model_id
    assert kwargs["tools"][0]["input_schema"] == SCHEMA
    assert kwargs["output_config"] == {"effort": "low"}
    assert kwargs["max_tokens"] == 10


@pytest.mark.parametrize("model,effort,thinking", [
    ("anthropic.claude-sonnet-5-5", "low", {"type": "between_tools"}),
    ("anthropic.claude-sonnet-5-5", "medium", {"type": "between_tools"}),
    ("anthropic.claude-sonnet-5-5", "xhigh", None),
    ("anthropic.claude-opus-5-5", "medium", None),
])
async def test_sonnet_request_compatibility_and_thinking_blocks(model, effort, thinking):
    response = tool_response({"answer": "valid"})
    response.content.insert(0, SimpleNamespace(type="thinking", thinking="", signature="opaque"))
    gateway = model_gateway(response)
    assert await gateway.structured(system="test", messages=[], schema=SCHEMA, model=model,
                                    effort=effort, moderate=False) == {"answer": "valid"}
    kwargs = gateway._client.messages.create.call_args.kwargs
    assert kwargs["model"] == model
    assert kwargs.get("thinking") == thinking
    assert kwargs["tool_choice"]["type"] == "auto"
    assert kwargs["output_config"] == {"effort": effort}
    assert not {"temperature", "top_p", "top_k"} & kwargs.keys()


async def test_each_attempt_reports_cache_usage_before_output_failure_and_timeout(caplog):
    from scripts.summarize_agent_logs import records
    caplog.set_level("INFO")
    first, second = tool_response({"answer": 42}), tool_response({"answer": "valid"})
    for response in (first, second):
        response.usage = SimpleNamespace(input_tokens=3, output_tokens=5,
                                        cache_read_input_tokens=10, cache_creation_input_tokens=20)
    gateway = model_gateway(first, second, TimeoutError())
    repository = SimpleNamespace(begin_model_usage=AsyncMock(), finish_model_usage=AsyncMock())
    budget = Budget(time.monotonic() + 30, 200000, 4, repository=repository, user_id="authenticated-user")
    token = CURRENT.set(budget)
    try:
        assert await gateway.structured(system="test", messages=[], schema=SCHEMA, moderate=False) == {"answer": "valid"}
        with pytest.raises(LLMUnavailable):
            await gateway.structured(system="test", messages=[], schema=SCHEMA, moderate=False)
    finally:
        CURRENT.reset(token)
    calls = repository.begin_model_usage.call_args_list
    assert len(calls) == 3 and len({call.args[1] for call in calls}) == 3
    assert all(call.args[0] == "authenticated-user" for call in calls)
    assert [call.args for call in repository.finish_model_usage.call_args_list] == [
        (calls[0].args[1], 38), (calls[1].args[1], 38)]
    assert budget.actual_tokens == 76 and budget.model_calls == 3
    stages = [row for row in records(caplog.text) if row["event"] == "operation_stage" and row["stage"] == "model"]
    assert [row["status"] for row in stages] == ["completed", "completed", "failed"]
    assert stages[0]["model"] == gateway.settings.bedrock_model_id
    assert stages[0]["schema_fields"] == ["answer"]
    assert stages[0]["input_tokens"] == 3 and stages[0]["cache_write_tokens"] == 20
    assert all(row["operation_id"] == budget.operation_id for row in stages)


async def test_embedding_usage_survives_invalid_embedding_output():
    gateway = BedrockEmbeddingGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    gateway._client = Mock(invoke_model=Mock(return_value={"body": io.BytesIO(b'{"inputTextTokenCount":12}')}))
    repository = SimpleNamespace(begin_model_usage=AsyncMock(), finish_model_usage=AsyncMock())
    budget = Budget(time.monotonic() + 30, 200000, 4, repository=repository, user_id="authenticated-user")
    token = CURRENT.set(budget)
    try:
        assert await gateway.embed("test") is None
    finally:
        CURRENT.reset(token)
    call_id = repository.begin_model_usage.call_args.args[1]
    repository.finish_model_usage.assert_awaited_once_with(call_id, 12)


async def test_invalid_model_output_has_a_bounded_retry():
    gateway = model_gateway(tool_response({"answer": 42}), tool_response({"answer": 42}))
    with pytest.raises(LLMUnavailable, match="schema mismatch"):
        await gateway.structured(system="test", messages=[], schema=SCHEMA)
    assert gateway._client.messages.create.await_count == 2


async def test_whole_tutor_cap_includes_remote_work_and_leaves_one_schema_retry():
    gateway = model_gateway(tool_response({"answer": 42}), tool_response({"answer": "valid"}))
    budget = Budget(time.monotonic() + 30, 200000, 4, kind="tutor")
    budget.reserve("embedding", 0, kind="embedding")
    budget.reserve("remote answer and judge", 10000, calls=2, kind="remote")
    token = CURRENT.set(budget)
    try:
        assert await gateway.structured(system="test", messages=[], schema=SCHEMA) == {"answer": "valid"}
        assert budget.model_calls == 4 and budget.embedding_calls == 1 and budget.remote_calls == 2
        with pytest.raises(ApiError) as failed:
            await gateway.structured(system="test", messages=[], schema=SCHEMA)
        assert failed.value.code == "operation_budget_exceeded"
        assert gateway._client.messages.create.await_count == 2
        assert 0 < gateway._client.messages.create.call_args.kwargs["timeout"] <= 30
    finally:
        CURRENT.reset(token)


def test_remote_reservation_is_atomic_and_course_embedding_ceiling_is_preserved():
    budget = Budget(time.monotonic() + 30, 200000, 1)
    with pytest.raises(ApiError):
        budget.reserve("remote", 10000, calls=2, kind="remote")
    assert budget.model_calls == budget.reserved_tokens == 0
    budget.reserve("embedding", 0, kind="embedding")
    assert budget.model_calls == budget.embedding_calls == 1
    with pytest.raises(ApiError):
        budget.reserve("writer", 8000)


@pytest.mark.parametrize("reason", ["refusal", "max_tokens"])
async def test_incomplete_model_responses_are_unavailable(reason):
    gateway = model_gateway(SimpleNamespace(stop_reason=reason, content=[]))
    with pytest.raises(SafetyBlocked if reason == "refusal" else LLMUnavailable):
        await gateway.structured(system="test", messages=[], schema=SCHEMA)


async def test_text_json_response_is_still_schema_validated():
    gateway = model_gateway(
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"answer":"valid"}')])
    )
    assert await gateway.structured(system="test", messages=[], schema=SCHEMA) == {"answer": "valid"}


async def test_model_client_is_closed_once_and_released():
    gateway = model_gateway()
    client = gateway._client
    await gateway.close()
    await gateway.close()
    client.close.assert_awaited_once()
    assert gateway._client is None


async def test_offline_gateways_do_not_create_provider_clients():
    settings = Settings(_env_file=None)
    llm = BedrockLLMGateway(settings)
    embeddings = BedrockEmbeddingGateway(settings)
    with pytest.raises(LLMUnavailable, match="AWS is not configured"):
        await llm.structured(system="test", messages=[], schema=SCHEMA)
    assert await embeddings.embed("test") is None
    assert llm._client is None and embeddings._client is None


async def test_embeddings_use_titan_parameters_and_release_client():
    gateway = BedrockEmbeddingGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    client = Mock()
    client.invoke_model.return_value = {"body": io.BytesIO(b'{"embedding":[0.1,0.2]}')}
    gateway._client = client
    assert await gateway.embed("x" * 9000) == [0.1, 0.2]
    kwargs = client.invoke_model.call_args.kwargs
    assert kwargs["modelId"] == gateway.settings.embed_model_id
    assert json.loads(kwargs["body"]) == {"inputText": "x" * 8000, "dimensions": 1024, "normalize": True}
    await gateway.close()
    await gateway.close()
    client.close.assert_called_once()
    assert gateway._client is None


async def test_embedding_failure_uses_keyword_fallback():
    gateway = BedrockEmbeddingGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    gateway._client = Mock()
    gateway._client.invoke_model.side_effect = RuntimeError("provider unavailable")
    assert await gateway.embed("test") is None


@pytest.mark.parametrize("profile", [None, "test-personal"])
async def test_real_mantle_constructor_ignores_ambient_auth_and_endpoint(monkeypatch, profile):
    from app.gateways.bedrock import llm_gateway

    monkeypatch.setenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "/offline-test-only")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "bogus-ambient-bearer")
    monkeypatch.setenv("ANTHROPIC_AWS_API_KEY", "bogus-ambient-key")
    monkeypatch.setenv("ANTHROPIC_BEDROCK_MANTLE_BASE_URL", "https://untrusted.invalid/anthropic")
    frozen = SimpleNamespace(access_key="offline-app-access", secret_key="offline-app-secret", token="offline-app-token")
    provider = Mock(get_frozen_credentials=Mock(return_value=frozen))
    resolve = Mock(return_value=provider)
    monkeypatch.setattr(llm_gateway, "task_credentials", resolve)
    gateway = BedrockLLMGateway(Settings(_env_file=None, yaqin_aws_profile=profile, bedrock_region="us-east-1"))
    try:
        # Construct the installed SDK itself: no model, credential-provider or HTTP request is made.
        client = gateway._get_client()
        assert client._use_sigv4 is True
        assert client.api_key is None and client.auth_headers == {}
        assert str(client.base_url).rstrip("/") == "https://bedrock-mantle.us-east-1.api.aws/anthropic"
        assert client.max_retries == 0
        if profile:
            assert client.aws_profile == profile
            resolve.assert_not_called()
        else:
            assert (client.aws_access_key, client.aws_secret_key, client.aws_session_token) == (
                frozen.access_key, frozen.secret_key, frozen.token)
            provider.get_frozen_credentials.return_value = SimpleNamespace(
                access_key="rotated-app-access", secret_key="rotated-app-secret", token="rotated-app-token")
            assert gateway._get_client() is client
            assert client.aws_access_key == "rotated-app-access" and client.aws_session_token == "rotated-app-token"
    finally:
        await gateway.close()


def test_mantle_region_cannot_redirect_the_trusted_origin():
    gateway = BedrockLLMGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal",
                                         bedrock_region="untrusted.invalid/path"))
    with pytest.raises(LLMUnavailable, match="Invalid application Bedrock region"):
        gateway._get_client()
    assert gateway._client is None
