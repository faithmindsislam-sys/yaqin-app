import json
import hashlib
from io import BytesIO
from types import SimpleNamespace

import pytest

from app.domain.errors import ApiError
from app.gateways.quran_catalog_gateway import QuranCatalogGateway


def test_catalogs_are_owned_by_the_gateway_and_return_exact_pending_verses(tmp_path):
    gateways = []
    for name, text in (("first", "Exact first text"), ("second", "Exact second text")):
        directory = tmp_path / name / "quran"
        directory.mkdir(parents=True)
        catalog = {
            "surahs": [
                {"name_en": "Opening", "name_ar": "الفاتحة", "url": "https://example.test", "ayat": [["نص", text]]}
            ],
            "en": {"title": "English", "provider": "Test"},
            "ar": {"title": "Arabic", "provider": "Test"},
        }
        (directory / "ayat.json").write_text(json.dumps(catalog))
        gateways.append(QuranCatalogGateway(directory.parent))
    assert gateways[0].ayah_source(1, 1)["text_en"] == "Exact first text"
    assert gateways[1].ayah_source(1, 1)["text_en"] == "Exact second text"
    assert gateways[0].ayah_source(1, 1)["review_status"] == "pending"
    assert gateways[0].ayah_source(0, 1) is None
    assert gateways[0].ayah_source(1, 2) is None


def test_s3_catalog_checks_integrity_preserves_text_and_never_falls_back(tmp_path, monkeypatch):
    # Nonreligious fixtures, with 114 sections and 6,236 entries; no workstation resources.
    objects = {}
    for key, language in (("ar/kfgqpc-hafs-v30", "ar"), ("en/sahih-international-13638", "en")):
        rows = [{"surah_number": s, "ayah_number": a, "verse_key": f"{s}:{a}",
                 "text": f"Exact {language} fixture {s}:{a}", "surah_name_ar": "Fixture",
                 "surah_name_latin": "Fixture", "source_url": "https://fixture.test"}
                for s in range(1, 115) for a in range(1, (55 if s < 114 else 21) + 1)]
        raw = "\n".join(json.dumps(row) for row in rows).encode()
        objects[f"resources/quran/{key}/verses.jsonl"] = raw
        objects[f"resources/quran/{key}/metadata.json"] = json.dumps({
            "title": language, "provider": "Fixture", "files": {"verses.jsonl": {
                "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}}}).encode()
    calls = []

    def get_object(**kwargs):
        calls.append(kwargs)
        return {"Body": BytesIO(objects[kwargs["Key"]])}

    monkeypatch.setattr("app.gateways.quran_catalog_gateway.boto3.Session",
                        lambda **kwargs: SimpleNamespace(client=lambda service: SimpleNamespace(get_object=get_object)))
    gateway = QuranCatalogGateway(tmp_path, s3_uri="s3://yaqin-resources-744172873146/resources/quran/")
    assert gateway.ayah_source(114, 21)["text_en"] == "Exact en fixture 114:21"
    assert gateway.ayah_source(1, 1)["review_status"] == "pending"
    assert len(calls) == 4  # In-memory cache only, no persisted local catalog.
    assert all(call["Bucket"] == "yaqin-resources-744172873146" for call in calls)
    objects["resources/quran/en/sahih-international-13638/verses.jsonl"] += b"corruption"
    gateway = QuranCatalogGateway(tmp_path, s3_uri="s3://yaqin-resources-744172873146/resources/quran/")
    with pytest.raises(ApiError) as error:
        gateway.ayah_source(1, 1)
    assert error.value.status == 503
    assert gateway._catalog is None  # Failure is retryable, never a local success/false 404.


def test_production_cannot_disable_the_s3_source():
    from app.configuration.settings import Settings
    from app.container import create_services

    with pytest.raises(RuntimeError, match="Production requires QURAN_S3_URI"):
        create_services(None, Settings(_env_file=None, env="prod", quran_s3_uri=""))
