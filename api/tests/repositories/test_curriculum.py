from contextlib import nullcontext
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.domain.courses import DEFAULT_LEVELS, SUBJECTS
from app.domain.errors import ApiError
from app.repositories.postgres_repository import PostgresRepository


def repository():
    timestamp = datetime(2026, 10, 4, tzinfo=timezone.utc)
    config = {"subjects": deepcopy(SUBJECTS), "levels": deepcopy(DEFAULT_LEVELS),
              "tracks": [{"id": tid, "title": {"en": tid, "ar": tid},
                          "modules": [{"id": "intro", "title": {"en": "Intro", "ar": "تمهيد"},
                                       "lessons": ["course"] if tid == "explore" else []}]}
                         for tid in ("explore", "first-steps", "deepen")]}
    course = {"id": "course", "title": {"en": "Course", "ar": "دورة"}, "subject": "fiqh", "level": 1,
              "tracks": ["explore"], "cards": [{"id": "keep", "body": {"en": "Unchanged"}}]}
    conn = SimpleNamespace(
        transaction=lambda **kwargs: nullcontext(),
        fetchval=AsyncMock(return_value=None),
        fetchrow=AsyncMock(side_effect=lambda query, key: {"data": config[key], "updated_at": timestamp}),
        fetch=AsyncMock(return_value=[{"id": "course", "data": deepcopy(course)}]),
        execute=AsyncMock(),
    )
    store = PostgresRepository(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    store.curriculum = AsyncMock(return_value={})
    return store, conn, config, timestamp.isoformat()


async def test_postgres_curriculum_rejects_second_journey_without_writes():
    store, conn, config, revision = repository()
    modules = deepcopy(config["tracks"][1]["modules"])
    modules[0]["lessons"] = ["course"]
    with pytest.raises(ApiError) as error:
        await store.save_curriculum("tracks", modules, revision, None, "first-steps")
    assert error.value.status == 409
    assert [call.args[1] for call in conn.fetchrow.call_args_list] == ["tracks", "levels", "subjects"]
    assert all("for update" in call.args[0] for call in conn.fetchrow.call_args_list)
    assert "for update" in conn.fetch.call_args.args[0]
    conn.execute.assert_not_called()


@pytest.mark.parametrize("key", ["subjects", "levels", "tracks"])
async def test_postgres_stale_save_never_writes_courses_config_or_audit(key):
    store, conn, _, _ = repository()
    with pytest.raises(ApiError) as error:
        await store.save_curriculum(key, [], None, None, "explore")
    assert error.value.status == 409 and error.value.code == "stale_curriculum"
    conn.fetch.assert_not_called()
    conn.execute.assert_not_called()


async def test_postgres_invalid_removal_has_no_partial_membership_or_audit_write():
    store, conn, config, revision = repository()
    modules = deepcopy(config["tracks"][0]["modules"])
    modules[0]["lessons"] = []
    with pytest.raises(ApiError) as error:
        await store.save_curriculum("tracks", modules, revision, None, "explore")
    assert error.value.status == 409
    conn.execute.assert_not_called()


async def test_postgres_missing_config_uses_defaults_and_empty_config_stays_empty():
    store, conn, _, _ = repository()
    conn.fetchrow.side_effect = None
    conn.fetchrow.return_value = None
    fallback = await store._curriculum_config(conn)
    assert fallback["subjects"] == SUBJECTS and fallback["levels"] == DEFAULT_LEVELS
    assert fallback["updated_at"] == {"subjects": None, "levels": None, "tracks": None}
    conn.fetchrow.return_value = {"data": [], "updated_at": datetime.now(timezone.utc)}
    empty = await store._curriculum_config(conn)
    assert empty["subjects"] == [] and empty["levels"] == []
