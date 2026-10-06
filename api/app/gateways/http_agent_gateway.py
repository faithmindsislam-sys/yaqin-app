"""HTTP client for the FaithMinds agents service. Forwards the learner's own JWT; no service secret."""

from __future__ import annotations

import json
import logging

import httpx

from app.configuration.settings import Settings
from app.domain.operations import CURRENT, diagnostic
from app.domain.safety import SafetyBlocked, SafetyFailure
from app.domain.sources import library_sources as _library_sources
from app.domain.support import SupportFailure
from app.gateways.agent_gateway import AgentGateway, AgentUnavailable

log = logging.getLogger(__name__)


class HttpAgentGateway(AgentGateway):
    def __init__(self, settings: Settings):
        self.url = (settings.agents_service_url or "").rstrip("/")
        self.enabled = bool(self.url)
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(28, connect=3), follow_redirects=False, trust_env=False)

    async def ask(self, payload: dict, *, authorization: str) -> dict:
        if not self.enabled:
            raise AgentUnavailable("agents service not configured")
        if not authorization.lower().startswith("bearer ") or not authorization.split(" ", 1)[1].strip():
            raise AgentUnavailable("no user token to forward")
        budget = CURRENT.get()
        remaining = min(28, budget.remaining()) if budget else 28
        try:
            async with self.client.stream("POST", f"{self.url}/agents/v1/ask", json=payload,
                                          headers={"Authorization": authorization},
                                          timeout=httpx.Timeout(remaining, connect=min(3, remaining))) as r:
                raw = bytearray()
                async for part in r.aiter_bytes():
                    raw.extend(part)
                    if len(raw) > 262144:
                        log.warning("agents ask failed reason=response_limits")
                        raise SafetyFailure()
                data = json.loads(raw)
        except (httpx.HTTPError, ValueError) as exc:
            # A lost response cannot establish whether upstream moderation completed.
            reason = "transport_error" if isinstance(exc, httpx.HTTPError) else "invalid_json"
            error = type(exc).__name__
            if error not in {"ReadTimeout", "ConnectTimeout", "WriteTimeout", "PoolTimeout", "ConnectError",
                             "ReadError", "WriteError", "RemoteProtocolError", "DecodingError", "JSONDecodeError"}:
                error = "unexpected_error"
            log.warning("agents ask failed reason=%s error=%s", reason, error)
            raise SafetyFailure() from None
        if isinstance(data, dict) and data.get("errorCode") == "safety_blocked":
            log.warning("agents ask failed reason=safety_blocked status=%s", r.status_code)
            raise SafetyBlocked()
        if isinstance(data, dict) and data.get("errorCode") == "safety_unavailable":
            log.warning("agents ask failed reason=safety_unavailable status=%s", r.status_code)
            raise SafetyFailure()
        if isinstance(data, dict) and data.get("errorCode") == "source_support_rejected":
            log.warning("agents ask failed reason=source_support_rejected status=%s", r.status_code)
            raise SupportFailure()
        if not r.is_success or not isinstance(data, dict) or data.get("schemaVersion") != "1":
            reason = "upstream_status" if not r.is_success else "invalid_contract"
            log.warning("agents ask failed reason=%s status=%s", reason, r.status_code)
            raise SafetyFailure()
        if data.get("safetyOutcome") != "allowed":
            log.warning("agents ask failed reason=missing_safety_outcome status=%s", r.status_code)
            raise SafetyFailure()
        if not isinstance(data.get("answer"), str) or not isinstance(data.get("makesReligiousClaim"), bool):
            log.warning("agents ask failed reason=invalid_answer_contract status=%s", r.status_code)
            raise SafetyFailure()
        if "supportReview" in data and (not isinstance(data.get("followUps"), list)
                or len(data["followUps"]) > 3
                or any(not isinstance(f, str) or not f.strip() for f in data["followUps"])):
            raise SupportFailure()
        follow = [f for f in data.get("followUps") or [] if isinstance(f, str) and f.strip()][:3]
        diagnostic("remote_result", model=data.get("model") if isinstance(data.get("model"), str) else None,
                   library_available=data.get("libraryAvailable") is True,
                   library_source_count=len(data.get("librarySources") or []))
        result = {"answer": data["answer"], "makes_religious_claim": data["makesReligiousClaim"], "follow_ups": follow,
                "practice": data.get("practice"), "practice_version": data.get("practiceVersion"),
                "library_sources": _library_sources(data.get("librarySources")),
                "learning_context_version": data.get("learningContextVersion")}
        if "supportReview" in data:
            result["support_review"] = data["supportReview"]
        return result

    async def close(self) -> None:
        await self.client.aclose()
