"""Anonymous requests through the real MCP SDK, including durable quota boundaries."""

import time
from unittest.mock import AsyncMock

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.configuration.settings import Settings, get_settings
from app.http.rate_limit import mcp_guest
from app.main import create_app

RESOURCE = "https://testserver/api/v1/mcp/"
ASK = {"name": "ask_tutor", "arguments": {"request": {"question": "What is wudu?", "lang": "en"}}}


@pytest.fixture
def mcp_client(monkeypatch):
    monkeypatch.setenv("MCP_RESOURCE_URL", RESOURCE)
    get_settings.cache_clear()
    application = create_app()
    with TestClient(application) as connection:
        yield connection


def rpc(client, method, params=None, **headers):
    return client.post("/api/v1/mcp/", headers={
        "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", **headers},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def stub_tutor(client, monkeypatch):
    ask = AsyncMock(return_value={"tier": "NONE", "answer": [{"type": "text", "text": "Unavailable"}],
                                 "sources": {}, "ai_generated": False})
    monkeypatch.setattr(client.app.state.services.tutor, "ask", ask)
    return ask


def test_mcp_anonymous_discovery_and_all_content_tools(mcp_client):
    assert mcp_client.get("/.well-known/oauth-protected-resource/api/v1/mcp/").status_code == 404
    initialized = rpc(mcp_client, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                      "clientInfo": {"name": "offline-check", "version": "1.0"}})
    assert initialized.status_code == 200 and "www-authenticate" not in initialized.headers
    tools = rpc(mcp_client, "tools/list")
    assert {t["name"] for t in tools.json()["result"]["tools"]} == {"list_courses", "get_course", "get_source", "ask_tutor"}
    for tool in tools.json()["result"]["tools"]:
        assert "ctx" not in tool["inputSchema"]["properties"]
    courses = rpc(mcp_client, "tools/call", {"name": "list_courses", "arguments": {}})
    assert courses.json()["result"]["structuredContent"]["items"]
    course = rpc(mcp_client, "tools/call", {"name": "get_course", "arguments": {"course_id": "wudu-order"}})
    data = course.json()["result"]["structuredContent"]
    assert data["id"] == "wudu-order" and "contributors" not in data
    source_id = next(iter(data["sources_by_id"]))
    source = rpc(mcp_client, "tools/call", {"name": "get_source", "arguments": {"source_id": source_id}})
    assert source.json()["result"]["structuredContent"]["review_status"] == "approved"


def test_mcp_ignores_old_tokens_and_never_loads_an_account(mcp_client, monkeypatch):
    services = mcp_client.app.state.services
    decode = AsyncMock(side_effect=RuntimeError("PRIVATE_AUTH"))
    role = AsyncMock(side_effect=RuntimeError("PRIVATE_ACCOUNT"))
    monkeypatch.setattr(services.tokens, "decode_token", decode)
    monkeypatch.setattr(services.repository, "get_role", role)
    assert rpc(mcp_client, "tools/list", Authorization="Bearer expired-or-invalid").status_code == 200
    assert rpc(mcp_client, "tools/call", {"name": "list_courses", "arguments": {}}).status_code == 200
    decode.assert_not_awaited()
    role.assert_not_awaited()
    assert mcp_client.get("/api/v1/courses").status_code == 401


def test_mcp_request_limit_returns_429_with_retry_after(mcp_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "public_api_rate_per_minute", 1)
    now = time.time()
    monkeypatch.setattr("app.repositories.memory_repository.time.time", lambda: now)
    assert rpc(mcp_client, "tools/list").status_code == 200
    response = rpc(mcp_client, "tools/list", Authorization="Bearer different")
    assert response.status_code == 429 and response.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert response.headers["Cache-Control"] == "no-store"


def test_mcp_forwarded_header_prefix_cannot_reset_guest_quota(mcp_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "prod")
    monkeypatch.setattr(get_settings(), "public_api_rate_per_minute", 1)
    headers = {"x-forwarded-for": "1.1.1.1, 203.0.113.10, 192.0.2.1"}
    assert rpc(mcp_client, "tools/list", **headers).status_code == 200
    headers["x-forwarded-for"] = "2.2.2.2, 203.0.113.10, 192.0.2.1"
    assert rpc(mcp_client, "tools/list", **headers).status_code == 429
    headers["x-forwarded-for"] = "203.0.113.11, 192.0.2.1"
    assert rpc(mcp_client, "tools/list", **headers).status_code == 200


def test_mcp_shared_request_limit_applies_across_guest_ips(mcp_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "prod")
    monkeypatch.setattr(get_settings(), "public_api_service_rate_per_minute", 1)
    assert rpc(mcp_client, "tools/list", **{"x-forwarded-for": "203.0.113.10, 192.0.2.1"}).status_code == 200
    assert rpc(mcp_client, "tools/list", **{"x-forwarded-for": "203.0.113.11, 192.0.2.1"}).status_code == 429


