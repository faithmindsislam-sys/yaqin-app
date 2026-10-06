"""Re-source Qur'an entries from QuranEnc (موسوعة القرآن الكريم), and attach recitation.

    python3 content/tools/fetch_quranenc.py            # every quran:* id in sources/quran.json
    python3 content/tools/fetch_quranenc.py quran:2:255 quran:1:1-7

Arabic and English come verbatim from QuranEnc's approved translation
(english_saheeh). QuranEnc's terms forbid modifying the content, so the
translation keeps its footnote markers; footnotes are stored alongside.
Recitation: Mishary Alafasy (Hafs) surah files and ayah timings from mp3quran.net.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kb_http import ar_digits, get_json, load_sources, save_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources" / "quran.json"
KEY = "english_saheeh"
RECITER = {"read": 123, "name_en": "Mishary Alafasy", "name_ar": "مشاري العفاسي", "folder": "https://server8.mp3quran.net/afs/"}

SURAH_EN = {1: "Al-Fatihah", 2: "Al-Baqarah", 5: "Al-Ma'idah", 10: "Yunus", 16: "An-Nahl", 18: "Al-Kahf",
            20: "Ta-Ha", 42: "Ash-Shura", 60: "Al-Mumtahanah", 106: "Quraysh", 112: "Al-Ikhlas"}
SURAH_AR = {1: "الفاتحة", 2: "البقرة", 5: "المائدة", 10: "يونس", 16: "النحل", 18: "الكهف",
            20: "طه", 42: "الشورى", 60: "الممتحنة", 106: "قريش", 112: "الإخلاص"}


def translation_meta():
    for t in get_json("https://quranenc.com/api/v1/translations/list/en")["translations"]:
        if t["key"] == KEY:
            return t
    raise SystemExit(f"{KEY} not listed by QuranEnc")


_timings = {}


def timing(surah: int, ayah: int):
    if surah not in _timings:
        rows = get_json(f"https://www.mp3quran.net/api/v3/ayat_timing?surah={surah}&read={RECITER['read']}")
        _timings[surah] = {r["ayah"]: r for r in rows}
    return _timings[surah].get(ayah)


def _ascii_name(name: str) -> str:
    """'Āl-‘Imrān' -> "Al-'Imran", matching the plain style of SURAH_EN."""
    name = name.replace("‘", "'").replace("’", "'")
    return "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))


@lru_cache(maxsize=1)
def _bundled_names() -> dict:
    surahs = json.loads((ROOT / "quran" / "ayat.json").read_text(encoding="utf-8"))["surahs"]
    return {s["number"]: (_ascii_name(s["name_en"]), s["name_ar"]) for s in surahs}


def surah_names(surah: int):
    if surah in SURAH_EN:
        return SURAH_EN[surah], SURAH_AR[surah]
    if surah in _bundled_names():
        return _bundled_names()[surah]
    raise SystemExit(f"unknown surah {surah}")


def fetch(surah: int, ayah: int, meta: dict, existing: dict) -> dict:
    r = get_json(f"https://quranenc.com/api/v1/translation/aya/{KEY}/{surah}/{ayah}")["result"]
    en_name, ar_name = surah_names(surah)
    src = dict(existing)
    src.update({
        "id": f"quran:{surah}:{ayah}",
        "kind": "quran",
        "ref_en": f"{en_name} {surah}:{ayah}",
        "ref_ar": f"{ar_name}: {ar_digits(ayah)}",
        "text_ar": r["arabic_text"],
        "text_en": r["translation"],
        "footnotes_en": r.get("footnotes") or None,
        "translation": f"{meta['title']} (QuranEnc {KEY} v{meta['version']})",
        "origin": "QuranEnc.com — موسوعة القرآن الكريم",
        "url": f"https://quranenc.com/en/browse/{KEY}/{surah}#{ayah}",
        "grading": None,
        "review_status": existing.get("review_status", "pending"),
    })
    t = timing(surah, ayah)
    if t:
        src["recitation"] = {
            "reciter_en": RECITER["name_en"],
            "reciter_ar": RECITER["name_ar"],
            "rewaya": "Hafs 'an 'Asim",
            "url": f"{RECITER['folder']}{surah:03d}.mp3",
            "start_ms": t["start_time"],
            "end_ms": t["end_time"],
            "origin": "mp3quran.net",
        }
    return src


def expand(arg: str):
    m = re.fullmatch(r"quran:(\d+):(\d+)(?:-(\d+))?", arg)
    if not m:
        raise SystemExit(f"bad id {arg}")
    s, a, b = int(m[1]), int(m[2]), int(m[3] or m[2])
    return [(s, x) for x in range(a, b + 1)]


def main():
    meta = translation_meta()
    items = load_sources(OUT)
    by_id = {s["id"]: s for s in items}
    targets = [p for a in sys.argv[1:] for p in expand(a)] or [
        tuple(int(x) for x in s["id"].split(":")[1:]) for s in items
    ]
    changes = []
    for surah, ayah in targets:
        sid = f"quran:{surah}:{ayah}"
        old = by_id.get(sid, {})
        new = fetch(surah, ayah, meta, old)
        if old:
            plain = re.sub(r"\[\d+\]", "", new["text_en"]).strip()
            if plain != old.get("text_en", "").strip():
                changes.append((sid, old.get("text_en"), new["text_en"]))
            if new["text_ar"] != old.get("text_ar"):
                changes.append((sid + " (ar)", old.get("text_ar"), new["text_ar"]))
        by_id[sid] = new
    save_sources(OUT, list(by_id.values()))
    print(f"{len(targets)} ayat from QuranEnc {KEY} v{meta['version']}")
    for sid, a, b in changes:
        print(f"  changed {sid}\n    was: {a}\n    now: {b}")


if __name__ == "__main__":
    main()
