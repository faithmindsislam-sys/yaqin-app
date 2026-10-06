"""Explicit, fail-closed assessment independent of model/tool transport."""

import asyncio
import logging
import re
from threading import Lock

from botocore.config import Config
from botocore.exceptions import ClientError

from app.domain.operations import CURRENT, diagnostic, exceeded, stage
from app.domain.safety import SafetyBlocked, SafetyFailure, content_text
from app.gateways.bedrock.identity import session as app_session

log = logging.getLogger(__name__)
MAX_TEXT = 100_000


class BedrockSafety:
    def __init__(self, settings):
        self.settings = settings
        self._client = None
        self._lock = Lock()

    def _assess(self, text, source):
        s = self.settings
        if (not s.aws_enabled or not s.guardrail_id
                or not re.fullmatch(r"[1-9][0-9]{0,7}", s.guardrail_version)):
            log.warning("safety assessment failed reason=configuration source=%s", source)
            raise SafetyFailure()
        with self._lock:
            if self._client is None:
                session = app_session(s, s.bedrock_region)
                self._client = session.client("bedrock-runtime", config=Config(
                    connect_timeout=2, read_timeout=5, retries={"total_max_attempts": 1}))
        response = self._client.apply_guardrail(
            guardrailIdentifier=s.guardrail_id, guardrailVersion=s.guardrail_version,
            source=source, content=[{"text": {"text": text,
                **({"qualifiers": ["guard_content"]} if source == "INPUT" else {})}}])
        if response.get("action") == "GUARDRAIL_INTERVENED":
            log.warning("safety assessment failed reason=intervention source=%s", source)
            attack = any(f.get("type") == "PROMPT_ATTACK" and f.get("action") == "BLOCKED"
                         for a in response.get("assessments", []) for f in a.get("contentPolicy", {}).get("filters", []))
            raise SafetyBlocked(prompt_attack=attack)
        coverage = response.get("guardrailCoverage", {}).get("textCharacters", {})
        if response.get("action") != "NONE" or coverage.get("guarded", 0) < len(text):
            log.warning("safety assessment failed reason=incomplete_assessment source=%s", source)
            raise SafetyFailure()

    async def assess(self, value, source):
        text = content_text(value)
        # Reject oversized content in full; never assess just a truncated prefix.
        if source not in ("INPUT", "OUTPUT") or len(text) > MAX_TEXT:
            log.warning("safety assessment failed reason=input_limits source=%s",
                        source if source in ("INPUT", "OUTPUT") else "INVALID")
            raise SafetyFailure()
        budget = CURRENT.get()
        s = self.settings
        # Reuse only complete successful coverage inside this operation and policy boundary.
        key = (self, s.aws_enabled, s.bedrock_region, s.guardrail_id, s.guardrail_version, source, text)
        timeout = 8
        if budget:
            timeout = min(timeout, budget.remaining())
            if key in budget.assessment_cache:
                diagnostic("moderation_cache_hit", direction=source)
                return
            budget.assessments += 1
            budget.reserved_tokens += len(text.encode())
            if budget.assessments > 120 or budget.reserved_tokens > budget.token_limit:
                raise exceeded()
        try:
            with stage("moderation", direction=source, characters=len(text), policy_version=s.guardrail_version):
                await asyncio.wait_for(asyncio.to_thread(self._assess, text or " ", source), timeout=timeout)
            if budget:
                budget.assessment_cache.add(key)
        except SafetyFailure:
            raise
        except Exception as exc:
            # Error messages, policy matches and payloads can contain private content.
            error = type(exc).__name__
            if isinstance(exc, ClientError):
                error = exc.response.get("Error", {}).get("Code")
                if error not in {"AccessDeniedException", "ResourceNotFoundException", "ValidationException",
                                 "ThrottlingException", "ServiceQuotaExceededException", "InternalServerException",
                                 "ServiceUnavailableException", "ExpiredTokenException", "UnrecognizedClientException"}:
                    error = "provider_error"
            elif error not in {"TimeoutError", "ReadTimeoutError", "ConnectTimeoutError", "EndpointConnectionError",
                               "NoCredentialsError", "PartialCredentialsError", "CredentialRetrievalError"}:
                error = "unexpected_error"
            log.warning("safety assessment failed reason=provider_failure source=%s error=%s", source, error)
            raise SafetyFailure() from None

    async def close(self):
        client, self._client = self._client, None
        if client is not None:
            await asyncio.to_thread(client.close)
