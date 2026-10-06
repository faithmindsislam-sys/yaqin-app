"""Load content/ JSON into Postgres and build the retrieval index. Idempotent.

python -m scripts.seed                 # sources, lessons, tracks, chunks (+ embeddings if AWS is configured)
python -m scripts.seed --no-embed      # keyword index only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.configuration.settings import get_settings
from app.domain.lessons import card_docs
from app.domain.sources import CORE_SOURCE_FIELDS, source_extra, source_passages
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.repositories.content_files import load_content

SOURCE_COLS = CORE_SOURCE_FIELDS
MAX_CHUNK = 1800  # characters; long Q&A answers are split so each embedding stays focused


def split(text: str, limit: int = MAX_CHUNK) -> list[str]:
    head, _, body = text.partition("\n")
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for para in body.split("\n"):
        if cur and len(cur) + len(para) + 1 > limit - len(head):
            parts.append(cur)
            cur = ""
        cur = f"{cur}\n{para}" if cur else para
    if cur:
        parts.append(cur)
    return [f"{head}\n{p}" for p in parts]


def source_chunks(src: dict) -> list[dict]:
    """Chunks per language (plus labelled scholarly-explanation chunks), each carrying the
    reference so either language retrieves it, and each resolving to the source id."""
    chunks = []
    for suffix, lang, text in source_passages(src):
        pieces = split(text)
        for i, piece in enumerate(pieces):
            cid = f"{src['id']}#{suffix}" + (f"-{i + 1}" if len(pieces) > 1 else "")
            chunks.append({"id": cid, "source_id": src["id"], "lesson_id": None, "lang": lang, "content": piece})
    return chunks


def lesson_chunks(lesson: dict) -> list[dict]:
    """Reviewed card prose, linked to the card's first source (or the lesson's) so a hit resolves to citable text."""
    return [
        {"id": doc_id, "source_id": ids[0], "lesson_id": lesson["id"], "lang": "mixed", "content": text}
        for doc_id, text, ids in card_docs(lesson)
    ]


async def main(argv: list[str] | None = None) -> int:
    import asyncpg

    ap = argparse.ArgumentParser()
    ap.add_argument("--no-embed", action="store_true")
    args = ap.parse_args(argv)

    s = get_settings()
    if not s.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    tracks, lessons, sources = load_content(s.content_dir)
    embed = not args.no_embed and s.aws_enabled
    print(
        f"{len(sources)} sources, {len(lessons)} lessons, {len(tracks)} tracks; embeddings: {'on' if embed else 'off'}"
    )

    embeddings = BedrockEmbeddingGateway(s)
    conn = await asyncpg.connect(s.database_url, statement_cache_size=0)
    try:
        await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        has_extra = await conn.fetchval(
            "select exists (select 1 from information_schema.columns "
            "where table_schema = 'public' and table_name = 'sources' and column_name = 'extra')"
        )
        if not has_extra:
            print("sources.extra is missing: apply supabase/migrations/0002_source_extra.sql first", file=sys.stderr)
            return 1
        async with conn.transaction():
            await conn.executemany(
                f"insert into sources ({', '.join(SOURCE_COLS)}, extra) values ({', '.join(f'${i + 1}' for i in range(len(SOURCE_COLS) + 1))}) "
                "on conflict (id) do nothing",
                [tuple(src.get(c) for c in SOURCE_COLS) + (source_extra(src),) for src in sources.values()],
            )
            await conn.executemany(
                "insert into lessons (id, track, module, status, data) values ($1, $2, $3, $4, $5) "
                "on conflict (id) do nothing",
                [
                    (lesson["id"], None, None, lesson.get("status", "draft"), lesson)
                    for lesson in lessons.values()
                ],
            )
            await conn.execute(
                "insert into app_config (key, data) values ('tracks', $1) on conflict (key) do nothing", tracks
            )

        # Index persisted content, so reseeding never rolls back staff edits or approvals.
        sources = {}
        for row in await conn.fetch("select * from sources"):
            source = dict(row)
            extra = source.pop("extra", None) or {}
            sources[source["id"]] = {**extra, **source}
        lessons = {
            row["id"]: {**row["data"], "status": row["status"]}
            for row in await conn.fetch("select id, data, status from lessons where status = 'published'")
        }
        chunks = [c for src in sources.values() for c in source_chunks(src)]
        chunks += [c for lesson in lessons.values() for c in lesson_chunks(lesson) if c["source_id"] in sources]
        existing = {
            r["id"]: r["content"]
            for r in await conn.fetch("select id, content from source_chunks where embedding is not null")
        }
        rows = []
        for i, c in enumerate(chunks, 1):
            vec = None
            if embed:
                if existing.get(c["id"]) == c["content"]:
                    vec = "keep"
                else:
                    v = await embeddings.embed(c["content"])
                    vec = "[" + ",".join(f"{x:.6f}" for x in v) + "]" if v else None
            rows.append((c["id"], c["source_id"], c["lesson_id"], c["lang"], c["content"], vec))
            if i % 25 == 0:
                print(f"  chunks {i}/{len(chunks)}")
        await conn.executemany(
            "insert into source_chunks (id, source_id, lesson_id, lang, content, embedding) "
            "values ($1, $2, $3, $4, $5, case when $6::text in ('keep') or $6::text is null then null else $6::text::extensions.vector end) "
            "on conflict (id) do update set source_id = excluded.source_id, lesson_id = excluded.lesson_id, "
            "lang = excluded.lang, content = excluded.content, "
            "embedding = case when $6::text = 'keep' then source_chunks.embedding else excluded.embedding end",
            rows,
        )
        ids = [c["id"] for c in chunks]
        await conn.execute("delete from source_chunks where not (id = any($1::text[]))", ids)
        print(f"upserted {len(sources)} sources, {len(lessons)} lessons, {len(chunks)} chunks")
    finally:
        try:
            await embeddings.close()
        finally:
            await conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
