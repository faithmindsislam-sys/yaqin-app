"""PostgresRepository storage implementation."""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from typing import Any

from asyncpg import InsufficientPrivilegeError, InvalidSchemaNameError, UndefinedTableError

from app.domain.courses import DEFAULT_LEVELS, SUBJECTS, migrate_course, place_course
from app.domain.curriculum import apply_save, check_revision
from app.domain.errors import ApiError
from app.domain.lessons import (
    card_docs,
    check_owner,
    coming_soon_teasers,
    ensure_known_sources,
    is_live,
    lesson_source_ids,
    lesson_summary,
    tracks_with_lessons,
)
from app.domain.search import Hit
from app.domain.sources import CORE_SOURCE_FIELDS, source_extra

# SQL twin of domain.lessons.is_live: published, and not locked by the Coming soon setting.
LIVE = "status = 'published' and data->>'coming_soon' is distinct from 'true'"


def _job(row) -> dict:
    """A draft_jobs row as a plain dict (ids as strings, timestamps as ISO strings)."""
    d = dict(row)
    for key in ("id", "author_id"):
        d[key] = str(d[key]) if d.get(key) else None
    for key in ("created_at", "updated_at"):
        if d.get(key) is not None:
            d[key] = d[key].isoformat()
    return d


class PostgresRepository:
    kind = "postgres"

    def __init__(self, pool: Any):
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "PostgresRepository":
        import asyncpg

        async def init(conn):
            await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

        # statement_cache_size=0 keeps us compatible with Supabase's transaction pooler.
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=6, init=init, statement_cache_size=0, command_timeout=10, timeout=10)
        return cls(pool)

    async def _curriculum_config(self, c, *, lock=False) -> dict:
        revisions, config = {}, {}
        # All curriculum/course writers lock tracks first, then levels and subjects,
        # before lesson rows. This serializes classification writes without deadlocks.
        for key, default in (("tracks", []), ("levels", DEFAULT_LEVELS), ("subjects", SUBJECTS)):
            inserted = False
            if lock:
                inserted = bool(await c.fetchval(
                    "insert into app_config (key, data) values ($1, $2) on conflict (key) do nothing returning key",
                    key, default,
                ))
            row = await c.fetchrow("select data, updated_at from app_config where key = $1" +
                                   (" for update" if lock else ""), key)
            config[key] = row["data"] if row else default
            revisions[key] = row["updated_at"].isoformat() if row and not inserted else None
        # ponytail: static "Coming soon" titles (`planned`) were removed. They are dropped on read,
        # and the next write of the tracks row removes them from the database; no migration needed.
        for track in config["tracks"]:
            for module in track.get("modules", []):
                module.pop("planned", None)
        return {**config, "updated_at": revisions}

    async def curriculum(self) -> dict:
        async with self.pool.acquire() as c:
            async with c.transaction(isolation="repeatable_read"):
                config = await self._curriculum_config(c)
                rows = await c.fetch("select data, status from lessons order by id")
        for r in rows:
            place_course(config["tracks"], migrate_course(r["data"]), config["subjects"], config["levels"])
        return {**config, "courses": [{**{k: migrate_course(r["data"])[k]
                                         for k in ("id", "title", "subject", "level", "tracks")},
                                      "status": r["status"]} for r in rows]}

    async def save_curriculum(self, key, items, updated_at, actor_id, track_id=None) -> dict:
        async with self.pool.acquire() as c:
            async with c.transaction():
                config = await self._curriculum_config(c, lock=True)
                check_revision(config["updated_at"], key, updated_at)
                rows = await c.fetch("select id, data from lessons order by id for update")
                courses = {r["id"]: migrate_course(r["data"]) for r in rows}
                for course in courses.values():
                    place_course(config["tracks"], course, config["subjects"], config["levels"])
                changed = apply_save(config, courses, key, items, track_id)
                for cid, course in changed.items():
                    await c.execute("update lessons set data = jsonb_set(data, '{tracks}', $2::jsonb), "
                                    "updated_at = clock_timestamp() where id = $1", cid, course["tracks"])
                for changed_key in ([key, "subjects"] if key == "levels" else [key]):
                    await c.execute("update app_config set data = $2, updated_at = clock_timestamp() where key = $1",
                                    changed_key, config[changed_key])
                await c.execute("insert into admin_events (actor_id, kind, payload) values ($1, 'curriculum_saved', $2)",
                                uuid.UUID(actor_id) if actor_id else None,
                                {"key": key, "track": track_id, "items": items})
        return await self.curriculum()

    async def list_tracks(self) -> list[dict]:
        async with self.pool.acquire() as c:
            row = await c.fetchrow("select data from app_config where key = 'tracks'")
            lessons = await c.fetch(f"select data from lessons where {LIVE}")
        tracks = row["data"] if row else []
        return tracks_with_lessons(tracks, {r["data"]["id"]: r["data"] for r in lessons})

    async def get_lesson(self, lesson_id: str, *, include_unpublished: bool = False) -> dict | None:
        q = "select data, status, author_id from lessons where id = $1" + (
            "" if include_unpublished else f" and {LIVE}"
        )
        async with self.pool.acquire() as c:
            row = await c.fetchrow(q, lesson_id)
        return (
            {**migrate_course(row["data"]), "status": row["status"], "author_id": str(row["author_id"]) if row["author_id"] else None}
            if row
            else None
        )

    async def completed_courses(self, user_id: str, track: str, *, exclude: str | None = None, limit: int = 3) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("""SELECT jsonb_build_object('id', l.id, 'title', l.data->'title', 'summary', l.data->'summary') AS data
                FROM progress p JOIN lessons l ON l.id = p.lesson_id
                WHERE p.user_id = $1::uuid AND p.completed_at IS NOT NULL
                  AND ($2::text IS NULL OR l.id <> $2) AND l.status = 'published'
                  AND l.data->>'coming_soon' IS DISTINCT FROM 'true'
                  AND l.data->'tracks' ? $3
                ORDER BY p.completed_at DESC, l.id LIMIT $4""", uuid.UUID(user_id), exclude, track, min(limit, 3))
        return [dict(r["data"]) for r in rows]

    async def get_sources(self, ids: list[str]) -> dict[str, dict]:
        if not ids:
            return {}
        import asyncpg

        cols = ", ".join(CORE_SOURCE_FIELDS)
        async with self.pool.acquire() as c:
            try:
                rows = await c.fetch(f"select {cols}, extra from sources where id = any($1::text[])", ids)
            except asyncpg.UndefinedColumnError:  # migration 0002 not applied yet
                rows = await c.fetch(f"select {cols} from sources where id = any($1::text[])", ids)
        out = {}
        for r in rows:
            row = dict(r)
            extra = row.pop("extra", None) or {}
            out[row["id"]] = {**extra, **row}
        return out

    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]:
        async with self.pool.acquire() as c:
            if embedding is not None:
                vec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
                rows = await c.fetch(
                    "select source_id, content, 1 - (embedding OPERATOR(extensions.<=>) $1::extensions.vector) as score from source_chunks "
                    "where source_id in (select id from sources where review_status = 'approved') "
                    f"and (lesson_id is null or lesson_id in (select id from lessons where {LIVE})) "
                    "order by embedding OPERATOR(extensions.<=>) $1::extensions.vector limit $2",
                    vec,
                    k * 3,
                )
            keyword_rows = await c.fetch(
                "select source_id, content, ts_rank(tsv, plainto_tsquery('simple', $1)) as score from source_chunks "
                "where source_id in (select id from sources where review_status = 'approved') "
                f"and (lesson_id is null or lesson_id in (select id from lessons where {LIVE})) "
                "and tsv @@ plainto_tsquery('simple', $1) order by score desc limit $2",
                query,
                k * 3,
            )
            if embedding is None:
                top = max((r["score"] for r in keyword_rows), default=1) or 1
                rows = [{**dict(r), "score": float(r["score"]) / top} for r in keyword_rows]
            else:
                top = max((r["score"] for r in keyword_rows), default=1) or 1
                rows = list(rows) + [{**dict(r), "score": 0.5 + 0.45 * float(r["score"]) / top} for r in keyword_rows]
        best: dict[str, Hit] = {}
        for r in rows:
            h = best.get(r["source_id"])
            if h is None or r["score"] > h.score:
                best[r["source_id"]] = Hit(r["source_id"], float(r["score"]), r["content"])
        return sorted(best.values(), key=lambda h: -h.score)[:k]

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        async with self.pool.acquire() as c:
            await c.execute(
                "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                lesson_id,
                uuid.UUID(actor_id) if actor_id else None,
                kind,
                payload,
            )

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        async with self.pool.acquire() as c:
            await c.execute(
                "insert into tutor_logs (tier, citation_ids, latency_ms, track) values ($1, $2, $3, $4)",
                tier,
                citation_ids,
                latency_ms,
                track,
            )

    async def reserve_budget(self, user_id: str, tokens: int, settings, *, public: bool = False) -> bool:
        # All replicas lock service then user rows; denial rolls back ALL counters.
        import time

        now = int(time.time())
        entries = [("day:service", now // 86400, 0, tokens, 0, settings.service_daily_tokens),
                   ("day:" + user_id, now // 86400, 0, tokens, 0, settings.user_daily_tokens),
                   ("minute:service", now // 60, 1, 0, settings.service_rate_per_minute, 0),
                   ("minute:" + user_id, now // 60, 1, 0, settings.tutor_rate_per_minute, 0)]
        if public:
            entries = [("minute:public:service", now // 60, 1, 0, settings.public_api_service_rate_per_minute, 0),
                       ("minute:public:" + user_id, now // 60, 1, 0, settings.public_api_rate_per_minute, 0)]
        async with self.pool.acquire(timeout=5) as c:
            async with c.transaction():
                for principal, period, requests, reserved, max_requests, max_tokens in entries:
                    changed = await c.fetchval("""INSERT INTO agent_private.model_budgets
                        (service, principal, period, requests, reserved_tokens) VALUES ('yaqin',$1,$2,$3,$4)
                        ON CONFLICT (service,principal,period) DO UPDATE SET
                        requests=model_budgets.requests+excluded.requests,
                        reserved_tokens=model_budgets.reserved_tokens+excluded.reserved_tokens
                        WHERE model_budgets.requests+excluded.requests <= $5
                          AND model_budgets.reserved_tokens+excluded.reserved_tokens <= $6
                        RETURNING 1""", principal, period, requests, reserved, max_requests, max_tokens)
                    # INSERT also needs the limits checked, before a new period exists.
                    if not changed or requests > max_requests or reserved > max_tokens:
                        raise ApiError(429, "quota_exceeded", "The model budget is temporarily exhausted.")
        return True

    async def release_budget(self, user_id: str, tokens: int) -> None:
        """Give back the part of an operation's reservation it did not use.

        A reservation is a pessimistic up-front hold (the operation's whole token cap).
        Without this, a day's allowance is consumed at the reserved rate, so a learner is
        cut off after a few hundred requests while using a fraction of the real allowance.
        """
        if tokens <= 0:
            return
        now = int(time.time())
        async with self.pool.acquire(timeout=5) as c:
            async with c.transaction():
                for principal in ("day:service", "day:" + user_id):
                    await c.execute("""UPDATE agent_private.model_budgets
                        SET reserved_tokens = greatest(reserved_tokens - $3, 0)
                        WHERE service='yaqin' AND principal=$1 AND period=$2""",
                        principal, now // 86400, tokens)

    async def begin_model_usage(self, user_id: str, call_id: str, day: int) -> None:
        async with self.pool.acquire(timeout=5) as c:
            await c.execute("""INSERT INTO agent_private.model_usage(service,call_id,user_id,period)
                VALUES('yaqin',$1,$2,$3) ON CONFLICT(service,call_id) DO NOTHING""",
                call_id, uuid.UUID(user_id), day)

    async def finish_model_usage(self, call_id: str, tokens: int, counts: dict | None = None) -> None:
        counts = counts or {}
        async with self.pool.acquire(timeout=5) as c:
            await c.execute("""UPDATE agent_private.model_usage SET tokens=$2, input_tokens=$3,
                output_tokens=$4, cache_read_tokens=$5, cache_write_tokens=$6
                WHERE service='yaqin' AND call_id=$1 AND tokens IS NULL""", call_id, tokens,
                counts.get("input_tokens"), counts.get("output_tokens"),
                counts.get("cache_read_tokens"), counts.get("cache_write_tokens"))

    async def expire_draft_jobs(self, seconds: int) -> None:
        async with self.pool.acquire(timeout=5) as c:
            await c.execute("""UPDATE draft_jobs SET status='failed', stage='failed',
                error='generation_interrupted', updated_at=clock_timestamp()
                WHERE status='running' AND coalesce((result->>'_started_at')::timestamptz,created_at) < clock_timestamp()-($1*interval '1 second')""", seconds)

    async def get_role(self, user_id: str) -> str | None:
        async with self.pool.acquire() as c:
            return await c.fetchval(
                "select case when u.banned_until > now() then 'disabled' else p.role end "
                "from auth.users u left join public.profiles p on p.id = u.id where u.id = $1",
                uuid.UUID(user_id),
            )

    async def get_account(self, user_id: str) -> dict | None:
        async with self.pool.acquire() as c:
            row = await c.fetchrow(
                "select u.email, p.display_name from public.profiles p join auth.users u on u.id = p.id where p.id = $1",
                uuid.UUID(user_id),
            )
        return dict(row) if row else None

    async def search_users(
        self, query: str, *, role: str | None = None, status: str | None = None, page: int = 1, page_size: int = 10
    ) -> dict:
        filters = (
            "from public.profiles p join auth.users u on u.id = p.id "
            "where (strpos(lower(coalesce(u.email, '')), lower($1)) > 0 "
            "or strpos(lower(coalesce(p.display_name, '')), lower($1)) > 0) "
            "and ($2::text is null or p.role = $2) "
            "and ($3::boolean is null or coalesce(u.banned_until > now(), false) = $3) "
        )
        disabled = None if status is None else status == "disabled"
        async with self.pool.acquire() as c:
            counts = await c.fetchrow(
                "select count(*) as total, count(*) filter (where p.role = 'learner') as learner, "
                "count(*) filter (where p.role = 'teacher') as teacher, "
                "count(*) filter (where p.role = 'admin') as admin, "
                "count(*) filter (where p.role = 'super_admin') as super_admin, "
                "count(*) filter (where u.banned_until > now()) as disabled "
                "from public.profiles p join auth.users u on u.id = p.id"
            )
            total = await c.fetchval("select count(*) " + filters, query, role, disabled)
            rows = await c.fetch(
                "select p.id, u.email, p.display_name, p.role, p.created_at, u.last_sign_in_at, "
                "coalesce(u.banned_until > now(), false) as disabled " + filters
                + "order by p.created_at desc, p.id desc limit $4 offset $5",
                query,
                role,
                disabled,
                page_size,
                (page - 1) * page_size,
            )
            day = int(time.time()) // 86400
            principals = ["day:" + str(r["id"]) for r in rows]
            try:
                budgets = await c.fetch(
                    "select principal, reserved_tokens from agent_private.model_budgets "
                    "where service = 'yaqin' and period = $1 and principal = any($2::text[])",
                    day, principals,
                )
                usage = {r["principal"]: r["reserved_tokens"] for r in budgets}
            except (UndefinedTableError, InvalidSchemaNameError, InsufficientPrivilegeError):
                # A missing/unreadable ledger is unknown usage, never a zero-token claim.
                usage = None
            standalone_usage = None
            if usage is not None:
                try:
                    async with c.transaction(readonly=True):
                        # Fail if RLS hides the other service; this setting cannot bypass RLS.
                        await c.execute("set local row_security = off")
                        budgets = await c.fetch(
                            "select principal, reserved_tokens from agent_private.model_budgets "
                            "where service = 'standalone' and period = $1 and principal = any($2::text[])",
                            day, principals,
                        )
                    standalone_usage = {r["principal"]: r["reserved_tokens"] for r in budgets}
                except InsufficientPrivilegeError:
                    pass
            actual_usage = {}
            for service, prefix in (("yaqin", "daily"), ("standalone", "standalone_daily")):
                try:
                    async with c.transaction(readonly=True):
                        if service == "standalone":
                            # Detect filtered cross-service data; this cannot bypass RLS.
                            await c.execute("set local row_security = off")
                        measured = await c.fetch("""SELECT user_id, coalesce(sum(tokens),0) AS tokens,
                            count(*) FILTER(WHERE tokens IS NULL) AS unknown_calls,
                            count(*) AS calls,
                            coalesce(sum(input_tokens),0) AS input_tokens,
                            coalesce(sum(output_tokens),0) AS output_tokens,
                            coalesce(sum(cache_read_tokens),0) AS cache_read_tokens,
                            coalesce(sum(cache_write_tokens),0) AS cache_write_tokens
                            FROM agent_private.model_usage WHERE service=$1 AND period=$2
                              AND user_id=any($3::uuid[]) GROUP BY user_id""",
                            service, day, [r["id"] for r in rows])
                    actual_usage[prefix] = {str(r["user_id"]): dict(r) for r in measured}
                except (UndefinedTableError, InvalidSchemaNameError, InsufficientPrivilegeError):
                    actual_usage[prefix] = None
        return {"items": [{**dict(r), "id": str(r["id"]),
                           **{prefix + "_actual_tokens": actual_usage[prefix].get(str(r["id"]), {}).get("tokens", 0)
                              if actual_usage[prefix] is not None else None
                              for prefix in actual_usage},
                           **{prefix + "_usage_unknown_calls": actual_usage[prefix].get(str(r["id"]), {}).get("unknown_calls", 0)
                              if actual_usage[prefix] is not None else None
                              for prefix in actual_usage},
                           **{f"{prefix}_{part}": actual_usage[prefix].get(str(r["id"]), {}).get(part, 0)
                              if actual_usage[prefix] is not None else None
                              for prefix in actual_usage
                              for part in ("calls", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")},
                           "daily_reserved_tokens": usage.get("day:" + str(r["id"]), 0) if usage is not None else None,
                           "standalone_daily_reserved_tokens": standalone_usage.get("day:" + str(r["id"]), 0)
                           if standalone_usage is not None else None}
                          for r in rows], "total": total, "counts": dict(counts)}

    async def set_user_role(self, user_id: str, role: str, actor_id: str) -> None:
        target, actor = uuid.UUID(user_id), uuid.UUID(actor_id)
        async with self.pool.acquire() as c:
            async with c.transaction():
                old = await c.fetchval("select role from public.profiles where id = $1 for update", target)
                if old is None:
                    raise ApiError(404, "not_found", "User not found.")
                await c.execute("update public.profiles set role = $2 where id = $1", target, role)
                await c.execute(
                    "insert into public.admin_events (actor_id, target_id, kind, payload) values ($1, $2, 'role_changed', $3)",
                    actor,
                    target,
                    {"from_role": old, "to_role": role},
                )

    async def set_user_disabled(self, user_id: str, disabled: bool, actor_id: str) -> None:
        target, actor = uuid.UUID(user_id), uuid.UUID(actor_id)
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow(
                    "select coalesce(u.banned_until > now(), false) as disabled "
                    "from public.profiles p join auth.users u on u.id = p.id where p.id = $1 for update of p, u",
                    target,
                )
                if row is None:
                    raise ApiError(404, "not_found", "User not found.")
                if row["disabled"] == disabled:
                    raise ApiError(409, "conflict", "This account is already in that state.")
                await c.execute(
                    "update auth.users set banned_until = case when $2::boolean "
                    "then now() + interval '100 years' else null end where id = $1",
                    target,
                    disabled,
                )
                await c.execute(
                    "insert into public.admin_events (actor_id, target_id, kind, payload) values ($1, $2, $3, $4)",
                    actor,
                    target,
                    "user_disabled" if disabled else "user_enabled",
                    {},
                )

    async def user_history(self, user_id: str) -> list[dict]:
        async with self.pool.acquire() as c:
            if not await c.fetchval("select exists(select 1 from public.profiles where id = $1)", uuid.UUID(user_id)):
                raise ApiError(404, "not_found", "User not found.")
            rows = await c.fetch(
                "select e.id, e.kind, e.payload, e.actor_id, p.display_name as actor_name, u.email as actor_email, e.created_at "
                "from public.admin_events e left join public.profiles p on p.id = e.actor_id "
                "left join auth.users u on u.id = e.actor_id "
                "where e.target_id = $1 order by e.created_at desc, e.id desc limit 50",
                uuid.UUID(user_id),
            )
        return [
            {**dict(r), "id": str(r["id"]), "actor_id": str(r["actor_id"]) if r["actor_id"] else None} for r in rows
        ]

    async def list_courses(self) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(f"select data, status from lessons where {LIVE}")
        return [lesson_summary({**migrate_course(row["data"]), "status": row["status"]}) for row in rows]

    async def content_bundle(self) -> dict:
        async with self.pool.acquire() as c:
            async with c.transaction(isolation="repeatable_read"):
                config = await self._curriculum_config(c)
                tracks = config["tracks"]
                rows = await c.fetch(
                    "select data, status from lessons where status = 'published' "
                    "or (status in ('draft', 'in_review') and data->>'coming_soon' = 'true')"
                )
                sources = await c.fetch("select id from sources")
        courses = [{**migrate_course(r["data"], tracks), "status": r["status"]} for r in rows]
        return {
            "tracks": tracks,
            "subjects": config["subjects"],
            "levels": config["levels"],
            "lessons": {course["id"]: course for course in courses if is_live(course)},
            "coming_soon": coming_soon_teasers(courses),
            "sources": await self.get_sources([r["id"] for r in sources]),
        }

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select data, status, author_id from lessons where $2::boolean or author_id = $1::uuid order by updated_at desc",
                uuid.UUID(user_id) if user_id else None,
                reviewer,
            )
        return [
            {**migrate_course(r["data"]), "status": r["status"], "author_id": str(r["author_id"]) if r["author_id"] else None}
            for r in rows
        ]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool, *, job_id: str | None = None, job_result: dict | None = None, job_token: str | None = None) -> None:
        if not actor_id:
            raise ApiError(401, "unauthorized", "A real user session is required for database writes.")
        async with self.pool.acquire() as c:
            async with c.transaction():
                if job_id:
                    job = await c.fetchrow("SELECT status, result FROM draft_jobs WHERE id=$1 AND author_id=$2 "
                                           "AND coalesce((result->>'_started_at')::timestamptz,created_at) > clock_timestamp()-((coalesce((result->>'_seconds')::int,480)+30)*interval '1 second') FOR UPDATE",
                                           uuid.UUID(job_id), uuid.UUID(actor_id))
                    if not job or job["status"] != "running" or (job_token is not None and (job["result"] or {}).get("_execution_token") != job_token):
                        raise ApiError(409, "generation_interrupted", "Generation was interrupted. Please try again.")
                config = await self._curriculum_config(c, lock=True)
                place_course(config["tracks"], draft, config["subjects"], config["levels"])
                # Conditional upsert also enforces ownership if two authors create the same id concurrently.
                row = await c.fetchrow(
                    "insert into lessons (id, track, module, status, data, author_id) values ($1, $2, $3, 'draft', $4, $5::uuid) "
                    "on conflict (id) do update set track = excluded.track, module = excluded.module, "
                    "status = 'draft', data = excluded.data, updated_at = now() "
                    "where lessons.status <> 'published' and ($6::boolean or lessons.author_id = $5::uuid) returning id, (xmax = 0) as created",
                    draft["id"],
                    None,
                    None,
                    {**draft, "status": "draft"},
                    uuid.UUID(actor_id),
                    reviewer,
                )
                if not row:
                    raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")
                await c.execute("update app_config set data = $1, updated_at = clock_timestamp() where key = 'tracks'", config["tracks"])
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, '{}'::jsonb)",
                    draft["id"],
                    uuid.UUID(actor_id),
                    "created" if row["created"] else "updated",
                )

                if job_id:
                    await c.execute("""UPDATE draft_jobs SET status='done',stage='done',lesson_id=$2,result=$3,
                        updated_at=clock_timestamp() WHERE id=$1""", uuid.UUID(job_id), draft["id"], job_result)

    @staticmethod
    async def _index_cards(c, lesson: dict) -> None:
        """Make the cards of a published course searchable by the tutor."""
        for doc_id, content, source_ids in card_docs(lesson):
            await c.execute(
                "insert into source_chunks (id, source_id, lesson_id, lang, content) values ($1, $2, $3, 'mixed', $4) "
                "on conflict (id) do update set content = excluded.content, source_id = excluded.source_id, embedding = null",
                doc_id,
                source_ids[0],
                lesson["id"],
                content,
            )

    @staticmethod
    def _source_snapshot(rows):
        return {r["id"]: {**(r.get("extra") or {}), **{k: r.get(k) for k in CORE_SOURCE_FIELDS}} for r in rows}

    async def update_published(self, draft: dict, actor_id: str | None, *, expected_sources: dict | None = None) -> None:
        if not actor_id:
            raise ApiError(401, "unauthorized", "A real user session is required for database writes.")
        async with self.pool.acquire() as c:
            async with c.transaction():
                config = await self._curriculum_config(c, lock=True)
                place_course(config["tracks"], draft, config["subjects"], config["levels"])
                sources = await c.fetch(
                    "select * from sources where id = any($1::text[]) for share", lesson_source_ids(draft)
                )
                snapshot = self._source_snapshot(sources)
                if expected_sources is not None and snapshot != expected_sources:
                    raise ApiError(409, "conflict", "Source evidence changed during checks. Try again.")
                ensure_known_sources(draft, snapshot)
                # The status never changes, so learners keep the course while it is replaced.
                row = await c.fetchrow(
                    "update lessons set data = $2, updated_at = now() where id = $1 and status = 'published' returning id",
                    draft["id"],
                    {**draft, "status": "published"},
                )
                if not row:
                    raise ApiError(409, "conflict", "Only published courses can be updated in place.")
                await c.execute("update app_config set data = $1, updated_at = clock_timestamp() where key = 'tracks'", config["tracks"])
                # Removed pages must leave the search too.
                await c.execute("delete from source_chunks where lesson_id = $1", draft["id"])
                await self._index_cards(c, draft)
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, 'updated', '{}'::jsonb)",
                    draft["id"],
                    uuid.UUID(actor_id),
                )

    async def lesson_history(self, lesson_id: str) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select e.id, e.kind, e.payload, e.actor_id, p.display_name as actor_name, u.email as actor_email, e.created_at "
                "from review_events e left join profiles p on p.id = e.actor_id left join auth.users u on u.id = e.actor_id "
                "where e.lesson_id = $1 order by e.created_at desc, e.id desc",
                lesson_id,
            )
        return [
            {**dict(r), "id": str(r["id"]), "actor_id": str(r["actor_id"]) if r["actor_id"] else None} for r in rows
        ]

    async def archive_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow("select status, author_id from lessons where id = $1 for update", lesson_id)
                if not row:
                    raise ApiError(404, "not_found", "Course not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if row["status"] == "archived":
                    raise ApiError(409, "conflict", "This course is already archived.")
                await c.execute(
                    "update lessons set status = 'archived', data = jsonb_set(data, '{status}', '\"archived\"'::jsonb), updated_at = now() where id = $1",
                    lesson_id,
                )
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, 'archived', '{}'::jsonb)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    async def transition_lesson(
        self,
        lesson_id: str,
        actor_id: str | None,
        kind: str,
        note: str = "",
        *,
        reviewer: bool = False,
        expected: dict | None = None,
        expected_sources: dict | None = None,
    ) -> str:
        async with self.pool.acquire() as c:
            async with c.transaction():
                curriculum = await self._curriculum_config(c, lock=True)
                row = await c.fetchrow(
                    "select data, status, author_id from lessons where id = $1 for update", lesson_id
                )
                if not row:
                    raise ApiError(404, "not_found", "Course not found.")
                lesson = {
                    **migrate_course(row["data"]),
                    "status": row["status"],
                    "author_id": str(row["author_id"]) if row["author_id"] else None,
                }
                if expected is not None and lesson != expected:
                    raise ApiError(409, "conflict", "The course changed during checks. Try again.")
                if kind != "submit" and not reviewer:
                    raise ApiError(403, "forbidden", "An admin must review this course.")
                if kind == "submit" and (
                    (not reviewer and str(row["author_id"]) != actor_id) or row["status"] != "draft"
                ):
                    raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
                if kind != "submit" and row["status"] != "in_review":
                    raise ApiError(409, "conflict", "The course must be in review first.")
                if kind == "approve":
                    ids = lesson_source_ids(row["data"])
                    sources = await c.fetch(
                        "select * from sources where id = any($1::text[]) for share", ids
                    )
                    snapshot = self._source_snapshot(sources)
                    if expected_sources is not None and snapshot != expected_sources:
                        raise ApiError(409, "conflict", "Source evidence changed during checks. Try again.")
                    ensure_known_sources(row["data"], snapshot)
                    # Ensure newly published lessons appear in their existing curriculum module.
                    config = curriculum["tracks"]
                    place_course(config, lesson, curriculum["subjects"], curriculum["levels"])
                    await c.execute("update app_config set data = $1, updated_at = clock_timestamp() where key = 'tracks'", config)
                    await self._index_cards(c, row["data"])
                status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
                await c.execute(
                    "update lessons set status = $2, data = jsonb_set(data, '{status}', to_jsonb($2::text)), updated_at = now() where id = $1",
                    lesson_id,
                    status,
                )
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                    kind,
                    {"note": note, "reviewed": reviewer} if kind == "approve" else {"note": note},
                )
                return status

    async def unpublish_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow("select status, author_id from lessons where id = $1 for update", lesson_id)
                if not row:
                    raise ApiError(404, "not_found", "Course not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if row["status"] != "published":
                    raise ApiError(409, "conflict", "Only published courses can be hidden.")
                await c.execute(
                    "update lessons set status = 'draft', data = jsonb_set(data, '{status}', '\"draft\"'::jsonb), updated_at = now() where id = $1",
                    lesson_id,
                )
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, 'unpublish', '{}'::jsonb)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    async def delete_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                curriculum = await self._curriculum_config(c, lock=True)
                # FOR UPDATE also blocks new progress FK checks until this transaction ends.
                row = await c.fetchrow(
                    "select data, status, author_id from lessons where id = $1 for update", lesson_id
                )
                if not row:
                    raise ApiError(404, "not_found", "Course not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if await c.fetchval("select exists(select 1 from progress where lesson_id = $1)", lesson_id):
                    raise ApiError(
                        409,
                        "has_progress",
                        "Learners have progress on this course. Archive it instead of deleting it.",
                    )
                config = curriculum["tracks"]
                for track in config:
                    for module in track["modules"]:
                        module["lessons"] = [i for i in module["lessons"] if i != lesson_id]
                await c.execute("update app_config set data = $1, updated_at = clock_timestamp() where key = 'tracks'", config)
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into admin_events (actor_id, kind, payload) values ($1, 'lesson_deleted', $2)",
                    uuid.UUID(actor_id) if actor_id else None,
                    {"id": lesson_id, "title": row["data"]["title"]},
                )
                await c.execute("delete from lessons where id = $1", lesson_id)

    async def pending_sources(self) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("select * from sources where review_status = 'pending' order by id")
        return [dict(r) for r in rows]

    async def add_source(self, source: dict) -> dict:
        # An entry that already exists is kept as it is: curated and approved sources are never overwritten.
        cols = ", ".join(CORE_SOURCE_FIELDS)
        places = ", ".join(f"${i + 1}" for i in range(len(CORE_SOURCE_FIELDS) + 1))
        async with self.pool.acquire() as c:
            await c.execute(
                f"insert into sources ({cols}, extra) values ({places}) on conflict (id) do nothing",
                *[source.get(k) for k in CORE_SOURCE_FIELDS],
                source_extra(source),
            )
        return (await self.get_sources([source["id"]]))[source["id"]]

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                result = await c.execute(
                    "update sources set review_status = 'approved', updated_at = now() where id = $1", source_id
                )
                if result != "UPDATE 1":
                    raise ApiError(404, "not_found", "Source not found.")
                await c.execute(
                    "insert into source_review_events (source_id, actor_id) values ($1, $2)",
                    source_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    # ---- Studio AI draft jobs -------------------------------------------------
    _JOB_FIELDS = ("status", "stage", "attempt", "result", "lesson_id", "error")

    async def create_draft_job(self, author_id: str | None, prompt: str, lang: str, *, track: str | None = None, seconds: int = 480) -> dict:
        async with self.pool.acquire() as c:
            row = await c.fetchrow(
                "insert into draft_jobs (author_id, prompt, lang, result) values ($1, $2, $3, $4) "
                "returning id, author_id, prompt, lang, status, stage, attempt, result, lesson_id, error, "
                "created_at, updated_at",
                uuid.UUID(author_id) if author_id else None, prompt, lang, {"track": track, "_seconds": seconds},
            )
        return _job(row)

    async def update_draft_job(self, job_id: str, *, expected_token: str | None = None, **fields) -> bool:
        cols = [k for k in fields if k in self._JOB_FIELDS]
        if not cols:
            return False
        sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(cols))
        async with self.pool.acquire() as c:
            changed = await c.fetchval(
                f"update draft_jobs set {sets}, updated_at = clock_timestamp() where id = $1 and status = 'running' "
                f"and (${len(cols) + 2}::text is null or result->>'_execution_token' = ${len(cols) + 2}) returning id",
                uuid.UUID(job_id), *[fields[k] for k in cols], expected_token,
            )
        return changed is not None

    async def claim_draft_job(self, job_id: str, author_id: str, updated_at: str, result: dict) -> bool:
        async with self.pool.acquire() as c:
            changed = await c.fetchval("""UPDATE draft_jobs SET status='running',stage='queued',result=$4,error=null,
                updated_at=clock_timestamp() WHERE id=$1 AND author_id=$2 AND status='failed'
                AND updated_at=$3::timestamptz RETURNING id""",
                uuid.UUID(job_id), uuid.UUID(author_id), datetime.fromisoformat(updated_at), result)
        return changed is not None

    async def get_draft_job(self, job_id: str) -> dict | None:
        try:
            jid = uuid.UUID(job_id)
        except ValueError:
            return None
        async with self.pool.acquire() as c:
            row = await c.fetchrow(
                "select id, author_id, prompt, lang, status, stage, attempt, result, lesson_id, error, "
                "created_at, updated_at from draft_jobs where id = $1",
                jid,
            )
        return _job(row) if row else None

    async def ping(self) -> bool:
        try:
            async with self.pool.acquire() as c:
                return await c.fetchval("select 1") == 1
        except Exception:
            return False

    async def close(self) -> None:
        await self.pool.close()
