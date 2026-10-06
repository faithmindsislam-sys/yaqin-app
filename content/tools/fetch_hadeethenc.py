"""Project saved canonical HadeethEnc details into the app's curated sources.

First run resources/tools/acquire_hadeethenc.py for the complete corpus.
Run this script for existing curated IDs, or --ids 2962 to add specific IDs.
No network requests, embeddings, generated translations or inferred grades.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kb_http import load_sources, save_sources

PROJECT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT / "resources/tools"))
from acquire_hadeethenc import POLICY, SCHEMA, sha, check_detail

OUT = PROJECT / "YAQIN/content/sources/hadith.json"
CORPUS = PROJECT / "resources/hadeethenc"
REF_PATTERNS = [(r"صحيح البخاري[^()]*\([^)]*\)\s*\((\d+)\)", "bukhari"), (r"صحيح مسلم[^()]*\([^)]*\)\s*\((\d+)\)", "muslim")]


def read_detail(hid, lang):
    p = CORPUS / "details" / lang / (hid + ".json")
    if not p.exists():
        raise ValueError(f"Acquire {lang}/{hid} first with resources/tools/acquire_hadeethenc.py")
    saved = json.loads(p.read_text("utf-8"))
    meta = saved["provenance"]
    raw = (CORPUS / meta["raw_path"]).read_bytes()
    if sha(raw) != meta["sha256"]:
        raise ValueError(f"Raw checksum mismatch for {lang}/{hid}")
    if saved["status"] != "acquired":
        return {}, meta, saved["status"]
    d = saved["provider_fields"]
    original = json.loads(raw)
    original = next(r for r in original if str(r["id"]) == hid) if isinstance(original, list) else original
    if original != d:
        raise ValueError(f"Detail differs from raw response: {lang}/{hid}")
    check_detail(d, hid, lang)
    return d, meta, "acquired"


def build(hid):
    ar, ar_meta, ar_status = read_detail(hid, "ar")
    en, en_meta, en_status = read_detail(hid, "en")
    if not ar.get("hadeeth"):
        raise ValueError(f"No Arabic hadith text: {hid}")
    src = dict(**POLICY, id=f"hadith:henc:{hid}", provider_id=hid, kind="hadith", schema_version=SCHEMA,
               ref_en=f"HadeethEnc {hid} · {en.get('attribution') or ar.get('attribution') or ''}",
               ref_ar=f"موسوعة الأحاديث {hid} · {ar.get('attribution') or ''}",
               text_ar=ar["hadeeth"], text_en=en.get("hadeeth", ""), title_ar=ar.get("title"), title_en=en.get("title"),
               translation="HadeethEnc published English translation" if en.get("hadeeth") else None,
               origin="HadeethEnc.com — موسوعة الأحاديث النبوية",
               url=f"https://hadeethenc.com/{'en' if en.get('hadeeth') else 'ar'}/browse/hadith/{hid}",
               grading=" · ".join(d["grade"] for d in (en, ar) if d.get("grade")) or None,
               grading_ar=ar.get("grade"), grading_en=en.get("grade"),
               attribution_ar=ar.get("attribution"), attribution_en=en.get("attribution"),
               explanation_ar=ar.get("explanation"), explanation_en=en.get("explanation"),
               benefits_ar=ar.get("hints", []), benefits_en=en.get("hints", []),
               reference_ar=ar.get("reference"), reference_en=en.get("reference"),
               vocabulary_ar=ar.get("words_meanings"), vocabulary_en=en.get("words_meanings"),
               narrator_intro_ar=ar.get("hadeeth_intro"), narrator_intro_en=en.get("hadeeth_intro"),
               categories=sorted(set(ar.get("categories", [])) | set(en.get("categories", []))),
               languages=[lang for lang, d in (("ar", ar), ("en", en)) if d.get("hadeeth")],
               language_status=dict(ar=ar_status, en=en_status),
               provenance=dict(ar=ar_meta, en=en_meta), review_status="pending")
    refs = []
    for pattern, collection in REF_PATTERNS:
        refs.extend(f"hadith:{collection}:{m.group(1)}" for m in re.finditer(pattern, ar.get("reference") or ""))
    src["collection_refs"] = sorted(set(refs))
    return src


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", nargs="+")
    args = parser.parse_args()
    items = load_sources(OUT)
    by_id = {s["id"]: s for s in items}
    ids = args.ids or [s["id"].rsplit(":", 1)[1] for s in items if s["id"].startswith("hadith:henc:")]
    for hid in ids:
        if not hid.isdecimal():
            raise ValueError(f"Invalid provider ID: {hid}")
        by_id[f"hadith:henc:{hid}"] = build(hid)
    for src in by_id.values():
        if not src["id"].startswith("hadith:henc:"):
            src.update(provider="fawazahmed0/hadith-api", source_of_truth=False, priority="secondary")
    for src in list(by_id.values()):
        for other in src.get("collection_refs", []):
            if other in by_id:
                src["see_also"] = sorted(set(src.get("see_also", [])) | {other})
                by_id[other]["see_also"] = sorted(set(by_id[other].get("see_also", [])) | {src["id"]})
    save_sources(OUT, list(by_id.values()))
    print(f"Projected {len(ids)} canonical HadeethEnc sources; secondary collection IDs retained")


if __name__ == "__main__":
    main()
