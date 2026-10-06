"""Run the course migration and Postgres workflow in a disposable local database.

python -m scripts.check_course_migration postgresql://aymen@127.0.0.1:55438/postgres
The supplied server must be local. No configured application database is used.
"""

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg

from app.domain.sources import CORE_SOURCE_FIELDS
from app.repositories.postgres_repository import PostgresRepository

ROOT = Path(__file__).resolve().parents[2]


async def run(dsn: str):
    parsed = urlparse(dsn)
    if parsed.hostname not in ("localhost", "127.0.0.1"):
        raise ValueError("Use an isolated local PostgreSQL server.")
    name = "yaqin_course_check_" + uuid4().hex[:12]
    control = await asyncpg.connect(dsn)
    repo = None
    connection = None
    try:
        await control.execute(f'create database "{name}"')
        test_dsn = parsed._replace(path="/" + name).geturl()
        connection = await asyncpg.connect(test_dsn)
        await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await connection.execute("""
            create schema auth;
            create table auth.users(id uuid primary key, email text);
            create table profiles(id uuid primary key, display_name text);
            create table lessons(id text primary key, track text not null, module text not null,
                status text, data jsonb, author_id uuid, updated_at timestamptz default now());
            create table app_config(key text primary key, data jsonb, updated_at timestamptz default now());
            create table progress(user_id uuid, lesson_id text references lessons(id), card_index int,
                quiz_score numeric, completed_at timestamptz, note text, primary key(user_id,lesson_id));
            create table review_events(id uuid default gen_random_uuid(), lesson_id text references lessons(id) on delete cascade,
                actor_id uuid, kind text, payload jsonb, created_at timestamptz default now());
            create table draft_jobs(id uuid primary key, lesson_id text references lessons(id) on delete set null, result jsonb);
            create table admin_events(actor_id uuid, kind text, payload jsonb);
            create table source_chunks(id text primary key, source_id text, lesson_id text, lang text, content text, embedding text);
            alter table lessons enable row level security;
            create policy published_read on lessons for select using(status = 'published');
        """)
        await connection.execute("create table sources (" + ",".join(f"{c} text" for c in CORE_SOURCE_FIELDS) + ", extra jsonb, updated_at timestamptz default now())")
        uid = uuid4()
        await connection.execute("insert into auth.users values($1, 'author@example.test')", uid)
        await connection.execute("insert into profiles values($1, 'Author')", uid)
        source = json.loads((ROOT / "content/sources/quran.json").read_text())[0]
        source["review_status"] = "approved"
        await connection.execute("insert into sources (" + ",".join(CORE_SOURCE_FIELDS) + ") values(" + ",".join(f"${i+1}" for i in range(len(CORE_SOURCE_FIELDS))) + ")", *[source.get(c) for c in CORE_SOURCE_FIELDS])
        old = json.loads((ROOT / "content/lessons/wudu-order.json").read_text())
        old.pop("tracks"); old.pop("subject")
        old.update(track="first-steps", module="purification", level="deeper", tags=["legacy"])
        for card in old["cards"]:
            card["sources"] = [source["id"]]
        old.pop("quiz", None); old.pop("explain_back", None)
        tracks = [{"id": tid, "title": {"en": tid, "ar": "مسار"}, "modules": [{"id": "purification", "title": {"en": "Order", "ar": "الترتيب"}, "lessons": [old["id"], old["id"]] if tid == "deepen" else [], "planned": [{"en": "Future", "ar": "قريبًا"}]}]} for tid in ("explore", "first-steps", "deepen")]
        await connection.execute("insert into app_config values('tracks',$1,now())", tracks)
        for status in ("published", "draft", "in_review", "archived"):
            data = {**old, "id": old["id"] if status == "published" else status, "status": status}
            await connection.execute("insert into lessons values($1,$2,$3,$4,$5,$6,now())", data["id"], data["track"], data["module"], status, data, uid)
        await connection.execute("insert into progress values($1,$2,2,0.8,now(),'keep')", uid, old["id"])
        await connection.execute("insert into review_events(lesson_id,actor_id,kind,payload) values($1,$2,'approve','{\"note\":\"preserve\"}')", old["id"], uid)
        await connection.execute("insert into draft_jobs values($1,$2,$3)", uuid4(), "draft", {"lesson": {**old, "id": "draft"}, "review": {"issues": []}})
        before = {table: await connection.fetch(f"select * from {table}") for table in ("progress", "review_events")}
        records = {r["id"]: dict(r) for r in await connection.fetch("select * from lessons")}
        policy = await connection.fetch("select * from pg_policies where tablename='lessons'")
        migration = next((ROOT / "supabase/migrations").glob("*_course_structure.sql")).read_text()
        for _ in range(2):
            await connection.execute(migration)
        for row in await connection.fetch("select * from lessons"):
            original = records[row["id"]]
            expected_tracks = ["first-steps", "deepen"] if row["id"] == old["id"] else ["first-steps"]
            assert row["data"]["tracks"] == expected_tracks
            assert row["status"] == original["status"] and row["author_id"] == original["author_id"]
            assert row["data"]["level"] == "deeper" and row["data"]["subject"] == "fiqh"
            assert {k:v for k,v in row["data"].items() if k not in ("subject", "tracks")} == {k:v for k,v in original["data"].items() if k not in ("track", "module", "tags")}
        for table, rows in before.items():
            assert await connection.fetch(f"select * from {table}") == rows
        assert await connection.fetch("select * from pg_policies where tablename='lessons'") == policy
        assert await connection.fetchval("select relrowsecurity from pg_class where oid='lessons'::regclass")
        config = await connection.fetchval("select data from app_config where key='tracks'")
        for t in config:
            assert t["modules"][0]["planned"] == [{"en": "Future", "ar": "قريبًا"}]
            assert t["modules"][0]["lessons"].count(old["id"]) == int(t["id"] in ("first-steps", "deepen"))
        job = await connection.fetchval("select result from draft_jobs limit 1")
        assert "tags" not in job["lesson"] and job["review"] == {"issues": []}
        repo = await PostgresRepository.connect(test_dsn)
        course = await repo.get_lesson("draft", include_unpublished=True)
        assert course["tracks"] == ["first-steps"]
        course.pop("author_id")
        course["tracks"] = ["explore", "deepen"]
        course["subject"] = "quran"  # proves subject is independent of track placement
        await repo.save_draft(course, str(uid), True)
        await repo.transition_lesson("draft", str(uid), "submit", reviewer=True)
        expected = await repo.get_lesson("draft", include_unpublished=True)
        await repo.transition_lesson("draft", str(uid), "approve", reviewer=True, expected=expected)
        bundle = await repo.content_bundle()
        assert bundle["lessons"]["draft"]["tracks"] == ["explore", "deepen"]
        for t in bundle["tracks"]:
            assert [cid for m in t["modules"] for cid in m["lessons"]].count("draft") == int(t["id"] in ("explore", "deepen"))
        assert await connection.fetch("select * from progress") == before["progress"]
        # An admin's update replaces a published course in place.
        live = await repo.get_lesson("draft", include_unpublished=True)
        live.pop("author_id")
        live["cards"] = live["cards"][:1]
        await repo.update_published(live, str(uid))
        updated = await repo.get_lesson("draft")
        assert updated["status"] == "published" and len(updated["cards"]) == 1 and updated["author_id"] == str(uid)
        assert await connection.fetchval("select count(*) from source_chunks where lesson_id = 'draft'") == 1
        assert await connection.fetchval("select kind from review_events where lesson_id = 'draft' order by created_at desc limit 1") == "updated"
        await repo.unpublish_lesson("draft", str(uid), True)
        await repo.delete_lesson("draft", str(uid), True)
        print("Postgres migration (twice), content/IDs/levels/status/owners/progress/review/jobs/RLS preservation, ordering, multi-track publish and in-place update passed.")
    finally:
        if repo:
            await repo.close()
        if connection:
            await connection.close()
        await control.execute(f'drop database if exists "{name}"')
        await control.close()


if __name__ == "__main__":
    asyncio.run(run(sys.argv[1]))
