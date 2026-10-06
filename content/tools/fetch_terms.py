"""Ingest glossary terms from TerminologyEnc (موسوعة المصطلحات الإسلامية) into sources/dictionary.json.

    python3 content/tools/fetch_terms.py            # the core glossary below
    python3 content/tools/fetch_terms.py 6733 5289  # specific term ids

Definitions are stored verbatim in Arabic and English. They explain terms;
they are reference material, not revealed text.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kb_http import get_json, load_sources, q, save_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources" / "dictionary.json"
API = "https://terminologyenc.com/api/v1"

# The challenge glossary (Islam, Tawhid, worship, prophethood, revelation, Sharia, hadith,
# Sunnah, fatwa, da'wah) plus terms the lessons rely on.
CORE = {
    "islam": 43613, "allah": 16760, "tawhid": 10482, "tawhid-uluhiyyah": 10483, "tawhid-rububiyyah": 10485,
    "ibadah": 15008, "iman": 46045, "shirk": 4062, "ikhlas": 11107, "nubuwwah": 7365, "rasul": 14982,
    "tanzil": 10476, "quran": 53650, "sharia": 47755, "hadith": 71790, "sunnah": 71807, "fatwa": 114,
    "dawah": 72440, "fiqh": 31690, "ijtihad": 75221, "ijma": 570, "ikhtilaf": 11096,
    "taharah": 4064, "wudu": 6733, "ghusl": 172, "tayammum": 5423, "hadath": 11087,
    "salah": 5720, "qiblah": 5289, "niyyah": 6880, "rukn": 6533,
    # Terms behind recurring questions from non-Muslims (scientific package test cases).
    "jihad": 6778, "haram": 779, "tahrim": 8678, "khinzir": 6493, "maazif": 7322,
    "mujtahid": 10455, "tanazu": 5903,
}


def term(tid: int, lang: str) -> dict:
    return get_json(f"{API}/terms/one/?{q({'language': lang, 'id': tid})}")


def build(slug: str, tid: int) -> dict | None:
    en, ar = term(tid, "en"), term(tid, "ar")
    if not en.get("term") or not ar.get("term"):
        print(f"  skip {slug} ({tid}): missing en or ar")
        return None

    def body(t: dict) -> str:
        parts = [t.get("idio_def"), t.get("brief_expl")]
        return "\n\n".join(p.strip() for p in parts if isinstance(p, str) and p.strip())

    return {
        "id": f"ref:terminologyenc:{tid}",
        "kind": "dictionary",
        "slug": slug,
        "ref_en": f"{en['term'].strip()} — Encyclopedia of Islamic Terms",
        "ref_ar": f"{ar['term'].strip()} — موسوعة المصطلحات الإسلامية",
        "term_en": en["term"].strip(),
        "term_ar": ar["term"].strip(),
        "text_ar": body(ar),
        "text_en": body(en),
        "linguistic_en": (en.get("brief_ling_def") or "").strip() or None,
        "linguistic_ar": (ar.get("ling_def") or ar.get("brief_ling_def") or "").strip() or None,
        "translation": "TerminologyEnc approved English translation",
        "origin": "TerminologyEnc.com — موسوعة المصطلحات الإسلامية",
        "url": f"https://terminologyenc.com/en/browse/term/{tid}",
        "grading": None,
        "review_status": "pending",
    }


def main():
    wanted = {f"term-{a}": int(a) for a in sys.argv[1:]} or CORE
    by_id = {s["id"]: s for s in load_sources(OUT)}
    for slug, tid in wanted.items():
        src = build(slug, tid)
        if src:
            by_id[src["id"]] = src
    save_sources(OUT, list(by_id.values()))
    print(f"{len(by_id)} terms in {OUT.name}")


if __name__ == "__main__":
    main()
