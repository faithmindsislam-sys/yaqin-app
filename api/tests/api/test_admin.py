import asyncio

import pytest

from app.http.auth import User, current_user
from app.main import app

ACTOR = "00000000-0000-0000-0000-000000000001"
TARGET = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def admin_client(client):
    store = app.state.services.repository
    store.users = {
        ACTOR: {
            "id": ACTOR,
            "email": "owner@example.test",
            "display_name": "Owner",
            "role": "super_admin",
            "created_at": "2026-10-01T00:00:00Z",
        },
        TARGET: {
            "id": TARGET,
            "email": "staff@example.test",
            "display_name": "Future Teacher",
            "role": "learner",
            "created_at": "2026-10-02T00:00:00Z",
        },
    }
    app.dependency_overrides[current_user] = lambda: User(id=ACTOR, role="super_admin")
    yield client
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["learner", "teacher", "admin"])
def test_only_super_admin_can_manage_users(admin_client, role):
    app.dependency_overrides[current_user] = lambda: User(id=ACTOR, role=role)
    assert admin_client.get("/api/admin/users").status_code == 403
    assert admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": "teacher"}).status_code == 403
    assert admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": True}).status_code == 403
    assert admin_client.get(f"/api/admin/users/{TARGET}/events").status_code == 403
    assert app.state.services.repository.admin_events == []
    assert app.state.services.repository.users[TARGET]["role"] == "learner"
    assert not app.state.services.repository.users[TARGET].get("disabled", False)


@pytest.mark.parametrize("role", ["learner", "teacher", "admin", "super_admin"])
def test_super_admin_changes_role_and_writes_audit(admin_client, role):
    result = admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": role})
    assert result.status_code == 200
    assert result.json() == {"id": TARGET, "role": role}
    store = app.state.services.repository
    assert asyncio.run(store.get_role(TARGET)) == role
    assert len(store.admin_events) == 1
    event = store.admin_events[0]
    assert event["actor_id"] == ACTOR and event["target_id"] == TARGET
    assert event["kind"] == "role_changed"
    assert event["payload"] == {"from_role": "learner", "to_role": role}
    assert event["id"] and event["created_at"]


@pytest.mark.parametrize(
    "uid, role, status",
    [
        (ACTOR, "learner", 403),
        (ACTOR.upper(), "admin", 403),
        (TARGET, "instructor", 400),
        (TARGET, "unknown", 400),
        ("bad-id", "teacher", 400),
        ("00000000-0000-0000-0000-000000000099", "teacher", 404),
    ],
)
def test_invalid_changes_do_not_mutate_or_audit(admin_client, uid, role, status):
    assert admin_client.post(f"/api/admin/users/{uid}/role", json={"role": role}).status_code == status
    assert app.state.services.repository.users[TARGET]["role"] == "learner"
    assert app.state.services.repository.users[ACTOR]["role"] == "super_admin"
    assert app.state.services.repository.admin_events == []


def test_role_change_requires_real_user(admin_client):
    app.dependency_overrides[current_user] = lambda: User(id=None, role="super_admin")
    assert admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": "teacher"}).status_code == 401
    assert app.state.services.repository.admin_events == []


def test_search_email_name(admin_client):
    for query in ("STAFF@", " Teacher "):
        result = admin_client.get("/api/admin/users", params={"q": query}).json()
        assert result["items"] == [{"last_sign_in_at": None, "disabled": False,
                                    **app.state.services.repository.users[TARGET], "daily_reserved_tokens": 0,
                                    "daily_actual_tokens": 0, "daily_usage_unknown_calls": 0,
                                    "standalone_daily_actual_tokens": None, "standalone_daily_usage_unknown_calls": None}]
        assert result["total"] == 1 and result["counts"]["total"] == 2
    assert admin_client.get("/api/admin/users", params={"q": "%"}).json()["items"] == []


def test_pagination_and_stable_order(admin_client):
    store = app.state.services.repository
    template = store.users[TARGET]
    store.users = {}
    for n in range(60):
        uid = f"00000000-0000-0000-0001-{n:012d}"
        store.users[uid] = {**template, "id": uid}
    first = admin_client.get("/api/admin/users").json()
    second = admin_client.get("/api/admin/users", params={"page": 2}).json()
    assert len(first["items"]) == len(second["items"]) == 10
    assert first["total"] == second["total"] == first["counts"]["total"] == 60
    ordered = sorted(store.users, reverse=True)
    assert [u["id"] for u in first["items"]] == ordered[:10]
    assert [u["id"] for u in second["items"]] == ordered[10:20]
    assert set(first["items"][0]) == {"id", "email", "display_name", "role", "created_at", "last_sign_in_at", "disabled", "daily_reserved_tokens",
                                    "daily_actual_tokens", "daily_usage_unknown_calls", "standalone_daily_actual_tokens", "standalone_daily_usage_unknown_calls"}
    assert len(admin_client.get("/api/admin/users", params={"page_size": 50}).json()["items"]) == 50
    assert admin_client.get("/api/admin/users", params={"page": 7}).json()["items"] == []


@pytest.mark.parametrize("params", [{"page_size": 51}, {"page_size": 0}, {"page": 0}, {"role": "unknown"}, {"status": "banned"}])
def test_invalid_list_params(admin_client, params):
    assert admin_client.get("/api/admin/users", params=params).status_code == 400


