"""Claude on Amazon Bedrock (Mantle Messages API), with locally validated tool output."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import jsonschema

from app.configuration.settings import Settings
from app.domain.operations import CURRENT, diagnostic, stage
from app.domain.safety import SafetyBlocked, SafetyFailure
from app.gateways.bedrock.identity import task_credentials
from app.gateways.bedrock.safety import BedrockSafety
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable

log = logging.getLogger(__name__)


RESPOND_TOOL = "respond"


class BedrockLLMGateway(LLMGateway):
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self.safety = BedrockSafety(settings)

    async def assess(self, value, source: str) -> None:
        await self.safety.assess(value, source)

    async def close(self) -> None:
        """Release the HTTP client when the application stops or reloads."""
        client, self._client = self._client, None
        if client is not None:
            await client.close()
        await self.safety.close()

    def _get_client(self):
        s = self.settings
        if not s.aws_enabled:
            raise LLMUnavailable("AWS is not configured for this app")
        if not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-[1-9][0-9]*", s.bedrock_region):
            raise LLMUnavailable("Invalid application Bedrock region")
        credentials = task_credentials().get_frozen_credentials() if not s.aws_profile else None
        if self._client is None:
            from anthropic import AsyncAnthropicBedrockMantle

            kwargs: dict[str, Any] = {
                "aws_region": s.bedrock_region, "timeout": 60.0, "max_retries": 0,
                "base_url": f"https://bedrock-mantle.{s.bedrock_region}.api.aws/anthropic",
            }
            if s.aws_profile:
                kwargs["aws_profile"] = s.aws_profile
            else:
                # Auth mode is fixed during SDK construction, before any refresh mutation.
                kwargs.update(aws_access_key=credentials.access_key, aws_secret_key=credentials.secret_key,
                              aws_session_token=credentials.token)
            self._client = AsyncAnthropicBedrockMantle(**kwargs)
        if credentials:
            self._client.aws_access_key = credentials.access_key
            self._client.aws_secret_key = credentials.secret_key
            self._client.aws_session_token = credentials.token
        return self._client

    async def structured(
        self, *, system: str, messages: list[dict], schema: dict, effort: str = "medium", max_tokens: int = 4000,
        safety_input=None, moderate: bool = True, model: str | None = None, think: bool = True,
    ) -> dict:
        """Moderate data separately from instructions, generate JSON, then moderate decoded fields.

        SafetyFailure must never be caught as a model outage or schema repair signal.
        """
        # Callers that moderate the whole operation once (the tutor) pass moderate=False.
        if moderate:
            await self.assess(messages if safety_input is None else safety_input, "INPUT")
        client = self._get_client()
        # Bedrock's Messages endpoint rejects output_config.format and strict tools, and Claude 5.5
        # rejects forced tool_choice: the schema rides on a tool, and we validate the result here.
        tool = {
            "name": RESPOND_TOOL,
            "description": "Return your complete response. Call this exactly once.",
            "input_schema": schema,
        }
        last_error = "no structured response from model"
        for _attempt in range(2):
            diagnostic("model_attempt", attempt=_attempt + 1, model=model or self.settings.bedrock_model_id)
            try:
                data = await self._call(client, system, messages, tool, effort, max_tokens, model, think)
                if moderate:
                    await self.assess(data, "OUTPUT")
                jsonschema.validate(data, schema)
                return data
            except jsonschema.ValidationError:
                last_error = "schema mismatch"
                diagnostic("model_schema_rejected", attempt=_attempt + 1)
                log.warning("model output failed schema")
        raise LLMUnavailable(last_error)

    async def stream_text(self, *, system: str, messages: list[dict], max_tokens: int = 1500,
                          model: str | None = None, effort: str = "low"):
        """Yield plain-text deltas as the model writes. Moderation is the caller's job."""
        import anthropic

        client = self._get_client()
        selected_model = model or self.settings.bedrock_model_id
        thinking = {} if "haiku" in selected_model else {"thinking": {"type": "disabled"}}
        budget = CURRENT.get()
        if budget:
            budget.reserve([system, messages], max_tokens)
        call_id = await budget.begin_usage() if budget else None
        final = None
        diagnostic("model_attempt", attempt=1, model=selected_model, streaming=True)
        try:
            with stage("model", model=selected_model, effort=effort, streaming=True, max_tokens=max_tokens) as metrics:
                async with client.messages.stream(
                    model=selected_model, max_tokens=max_tokens, system=system, messages=messages,
                    **({} if "haiku" in selected_model else {"output_config": {"effort": effort}}),
                    **thinking,
                    timeout=min(60.0, budget.remaining()) if budget else 60.0,
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
                    final = await stream.get_final_message()
                usage = getattr(final, "usage", None)
                metrics.update(actual_model=getattr(final, "model", None), stop_reason=final.stop_reason,
                               input_tokens=getattr(usage, "input_tokens", None),
                               output_tokens=getattr(usage, "output_tokens", None))
        except anthropic.RateLimitError as e:
            diagnostic("model_failure", reason="rate_limited", status_code=e.status_code)
            raise LLMUnavailable("rate limited upstream") from e
        except anthropic.APIStatusError as e:
            diagnostic("model_failure", reason="upstream_status", status_code=e.status_code)
            raise LLMUnavailable(f"upstream status {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            diagnostic("model_failure", reason="connection", error_type=type(e).__name__)
            raise LLMUnavailable("upstream connection failed") from e
        finally:
            if budget:
                usage = getattr(final, "usage", None)
                tokens = budget.usage(getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None),
                                      getattr(usage, "cache_read_input_tokens", None),
                                      getattr(usage, "cache_creation_input_tokens", None))
                await budget.finish_usage(call_id, tokens)
        if final is not None and final.stop_reason in ("refusal", "guardrail_intervened", "content_filtered"):
            raise SafetyBlocked()

    async def _call(self, client, system: str, messages: list[dict], tool: dict, effort: str, max_tokens: int,
                    model: str | None = None, think: bool = True) -> dict:
        import anthropic

        selected_model = model or self.settings.bedrock_model_id
        # Sonnet 5.5 otherwise enables upfront thinking by default, even for simple chat.
        thinking = {"thinking": {"type": "between_tools"}} if (
            selected_model == "anthropic.claude-sonnet-5-5" and effort in {"low", "medium", "high"}
        ) else {}
        if not think and "haiku" not in selected_model:
            # Grounded answering needs no hidden reasoning: thinking tokens only add latency.
            thinking = {"thinking": {"type": "disabled"}}
        budget = CURRENT.get()
        if budget:
            budget.reserve([system, messages, tool], max_tokens)
        call_id = await budget.begin_usage() if budget else None
        try:
            with stage("model", model=selected_model, effort=effort,
                       thinking=thinking.get("thinking", {}).get("type"),
                       schema_fields=sorted(tool["input_schema"].get("properties", {})),
                       max_tokens=max_tokens, input_bytes=len(json.dumps([system, messages, tool], ensure_ascii=False).encode())) as metrics:
                resp = await client.messages.create(
                    model=selected_model,
                    max_tokens=max_tokens,
                    system=f"{system}\n\nRespond only by calling the `{RESPOND_TOOL}` tool exactly once.",
                    messages=messages,
                    tools=[tool],
                    tool_choice={"type": "auto", "disable_parallel_tool_use": True},
                    # Haiku models reject the effort parameter; they have no extended-thinking budget to set.
                    **({} if "haiku" in selected_model else {"output_config": {"effort": effort}}),
                    **thinking,
                    timeout=min(60.0, budget.remaining()) if budget else 60.0,
                )
                usage = getattr(resp, "usage", None)
                metrics.update(actual_model=getattr(resp, "model", None), stop_reason=resp.stop_reason,
                    input_tokens=getattr(usage, "input_tokens", None), output_tokens=getattr(usage, "output_tokens", None),
                    cache_read_tokens=getattr(usage, "cache_read_input_tokens", None),
                    cache_write_tokens=getattr(usage, "cache_creation_input_tokens", None),
                    provider_request_id=getattr(resp, "_request_id", None))
        except anthropic.RateLimitError as e:
            diagnostic("model_failure", reason="rate_limited", status_code=e.status_code)
            raise LLMUnavailable("rate limited upstream") from e
        except anthropic.APIStatusError as e:
            diagnostic("model_failure", reason="upstream_status", status_code=e.status_code)
            log.error("bedrock status %s", e.status_code)
            raise LLMUnavailable(f"upstream status {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            diagnostic("model_failure", reason="connection", error_type=type(e).__name__)
            raise LLMUnavailable("upstream connection failed") from e
        except Exception as e:  # credential resolution and similar client-side failures
            log.error("bedrock client error: %s", type(e).__name__)
            raise LLMUnavailable("upstream client failed") from e

        if budget:
            usage = getattr(resp, "usage", None)
            tokens = budget.usage(getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None),
                                  getattr(usage, "cache_read_input_tokens", None),
                                  getattr(usage, "cache_creation_input_tokens", None))
            await budget.finish_usage(call_id, tokens)
        if resp.stop_reason in ("refusal", "guardrail_intervened", "content_filtered"):
            raise SafetyBlocked()
        if resp.stop_reason == "max_tokens":
            raise LLMUnavailable("output truncated")
        if resp.stop_reason not in ("tool_use", "end_turn"):
            raise SafetyFailure()
        call = next((b for b in resp.content if b.type == "tool_use" and b.name == RESPOND_TOOL), None)
        if call is not None and isinstance(call.input, dict):
            return call.input
        # Fallback: a model that answered in text with the JSON object.
        text = next((b.text for b in resp.content if b.type == "text"), "")
        await self.assess(text, "OUTPUT")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMUnavailable("no structured response from model") from e
        if not isinstance(data, dict):
            raise LLMUnavailable("no structured response from model")
        return data
