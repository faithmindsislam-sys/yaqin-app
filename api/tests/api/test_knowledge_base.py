import asyncio

import httpx
import pytest

from app.http.auth import User, current_user
from app.main import app

DID = "a" * 32
ROUTES = [
    ("GET", "/resources", None),
    ("GET", f"/documents/{DID}/status", None),
    ("POST", "/documents", {"filename": "source.pdf", "content_type": "application/pdf"}),
    ("POST", "/resources/toggle", {"documentIds": [DID], "enabled": False}),
    ("POST", f"/resources/{DID}/metadata", {"title": "Book", "description": "Short summary."}),
    ("POST", f"/resources/{DID}/delete", {}),
    ("POST", "/retrieval/test", {"query": "What is prayer?", "documentId": DID}),
]


@pytest.mark.parametrize("role,status", [("anonymous", 401), ("learner", 403), ("teacher", 403)])
def test_non_admins_cannot_use_any_knowledge_route(client, monkeypatch, role, status):
    def forbidden(*args, **kwargs):
        pytest.fail("Unauthorized requests must not contact the RAG service")

    monkeypatch.setattr(app.state.services.rag, "request", forbidden)
    app.dependency_overrides[current_user] = lambda: User(id=None, role=role)
    try:
        for method, path, body in ROUTES:
            assert client.request(method, "/api/admin/rag" + path, json=body).status_code == status
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["admin", "super_admin"])
def test_admin_wrappers_forward_the_user_token_for_every_route(client, role):
    calls = []

    def upstream(request):
        calls.append(request)
        assert request.headers["authorization"] == "Bearer browser-token"
        return httpx.Response(200, json={"resources": [], "updated": 1, "enabled": False, "documentIds": [DID]})

    gateway = app.state.services.rag
    asyncio.run(gateway.client.aclose())
    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    gateway.url = "https://rag.example.test"
    app.dependency_overrides[current_user] = lambda: User(id="admin", role=role)
    try:
        for method, path, body in ROUTES:
            result = client.request(
                method, "/api/admin/rag" + path, json=body, headers={"Authorization": "Bearer browser-token"}
            )
            assert result.status_code in (200, 201)
            assert str(calls[-1].url).split("?")[0] == "https://rag.example.test/rag" + path
            if path == "/resources":
                assert dict(calls[-1].url.params) == {"q": "", "page": "1", "page_size": "25"}
            assert calls[-1].method == method
            assert "browser-token" not in result.text
    finally:
        app.dependency_overrides.clear()


def test_resource_pagination_and_filters_forward_as_query_parameters(client):
    gateway = app.state.services.rag
    asyncio.run(gateway.client.aclose())
    expected = {"resources": [], "total": 578, "page": 22, "pageSize": 25,
                "statistics": {"loaded": 578, "completed": 560, "eligible": 550, "waiting": 2, "queued": 10, "processing": 3, "failed": 3}}

    def upstream(request):
        assert dict(request.url.params) == {"q": "نص%_.pdf", "status": "COMPLETED", "page": "22", "page_size": "25"}
        assert request.headers["Authorization"] == "Bearer browser-token"
        assert not request.content
        return httpx.Response(200, json=expected)

    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    gateway.url = "https://rag.example.test"
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        response = client.get("/api/admin/rag/resources", params={"page": 22, "page_size": 25,
                            "q": "نص%_.pdf", "status": "COMPLETED"}, headers={"Authorization": "Bearer browser-token"})
        assert response.status_code == 200
        assert response.json() == expected
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("params", [{"page": 0}, {"page": 2147483648}, {"page": "1.5"},
                                     {"page_size": 0}, {"page_size": 101}, {"page_size": "all"},
                                     {"status": "ready"}, {"q": "x" * 201}, {"q": "a\x00b"}])