def test_mcp_tutor_is_anonymous_and_model_rate_is_enforced(mcp_client, monkeypatch):
    ask = stub_tutor(mcp_client, monkeypatch)
    monkeypatch.setattr(get_settings(), "tutor_rate_per_minute", 1)
    response = rpc(mcp_client, "tools/call", ASK, Authorization="Bearer ignored")
    assert response.status_code == 200 and not response.json()["result"]["isError"], response.text
    assert ask.call_args.kwargs == {}  # No account, token or private progress enters the tutor.
    counters = mcp_client.app.state.services.repository.budget_counters
    assert any(principal == "day:service" and amount == 200_000 for (principal, _), amount in counters.items())
    response = rpc(mcp_client, "tools/call", ASK)
    assert response.json()["result"]["isError"] and "quota_exceeded" in response.text
    assert ask.await_count == 1


def test_mcp_guest_daily_and_shared_model_budgets(mcp_client, monkeypatch):
    ask = stub_tutor(mcp_client, monkeypatch)
    monkeypatch.setattr(get_settings(), "env", "prod")
    monkeypatch.setattr(get_settings(), "user_daily_tokens", 200_000)
    monkeypatch.setattr(get_settings(), "service_daily_tokens", 400_000)
    first = {"x-forwarded-for": "203.0.113.10, 192.0.2.1"}
    assert not rpc(mcp_client, "tools/call", ASK, **first).json()["result"]["isError"]
    assert "quota_exceeded" in rpc(mcp_client, "tools/call", ASK, **first).text
    assert not rpc(mcp_client, "tools/call", ASK, **{"x-forwarded-for": "203.0.113.11, 192.0.2.1"}).json()["result"]["isError"]
    assert "quota_exceeded" in rpc(mcp_client, "tools/call", ASK, **{"x-forwarded-for": "203.0.113.12, 192.0.2.1"}).text
    assert ask.await_count == 2


def test_mcp_quota_outage_fails_closed_without_private_details(mcp_client, monkeypatch):
    ask = stub_tutor(mcp_client, monkeypatch)
    monkeypatch.setattr(mcp_client.app.state.services.repository, "reserve_budget",
                        AsyncMock(side_effect=RuntimeError("PRIVATE_DATABASE_URI")))
    response = rpc(mcp_client, "tools/call", ASK)
    assert response.status_code == 503 and "quota_unavailable" in response.text and "PRIVATE" not in response.text
    ask.assert_not_awaited()


async def test_guest_tutor_stays_local_when_remote_agents_are_enabled(mcp_client, monkeypatch):
    services = mcp_client.app.state.services
    monkeypatch.setattr(services.agent, "enabled", True)
    ask = AsyncMock(side_effect=AssertionError("Guest requests must not reach remote agents"))
    monkeypatch.setattr(services.agent, "ask", ask)
    result = await services.tutor._agent_answer(None, "A", {}, None, None, "")
    assert result is None
    ask.assert_not_awaited()


def test_mcp_content_errors_and_transport_boundaries(mcp_client, monkeypatch):
    monkeypatch.setattr(mcp_client.app.state.services.content, "published_course",
                        AsyncMock(side_effect=RuntimeError("PRIVATE_STORAGE_URI")))
    response = rpc(mcp_client, "tools/call", {"name": "get_course", "arguments": {"course_id": "wudu-order"}})
    assert response.json()["result"]["isError"] and "PRIVATE" not in response.text
    response = rpc(mcp_client, "tools/list", Host="evil.example")
    assert response.status_code == 421
    response = mcp_client.post("/api/v1/mcp/", content=b"x" * 65537)
    assert response.status_code == 413 and response.json()["error"]["code"] == "payload_too_large"
    assert response.headers["Cache-Control"] == "no-store"


def test_guest_identity_normalizes_ips_and_ignores_untrusted_headers():
    settings = Settings(_env_file=None)
    def guest(peer, forwarded=""):
        return mcp_guest(Request({"type": "http", "client": (peer, 1234),
                                 "headers": [(b"x-forwarded-for", forwarded.encode())]}), settings)
    assert guest("203.0.113.10", "1.1.1.1") == guest("203.0.113.10", "2.2.2.2")
    assert guest("2001:db8::1") == guest("2001:0db8:0000::2")
    assert guest("::ffff:203.0.113.10") == guest("203.0.113.10")
    settings.env = "prod"
    assert guest("spoofed", "fake, 2001:db8::1, 192.0.2.1") == guest("other", "2001:db8::2, 192.0.2.1")
    assert guest("spoofed", "invalid") == guest("other", "fake, broken, 192.0.2.1")


@pytest.mark.parametrize("value", ["http://example.org/api/v1/mcp/", "https://example.org/api/v1/mcp",
                                  "https://example.org/api/v1/mcp/?token=x"])
def test_mcp_resource_url_requires_exact_secure_endpoint(value):
    with pytest.raises(ValueError):
        Settings(_env_file=None, mcp_resource_url=value)
