"""Ingest approved Q&A cards from the Central Islamic Content DB (ICADB) into sources/faq.json.

    python3 content/tools/fetch_icadb_faq.py

Two encyclopedias of جمعية خدمة المحتوى الإسلامي باللغات:
  110 موسوعة الأسئلة والأجوبة لغير المسلمين  (Q&A for non-Muslims)
  102 موسوعة الأسئلة والأجوبة للمسلمين       (Q&A for Muslims)
Only approved versions are read. As of 2026-10 these cards are published in
Arabic only, so text_en is empty; the answers are stored verbatim.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kb_http import get_json, load_sources, q, save_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources" / "faq.json"
API = "https://icadb.com/api/encyclopedias"
ENC_NAME = {110: ("Q&A for non-Muslims", "موسوعة الأسئلة والأجوبة لغير المسلمين"),
            102: ("Q&A for Muslims", "موسوعة الأسئلة والأجوبة للمسلمين")}

# Cards chosen for the three tracks: introducing Islam, common objections, and basics.
WANTED = {
    110: [36066, 36067, 36068, 36069, 36072, 36077, 36078, 36082, 36083, 36084, 36087, 36088, 36090,
          36094, 36095, 36097, 36098, 36099, 36102, 36109, 36110, 36112, 36113, 36127, 36130, 36180,
          36181, 36186, 36192, 36193, 36239],
    102: [26014, 26020, 26055, 26057, 26058, 26059],
}


def all_cards(enc: int) -> dict[int, dict]:
    cards, page = {}, 1
    while True:
        d = get_json(f"{API}/{enc}/cards/latest/?{q({'page': page, 'page_size': 100, 'approved_only': 'true'})}")
        for c in d.get("cards", []):
            cards[c["external_id"]] = c
        if page >= int(d.get("total_pages", 1)):
            return cards
        page += 1


def field(card: dict, name: str) -> str:
    texts = [s["text"] for s in sorted(card.get("sentences", []), key=lambda s: s.get("field_order", 0)) if s.get("field_name") == name]
    return "\n".join(t.strip() for t in texts if t and t.strip())


def main():
    by_id = {s["id"]: s for s in load_sources(OUT)}
    for enc, ids in WANTED.items():
        cards = all_cards(enc)
        en_name, ar_name = ENC_NAME[enc]
        for cid in ids:
            c = cards.get(cid)
            if not c:
                print(f"  missing card {enc}/{cid}")
                continue
            v = c.get("latest_version") or {}
            if not v.get("is_approved"):
                print(f"  skip unapproved {cid}")
                continue
            question = field(c, "السؤال") or field(c, "العنوان") or c["name"]
            answer = field(c, "الجواب")
            if not answer:
                print(f"  skip {cid}: no answer text")
                continue
            sid = f"ref:icadb:{cid}"
            by_id[sid] = {
                "id": sid,
                "kind": "faq",
                "ref_en": f"{en_name} · card {v.get('unified_id') or cid}",
                "ref_ar": f"{ar_name} · بطاقة {v.get('unified_id') or cid}",
                "question_ar": question,
                "question_en": None,
                "text_ar": answer,
                "text_en": "",
                "source_note_ar": field(c, "المصدر") or None,
                "languages": ["ar"],
                "translation": None,
                "origin": "ICADB — القاعدة المركزية للمحتوى الإسلامي باللغات (جمعية خدمة المحتوى الإسلامي باللغات)",
                "url": f"https://icadb.com/api/encyclopedias/cards/{cid}/versions/",
                "version": v.get("version_str"),
                "grading": None,
                "review_status": "pending",
            }
    save_sources(OUT, list(by_id.values()))
    print(f"{len(by_id)} Q&A cards in {OUT.name}")


if __name__ == "__main__":
    main()