def test_invalid_resource_list_params_never_reach_service(client, monkeypatch, params):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid pagination must not contact the RAG service")

    monkeypatch.setattr(app.state.services.rag, "request", forbidden)
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        assert client.get("/api/admin/rag/resources", params=params).status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "path,body",
    [
        ("/documents", {"filename": "a.exe", "content_type": "text/plain"}),
        ("/documents", {"filename": "a.pdf", "content_type": "application/pdf", "title": "x" * 201}),
        (f"/resources/{DID}/metadata", {"description": "x" * 161}),
        (f"/resources/{DID}/metadata", {"title": "a\nb"}),
        (f"/resources/{DID}/metadata", {"enabled": False}),
        (f"/resources/{DID}/metadata", {}),
        ("/resources/bad/delete", {}),
        ("/documents", {"filename": "a.pdf", "content_type": "text/plain"}),
        ("/documents", {"filename": "../a.txt", "content_type": "text/plain"}),
        ("/documents", {"filename": "a.json", "content_type": "application/json"}),
        ("/documents", {"filename": "a.json", "content_type": "application/json", "jsonExtraction": {"textField": ""}}),
        ("/resources/toggle", {"documentIds": [DID], "enabled": "false"}),
        ("/resources/toggle", {"documentIds": [], "enabled": False}),
        ("/resources/toggle", {"documentIds": ["../bad"], "enabled": False}),
        ("/retrieval/test", {"query": "   "}),
        ("/retrieval/test", {"query": "q", "documentId": "bad"}),
    ],
)
def test_invalid_input_never_reaches_service(client, monkeypatch, path, body):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid input must not contact the service")

    monkeypatch.setattr(app.state.services.rag, "request", forbidden)
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        assert client.post("/api/admin/rag" + path, json=body).status_code == 400
        assert client.get("/api/admin/rag/documents/bad/status").status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_json_selections_forwarded_and_service_failures_are_safe(client):
    from app.configuration.settings import Settings
    from app.gateways.rag_gateway import RagGateway

    gateway = app.state.services.rag
    asyncio.run(gateway.client.aclose())
    calls = []

    def upstream(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(201, json={"documentId": DID, "uploadUrl": "https://storage.test/temporary"})
        if len(calls) == 2:
            return httpx.Response(409, json={"error": "Selected resource must be enabled and COMPLETED"})
        if len(calls) == 3:
            return httpx.Response(500, json={"error": "private database credentials"})
        raise httpx.ConnectError("private host", request=request)

    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    gateway.url = "https://rag.example.test"
    client.headers["Authorization"] = "Bearer browser-token"
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        body = {
            "filename": "نص.json",
            "content_type": "application/json",
            "jsonExtraction": {"textField": "body", "titleField": "title"},
        }
        assert client.post("/api/admin/rag/documents", json=body).status_code == 201
        import json

        assert json.loads(calls[0].content) == body
        assert client.post("/api/admin/rag/retrieval/test", json={"query": "q", "documentId": DID}).status_code == 409
        response = client.get("/api/admin/rag/resources")
        assert response.status_code == 502 and "private" not in response.text
        assert client.get("/api/admin/rag/resources").status_code == 502
        unconfigured = RagGateway(Settings(_env_file=None, rag_service_url=""))
        gateway.url = unconfigured.url
        asyncio.run(unconfigured.close())
        assert client.get("/api/admin/rag/resources").status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_missing_user_token_never_contacts_rag(client):
    gateway = app.state.services.rag
    asyncio.run(gateway.client.aclose())

    def upstream(request):
        pytest.fail("A missing user token must not contact RAG")

    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    gateway.url = "https://rag.example.test"
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        assert client.get("/api/admin/rag/resources").status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_concurrent_requests_keep_their_own_tokens():
    from app.configuration.settings import Settings
    from app.gateways.rag_gateway import RagGateway

    seen = []

    async def upstream(request):
        await asyncio.sleep(0)
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json={"resources": []})

    gateway = RagGateway(Settings(_env_file=None, rag_service_url="https://rag.example.test"))
    await gateway.client.aclose()
    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    try:
        await asyncio.gather(*(gateway.request("GET", "/resources", authorization=f"Bearer {token}")
                               for token in ("user-a", "user-b")))
        assert sorted(seen) == ["Bearer user-a", "Bearer user-b"]
        assert "authorization" not in gateway.client.headers
    finally:
        await gateway.close()


@pytest.mark.parametrize("status", [401, 403])
def test_upstream_auth_rejections_reach_the_user(client, status):
    gateway = app.state.services.rag
    asyncio.run(gateway.client.aclose())
    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(status, json={"error": "Session or permissions changed"})))
    gateway.url = "https://rag.example.test"
    app.dependency_overrides[current_user] = lambda: User(id="admin", role="admin")
    try:
        response = client.get("/api/admin/rag/resources", headers={"Authorization": "Bearer browser-token"})
        assert response.status_code == status
        assert "Session or permissions changed. Sign in again." in response.text
    finally:
        app.dependency_overrides.clear()
