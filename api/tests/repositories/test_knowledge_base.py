from app.domain.sources import source_extra
from tests.fixtures.source_data import HADITH


async def test_persisted_source_metadata_reaches_index_and_content_bundle(monkeypatch):
    from contextlib import nullcontext
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.domain.sources import CORE_SOURCE_FIELDS
    from app.repositories.postgres_repository import PostgresRepository
    from scripts import seed

    persisted = {**HADITH, "text_en": "Approved reviewer wording", "review_status": "approved"}
    row = {key: persisted.get(key) for key in CORE_SOURCE_FIELDS} | {"extra": source_extra(persisted)}
    conn = SimpleNamespace(
        set_type_codec=AsyncMock(),
        fetchval=AsyncMock(return_value=True),
        fetchrow=AsyncMock(return_value=None),
        transaction=lambda **kwargs: nullcontext(),
        executemany=AsyncMock(),
        execute=AsyncMock(),
        fetch=AsyncMock(side_effect=[[row], [], []]),
        close=AsyncMock(),
    )
    monkeypatch.setattr("asyncpg.connect", AsyncMock(return_value=conn))
    monkeypatch.setattr(
        seed, "get_settings", lambda: SimpleNamespace(database_url="test", content_dir=None, aws_enabled=False)
    )
    monkeypatch.setattr(seed, "load_content", lambda _: ([], {}, {HADITH["id"]: HADITH}))
    assert await seed.main(["--no-embed"]) == 0
    passages = "\n".join(chunk[4] for chunk in conn.executemany.call_args_list[-1].args[1])
    assert "Approved reviewer wording" in passages
    assert "Scholarly explanation (not hadith text)" in passages
    assert "Teaching by demonstration." in passages

    conn.fetchval.return_value = []
    conn.fetch.side_effect = [[], [{"id": HADITH["id"]}], [row]]
    store = PostgresRepository(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    bundle = await store.content_bundle()
    source = bundle["sources"][HADITH["id"]]
    assert {key: source[key] for key in persisted} == persisted
