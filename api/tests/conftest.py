from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.gateways.llm_gateway import LLMGateway, LLMUnavailable

FIXTURES = Path(__file__).parent / "fixtures" / "content"


@pytest.fixture(autouse=True)
def _offline_safety(request, monkeypatch):
    """Functional suites use an explicit stub; runtime_safety tests exercise real assessment."""
    if request.node.get_closest_marker("runtime_safety") is None:
        from app.gateways.bedrock.safety import BedrockSafety

        async def allow(self, value, source):
            pass

        monkeypatch.setattr(BedrockSafety, "assess", allow)
        from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
        original = BedrockLLMGateway.structured
        async def offline_support(self, **kwargs):
            if kwargs["system"].startswith("SENTENCE_SUPPORT_REVIEW_V1"):
                from tests.support_fake import sentence_reply
                return sentence_reply(kwargs)
            if kwargs["system"].startswith("EVIDENCE_SUPPORT_REVIEW_V1"):
                from tests.support_fake import support_reply
                return support_reply(kwargs)
            return await original(self, **kwargs)
        monkeypatch.setattr(BedrockLLMGateway, "structured", offline_support)


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("CONTENT_DIR", str(FIXTURES))
    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "1000")
    monkeypatch.setenv("USER_DAILY_TOKENS", "1000000000")
    monkeypatch.setenv("SERVICE_DAILY_TOKENS", "10000000000")
    # Override the private .env; tests must never connect to live infrastructure.
    monkeypatch.setenv("ENV", "local")
    for k in (
        "DATABASE_URL",
        "YAQIN_AWS_PROFILE",
        "SUPABASE_URL",
        "SUPABASE_JWT_SECRET",
        "DEV_ROLE",
        "RAG_SERVICE_URL",
        "AGENTS_SERVICE_URL",
        "MCP_RESOURCE_URL",
        "RAG_SERVICE_TOKEN",
        "QURAN_S3_URI",
    ):
        monkeypatch.setenv(k, "")
    for k in ("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI"):
        monkeypatch.delenv(k, raising=False)
    from app.configuration.settings import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeLLM(LLMGateway):
    """Returns queued structured outputs in order and records the calls."""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def structured(self, **kwargs):
        if kwargs["system"].startswith("SENTENCE_SUPPORT_REVIEW_V1"):
            from tests.support_fake import sentence_reply
            self.support_calls = getattr(self, "support_calls", []) + [kwargs]
            override = getattr(self, "sentence_review", None)
            if isinstance(override, Exception):
                raise override
            return override(kwargs) if callable(override) else sentence_reply(kwargs)
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

    async def assess(self, value, source):
        """Explicit offline fixture, never used in production."""
        pass

    async def close(self):
        pass


@pytest.fixture
def fake_llm(monkeypatch):
    def install(*outputs):
        from app.main import app

        fake = FakeLLM(*outputs)
        monkeypatch.setattr(app.state.services.tutor, "llm", fake)
        monkeypatch.setattr(app.state.services.lessons.reviewer, "llm", fake)
        return fake

    return install


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def learner(client):
    from app.domain.users import User
    from app.http.auth import current_user
    from app.main import app

    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001", role="learner")
    yield client
    app.dependency_overrides.pop(current_user, None)
