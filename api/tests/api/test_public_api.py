"""Exercise public authentication, release boundaries, shared quotas and developer docs offline."""

import time
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from app.configuration.settings import get_settings
from app.main import app
from tests.api.test_auth import es256  # Reuse the real signed-token/JWKS fixture.


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/api/v1/courses", None),
    ("GET", "/api/v1/courses/wudu-order", None),
    ("GET", "/api/v1/sources/quran:5:6", None),
    ("POST", "/api/v1/tutor/ask", {"question": "What is wudu?"}),
])
@pytest.mark.parametrize("identity", ["missing", "invalid", "expired", "anonymous", "wrong_audience"])
def test_public_operations_require_valid_user_token(client, es256, method, path, body, identity):
    token = {"missing": None, "invalid": "not-a-jwt", "expired": es256(exp=int(time.time()) - 60),
             "anonymous": es256(is_anonymous=True), "wrong_audience": es256(aud="anon")}[identity]
    response = client.request(method, path, json=body,
                              headers={"Authorization": f"Bearer {token}"} if token else {})
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_published_content_is_safe_even_for_staff(client, es256, monkeypatch):
    store = app.state.services.repository
    monkeypatch.setitem(store.roles, "00000000-0000-0000-0000-000000000001", "admin")
    headers = {"Authorization": f"Bearer {es256()}"}
    store.lessons["wudu-order"].update(author_id="private", contributors=["private@example.com"])
    store.sources["quran:5:6"]["internal_note"] = "PRIVATE"
    listing = client.get("/api/v1/courses?limit=1&track=first-steps", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["items"][0]["id"] == "wudu-order"
    assert listing.json()["items"][0]["level"] == 1
    assert client.get("/api/v1/courses?offset=999", headers=headers).json()["items"] == []
    response = client.get("/api/v1/courses/wudu-order", headers=headers)
    assert response.status_code == 200 and "private" not in response.text and "PRIVATE" not in response.text
    assert response.json()["sources_by_id"]["quran:5:6"]["text_ar"] == store.sources["quran:5:6"]["text_ar"]
    assert client.get("/api/v1/courses/draft-lesson", headers=headers).status_code == 404
    store.lessons["wudu-order"]["coming_soon"] = True
    assert client.get("/api/v1/courses/wudu-order", headers=headers).status_code == 404
    assert not client.get("/api/v1/courses?track=first-steps", headers=headers).json()["items"]


def test_pending_sources_and_courses_with_revoked_sources_are_withheld(client, es256):
    store = app.state.services.repository
    headers = {"Authorization": f"Bearer {es256()}"}
    assert client.get("/api/v1/sources/quran:5:6", headers=headers).status_code == 200
    store.sources["quran:5:6"]["review_status"] = "pending"
    assert client.get("/api/v1/sources/quran:5:6", headers=headers).status_code == 404
    assert client.get("/api/v1/courses/wudu-order", headers=headers).status_code == 409


def test_public_quota_is_shared_across_routes_tokens_and_forwarded_ips(client, es256, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_RATE_PER_MINUTE", "2")
    get_settings.cache_clear()
    now = time.time()
    monkeypatch.setattr("app.repositories.memory_repository.time.time", lambda: now)
    for path in ("/api/v1/courses", "/api/v1/sources/quran:5:6"):
        assert client.get(path, headers={"Authorization": f"Bearer {es256()}",
                          "X-Forwarded-For": path}).status_code == 200
    response = client.get("/api/v1/courses", headers={"Authorization": f"Bearer {es256(email='changed@example.com')}"})
    assert response.status_code == 429 and response.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    now += 60
    assert client.get("/api/v1/courses", headers={"Authorization": f"Bearer {es256()}"}).status_code == 200


def test_tutor_public_and_app_share_model_budget_but_reads_do_not_spend_it(client, es256, monkeypatch, fake_llm):
    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "1")
    get_settings.cache_clear()
    now = time.time()
    monkeypatch.setattr("app.repositories.memory_repository.time.time", lambda: now)
    headers = {"Authorization": f"Bearer {es256()}"}
    fake_llm()
    for _ in range(3):
        assert client.get("/api/v1/courses", headers=headers).status_code == 200
    response = client.post("/api/v1/tutor/ask", json={"question": "What is wudu?"}, headers=headers)
    assert response.status_code == 200 and "sources" in response.json()
    assert client.post("/api/tutor/ask", json={"question": "Again"}, headers=headers).status_code == 429
    ask = AsyncMock()
    monkeypatch.setattr(app.state.services.tutor, "ask", ask)
    assert client.post("/api/v1/tutor/ask", json={"question": "Again"}, headers=headers).status_code == 429
    ask.assert_not_called()


def test_daily_token_cap_stops_public_ai_calls(client, es256, monkeypatch):
    monkeypatch.setenv("USER_DAILY_TOKENS", "1")
    get_settings.cache_clear()
    ask = AsyncMock()
    monkeypatch.setattr(app.state.services.tutor, "ask", ask)
    headers = {"Authorization": f"Bearer {es256()}"}
    assert client.post("/api/v1/tutor/ask", json={"question": "x"}, headers=headers).status_code == 429
    ask.assert_not_called()
    assert client.get("/api/v1/courses", headers=headers).status_code == 200


def test_quota_outage_fails_closed_and_disabled_accounts_are_denied(client, es256, monkeypatch):
    store = app.state.services.repository
    headers = {"Authorization": f"Bearer {es256()}"}
    monkeypatch.setattr(store, "reserve_budget", AsyncMock(side_effect=RuntimeError("PRIVATE_DB_FAILURE")))
    response = client.get("/api/v1/courses", headers=headers)
    assert response.status_code == 503 and "PRIVATE" not in response.text
    store.roles["00000000-0000-0000-0000-000000000001"] = "disabled"
    assert client.get("/api/v1/courses", headers=headers).status_code == 403


def test_tutor_filters_storage_metadata_and_keeps_bilingual_practice(client, es256, monkeypatch):
    source = deepcopy(app.state.services.repository.sources["quran:5:6"])
    source.update(uri="s3://PRIVATE", document_id="PRIVATE", internal_note="PRIVATE")
    question = {"id": "practice:0", "question": {"en": "Question?", "ar": "سؤال؟"},
                "options": [{"en": "One", "ar": "واحد"}, {"en": "Two", "ar": "اثنان"}], "answer": 0,
                "hint": {"en": "", "ar": ""}, "explanation": {"en": "Because", "ar": "لأن"}, "source": "quran:5:6"}
    answer = {"tier": "B", "answer": [{"type": "text", "text": "Explanation"},
              {"type": "source", "id": "quran:5:6"}], "sources": {source["id"]: source},
              "ai_generated": True, "practice": [question], "private_trace": "PRIVATE"}
    ask = AsyncMock(return_value=answer)
    monkeypatch.setattr(app.state.services.tutor, "ask", ask)
    headers = {"Authorization": f"Bearer {es256()}"}
    response = client.post("/api/v1/tutor/ask", json={"question": "Quiz me", "lang": "ar"}, headers=headers)
    assert response.status_code == 200 and "PRIVATE" not in response.text
    assert response.json()["practice"][0]["question"]["ar"] == "سؤال؟"
    assert ask.call_args.kwargs["authorization"] == headers["Authorization"]
    assert ask.call_args.kwargs["user_id"] == "00000000-0000-0000-0000-000000000001"


@pytest.mark.parametrize("path,body", [
    ("/api/v1/courses?limit=101", None),
    ("/api/v1/courses?offset=-1", None),
    ("/api/v1/tutor/ask", {"question": ""}),
    ("/api/v1/tutor/ask", {"question": "x", "user_id": "someone-else"}),
])
def test_public_validation_has_error_envelope(client, es256, path, body):
    response = client.request("POST" if body is not None else "GET", path, json=body,
                              headers={"Authorization": f"Bearer {es256()}"})
    assert response.status_code == 400 and response.json()["error"]["code"] == "bad_request"


def test_public_swagger_is_versioned_and_contains_only_public_operations(client):
    schema = client.get("/api/v1/openapi.json").json()
    assert schema["info"]["version"] == "1.0.0"
    assert "[Developer guide](/api/v1/docs)" in schema["info"]["description"]
    assert len(schema["info"]["description"]) < 400
    assert set(schema["paths"]) == {"/courses", "/courses/{course_id}", "/sources/{source_id}", "/tutor/ask"}
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    for operations in schema["paths"].values():
        assert next(iter(operations.values()))["security"] == [{"HTTPBearer": []}]
        assert "422" not in next(iter(operations.values()))["responses"]
    docs = client.get("/api/v1/docs")
    assert docs.status_code == 200 and "Build with Yaqeen." in docs.text
    assert 'href="/api/v1/reference"' in docs.text and 'href="/api/v1/swagger"' in docs.text
    assert 'href="/api/v1/openapi.json"' in docs.text
    assert "__ENDPOINTS__" not in docs.text and "__PUBLIC_KEY__" not in docs.text
    assert "Create your account once" in docs.text and "Connect with MCP" in docs.text
    reference = client.get("/api/v1/reference")
    assert reference.status_code == 200 and "<redoc" in reference.text
    download = client.get("/api/v1/docs?download=true")
    assert download.status_code == 200 and "attachment" in download.headers["Content-Disposition"]
    assert "https://public-api.yaqeenguide.com/api/v1/reference" in download.text
    swagger = client.get("/api/v1/swagger")
    assert swagger.status_code == 200 and "SwaggerUIBundle" in swagger.text
    assert 'href="/api/v1/docs#mcp"' in swagger.text and '"persistAuthorization": false' in swagger.text
    assert '"displayRequestDuration": true' in swagger.text and '"validatorUrl": null' in swagger.text
    assert 'href="/api/v1/docs#mcp"' in reference.text
    assert client.get("/api/v1/review/queue").status_code == 404


def test_developer_guide_fields_and_examples_follow_the_actual_public_contract(client):
    import jsonschema
    from app.http.developer_docs import EXAMPLES, render_developer_docs

    schema = client.get("/api/v1/openapi.json").json()
    for path, example in EXAMPLES.items():
        operation = next(iter(schema["paths"][path].values()))
        response = operation["responses"]["200"]["content"]["application/json"]["schema"]
        jsonschema.validate(example, {**response, "components": schema["components"]})
        published_example = operation["responses"]["200"]["content"]["application/json"]["example"]
        jsonschema.validate(published_example, {**response, "components": schema["components"]})
    course = schema["paths"]["/courses/{course_id}"]["get"]["responses"]["200"]["content"]["application/json"]["example"]
    assert all(source_id in course["sources_by_id"] for card in course["cards"] for source_id in card["sources"])
    tutor = schema["paths"]["/tutor/ask"]["post"]["responses"]["200"]["content"]["application/json"]["example"]
    assert all(block["id"] in tutor["sources"] for block in tutor["answer"] if block["type"] == "source")
    changed = deepcopy(schema)
    changed["paths"]["/courses"]["get"]["parameters"][1]["schema"]["maximum"] = 77
    changed["components"]["schemas"]["CoursePage"]["properties"]["new_field"] = {"type": "string", "description": "<script>private</script>"}
    guide = render_developer_docs(changed)
    assert "max: 77" in guide and "new_field" in guide
    assert "&lt;script&gt;private&lt;/script&gt;" in guide and "<script>private</script>" not in guide


def test_public_body_limit_cannot_be_bypassed_and_responses_are_private(client, es256, monkeypatch):
    ask = AsyncMock()
    monkeypatch.setattr(app.state.services.tutor, "ask", ask)
    headers = {"Authorization": "Bearer " + es256(), "Content-Length": "1"}
    response = client.post("/api/v1/tutor/ask", headers=headers, content=iter([b"x" * 32000, b"x" * 33537]))
    assert response.status_code == 413 and response.json()["error"]["code"] == "payload_too_large"
    assert response.headers["Cache-Control"] == "no-store"
    ask.assert_not_called()
    assert client.get("/api/v1/courses", headers=headers).headers["Cache-Control"] == "no-store"