def test_filters_and_unfiltered_counts(admin_client):
    store = app.state.services.repository
    store.users[TARGET].update(role="teacher", disabled=True, last_sign_in_at="2026-10-03T12:00:00Z")
    counts = {"total": 2, "learner": 0, "teacher": 1, "admin": 0, "super_admin": 1, "disabled": 1}
    for params in ({"role": "teacher"}, {"status": "disabled"}, {"q": "staff", "role": "teacher", "status": "disabled"}):
        result = admin_client.get("/api/admin/users", params=params).json()
        assert result["total"] == 1 and result["items"] == [{**store.users[TARGET], "daily_reserved_tokens": 0,
            "daily_actual_tokens": 0, "daily_usage_unknown_calls": 0,
            "standalone_daily_actual_tokens": None, "standalone_daily_usage_unknown_calls": None}]
        assert result["counts"] == counts
        assert result["items"][0]["last_sign_in_at"] == "2026-10-03T12:00:00Z"
    active = admin_client.get("/api/admin/users", params={"status": "active"}).json()
    assert [u["id"] for u in active["items"]] == [ACTOR]
    empty = admin_client.get("/api/admin/users", params={"role": "teacher", "status": "active"}).json()
    assert empty["items"] == [] and empty["total"] == 0 and empty["counts"] == counts


def test_daily_token_estimate_is_account_scoped_and_resets(admin_client, monkeypatch):
    import time

    from app.configuration.settings import get_settings
    from app.domain.errors import ApiError

    day = 20700
    monkeypatch.setattr(time, "time", lambda: day * 86400 + 123)
    settings = get_settings()
    store = app.state.services.repository
    asyncio.run(store.reserve_budget(TARGET, 200000, settings))
    asyncio.run(store.reserve_budget(TARGET, 800000, settings))
    result = admin_client.get("/api/admin/users").json()
    assert result["daily_token_limit"] == settings.user_daily_tokens
    assert {u["id"]: u["daily_reserved_tokens"] for u in result["items"]} == {ACTOR: 0, TARGET: 1000000}
    with pytest.raises(ApiError):
        asyncio.run(store.reserve_budget(TARGET, settings.user_daily_tokens, settings))
    assert admin_client.get("/api/admin/users", params={"q": "staff"}).json()["items"][0]["daily_reserved_tokens"] == 1000000
    monkeypatch.setattr(time, "time", lambda: (day + 1) * 86400)
    assert all(u["daily_reserved_tokens"] == 0 for u in admin_client.get("/api/admin/users").json()["items"])


def test_disable_enable_and_audit(admin_client):
    store = app.state.services.repository
    for disabled, kind in ((True, "user_disabled"), (False, "user_enabled")):
        result = admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": disabled})
        assert result.status_code == 200 and result.json() == {"id": TARGET, "disabled": disabled}
        assert store.users[TARGET]["disabled"] is disabled
        assert asyncio.run(store.get_role(TARGET)) == ("disabled" if disabled else "learner")
        event = store.admin_events[-1]
        assert event["kind"] == kind and event["actor_id"] == ACTOR and event["target_id"] == TARGET
        assert event["payload"] == {} and event["id"] and event["created_at"]
        before = len(store.admin_events)
        repeat = admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": disabled})
        assert repeat.status_code == 409 and len(store.admin_events) == before
    assert len(store.admin_events) == 2


@pytest.mark.parametrize("disabled", [True, False])
@pytest.mark.parametrize("uid,status", [(ACTOR, 403), ("00000000-0000-0000-0000-000000000099", 404), ("bad-id", 400)])
def test_invalid_status_changes_do_not_mutate_or_audit(admin_client, uid, status, disabled):
    assert admin_client.post(f"/api/admin/users/{uid}/status", json={"disabled": disabled}).status_code == status
    assert not app.state.services.repository.users[TARGET].get("disabled", False)
    assert not app.state.services.repository.users[ACTOR].get("disabled", False)
    assert app.state.services.repository.admin_events == []


def test_status_change_requires_real_session_and_boolean(admin_client):
    assert admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": "true"}).status_code == 400
    app.dependency_overrides[current_user] = lambda: User(id=None, role="super_admin")
    assert admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": True}).status_code == 401
    assert app.state.services.repository.admin_events == []


def test_events_newest_first_and_target_scope(admin_client):
    assert admin_client.get(f"/api/admin/users/{TARGET}/events").json() == []
    admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": "teacher"})
    admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": True})
    admin_client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": False})
    result = admin_client.get(f"/api/admin/users/{TARGET}/events")
    assert result.status_code == 200
    events = result.json()
    assert [e["kind"] for e in events] == ["user_enabled", "user_disabled", "role_changed"]
    assert events[-1]["payload"] == {"from_role": "learner", "to_role": "teacher"}
    assert all(e["actor_name"] == "Owner" and e["actor_email"] == "owner@example.test" for e in events)
    assert set(events[0]) == {"id", "kind", "payload", "actor_id", "actor_name", "actor_email", "created_at"}
    assert admin_client.get(f"/api/admin/users/{ACTOR}/events").json() == []
    assert admin_client.get("/api/admin/users/00000000-0000-0000-0000-000000000099/events").status_code == 404
    store = app.state.services.repository
    for n in range(60):
        store.admin_events.append({**store.admin_events[-1], "id": str(n), "created_at": 2000000000 + n})
    events = admin_client.get(f"/api/admin/users/{TARGET}/events").json()
    assert len(events) == 50 and [e["id"] for e in events] == [str(n) for n in range(59, 9, -1)]


def test_anonymous_cannot_manage_users(client):
    assert client.get("/api/admin/users").status_code == 401
    assert client.get(f"/api/admin/users/{TARGET}/events").status_code == 401
    assert client.post(f"/api/admin/users/{TARGET}/status", json={"disabled": True}).status_code == 401
