"""Exact verses from canonical S3 editions; local catalogs are an explicit test override."""

import hashlib
import json
import logging
import re
from pathlib import Path
from urllib.parse import urlparse

import boto3

from app.domain.errors import ApiError
from app.gateways.quran_gateway import QuranGateway

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
END_MARK = re.compile(r"\s*۝[٠-٩]+\s*$")
log = logging.getLogger(__name__)


class QuranCatalogGateway(QuranGateway):
    def __init__(self, content_dir: Path, *, s3_uri: str | None = None, profile=None, region="eu-west-1"):
        self._path = content_dir / "quran" / "ayat.json"
        self._s3_uri = s3_uri
        self._profile, self._region = profile, region
        self._catalog: dict | None = None

    def _s3_catalog(self):
        source = urlparse(self._s3_uri)
        if source.scheme != "s3" or not source.netloc or not source.path.strip("/") or source.query or source.fragment:
            raise ValueError("QURAN_S3_URI must be an s3://bucket/prefix URI")
        client = boto3.Session(profile_name=self._profile, region_name=self._region).client("s3")
        prefix = source.path.strip("/") + "/"

        def read(key):
            body = client.get_object(Bucket=source.netloc, Key=prefix + key)["Body"]
            try:
                raw = body.read(20 * 1024 * 1024 + 1)
            finally:
                body.close()
            if len(raw) > 20 * 1024 * 1024:
                raise ValueError("Quran source exceeds its size limit")
            return raw

        def edition(key):
            meta = json.loads(read(key + "/metadata.json"))
            raw = read(key + "/verses.jsonl")
            expected = meta["files"]["verses.jsonl"]
            if len(raw) != expected["bytes"] or hashlib.sha256(raw).hexdigest() != expected["sha256"]:
                raise ValueError("Quran source integrity check failed")
            rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line]
            if len(rows) != 6236:
                raise ValueError("Incomplete Quran edition")
            surahs = [[] for _ in range(114)]
            for row in rows:
                s, a = row["surah_number"], row["ayah_number"]
                if not 1 <= s <= 114 or a != len(surahs[s - 1]) + 1 or row["verse_key"] != f"{s}:{a}" or not row["text"].strip():
                    raise ValueError("Invalid Quran verse identity/order")
                surahs[s - 1].append(row)
            if any(not rows for rows in surahs):
                raise ValueError("Missing Quran surah")
            return meta, surahs

        ar_meta, arabic = edition("ar/kfgqpc-hafs-v30")
        en_meta, english = edition("en/sahih-international-13638")
        surahs = []
        for s, (ar, en) in enumerate(zip(arabic, english), 1):
            if len(ar) != len(en):
                raise ValueError("Quran verse counts differ")
            surahs.append({
                "number": s, "name_ar": ar[0]["surah_name_ar"], "name_en": ar[0]["surah_name_latin"],
                "url": en[0]["source_url"],
                "ayat": [[END_MARK.sub("", a["text"]), e["text"]] for a, e in zip(ar, en)],
            })
        return {"ar": ar_meta, "en": en_meta, "surahs": surahs}

    def ayah_source(self, surah: int, ayah: int) -> dict | None:
        if not 1 <= surah <= 114 or ayah < 1:
            return None
        if self._catalog is None:
            if self._s3_uri:
                try:
                    self._catalog = self._s3_catalog()
                except Exception:
                    log.exception("S3 Quran catalog could not be loaded")
                    raise ApiError(503, "quran_unavailable", "The Quran source is temporarily unavailable. Please retry.") from None
            else:
                self._catalog = json.loads(self._path.read_text()) if self._path.exists() else {"surahs": []}
        data = self._catalog
        if not 1 <= surah <= len(data["surahs"]):
            return None
        entry = data["surahs"][surah - 1]
        if not 1 <= ayah <= len(entry["ayat"]):
            return None
        ar, en = entry["ayat"][ayah - 1]
        return {
            "id": f"quran:{surah}:{ayah}",
            "kind": "quran",
            "ref_en": f"{entry['name_en']} {surah}:{ayah}",
            "ref_ar": f"{entry['name_ar']}: {str(ayah).translate(AR_DIGITS)}",
            "text_ar": ar,
            "text_en": en,
            "translation": f"{data['en']['title']} ({data['en']['provider']})",
            "origin": data["en"]["provider"],
            "url": entry["url"],
            "grading": None,
            "review_status": "pending",
            "arabic_edition": f"{data['ar']['title']} ({data['ar']['provider']})",
        }
