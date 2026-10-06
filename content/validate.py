"""Validate Yaqin content against docs/CONTRACT.md. Stdlib only.

    python3 content/validate.py            # check, exit 1 on any error
    python3 content/validate.py --fix      # also (re)write card audio paths

Checks: course shape, subject and multiple-track membership, every referenced source exists,
every bilingual field has non-empty en+ar, quote cards carry no body, and no
card prose reproduces 4+ consecutive words of a cited Quran/hadith text
(scripture must reach the learner verbatim from `sources`, never retyped).
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LANGS = ("en", "ar")
SUBJECTS = {s["id"] for s in json.loads((ROOT / "subjects.json").read_text())}
TRACKS = {"explore", "first-steps", "deepen"}
CARD_KINDS = {"concept", "quote", "practice", "check"}
LABELS = {"obligatory", "recommended", "suggestion"}
VISUALS = {"steps", "order", "compass", "book", "none"}
LEVELS = {1, 2, 3, 4, "foundation", "deeper"}
STATUSES = {"draft", "in_review", "published", "archived"}
SOURCE_KINDS = {"quran", "hadith", "tafsir", "fiqh", "aqidah", "faq", "dictionary"}
NGRAM = {"ar": 4, "en": 6}
# Formulaic phrases that are not scripture: honorifics and narration formulas.
FORMULAS_AR = ["صلي الله عليه وسلم", "رضي الله عنه", "رضي الله عنها", "رضي الله عنهم", "عليه السلام",
               "قال رسول الله", "رسول الله", "النبي", "بن عفان"]
FORMULAS_EN = [r"\(ﷺ\)", "ﷺ"]

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def bilingual(where, value, required=True):
    if value is None:
        if required:
            err(where, "missing bilingual field")
        return
    if not isinstance(value, dict):
        err(where, "bilingual field must be an object {en, ar}")
        return
    for lang in LANGS:
        v = value.get(lang)
        if not isinstance(v, str) or not v.strip():
            err(where, f"missing or empty '{lang}'")
    if isinstance(value.get("ar"), str) and not re.search(r"[؀-ۿ]", value["ar"]):
        err(where, "'ar' contains no Arabic script")


def normalize(text, lang):
    if lang == "ar":
        text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
        text = re.sub("[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]", "", text)
        text = re.sub("[\u0622\u0623\u0625\u0671]", "\u0627", text).replace("ى", "ي").replace("ة", "ه")
        for f in FORMULAS_AR:
            text = text.replace(f, " ")
        words = re.findall(r"[ء-ي]+", text)
    else:
        for f in FORMULAS_EN:
            text = re.sub(f, " ", text)
        text = re.sub(r"\[[^\]]*\]", " ", text)
        words = re.findall(r"[a-z']+", text.lower())
    return words


def ngrams(words, n):
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


ID_PATTERNS = {
    "quran": r"quran:\d+:\d+",
    "hadith": r"hadith:(bukhari|muslim):\d+[a-z]?|hadith:henc:\d+",
    "faq": r"ref:icadb:\d+",
    "dictionary": r"ref:terminologyenc:\d+",
}


def check_source_fields(where, s):
    """Shape of the optional knowledge-base fields (see docs/CONTRACT.md)."""
    pattern = ID_PATTERNS.get(s.get("kind"))
    if pattern and not re.fullmatch(pattern, s.get("id", "")):
        err(where, f"id does not match {s.get('kind')} pattern")
    if s.get("kind") == "hadith" and not s.get("grading"):
        err(where, "hadith without a grading")
    if s.get("kind") == "hadith" and s["id"].startswith("hadith:henc:"):
        policy = {"provider": "hadeethenc", "canonical_for": "hadith", "source_of_truth": True, "priority": "primary"}
        for key, value in policy.items():
            if s.get(key) != value:
                err(where, f"canonical HadeethEnc source requires {key}={value!r}")
        for key in ("explanation_en", "explanation_ar"):
            if s.get(key) is not None and not isinstance(s[key], str):
                err(where, f"'{key}' must be a string")
        for key in ("benefits_en", "benefits_ar"):
            if not isinstance(s.get(key, []), list):
                err(where, f"'{key}' must be a list")
    rec = s.get("recitation")
    if rec is not None:
        if s.get("kind") != "quran":
            err(where, "recitation only belongs on Quran sources")
        elif not (isinstance(rec.get("url"), str) and rec["url"].startswith("https://")):
            err(where, "recitation.url must be an https URL")
        elif ("start_ms" in rec) != ("end_ms" in rec) or (rec.get("start_ms", 0) or 0) > (rec.get("end_ms", 0) or 0):
            err(where, "recitation start_ms/end_ms inconsistent")
    for other in s.get("see_also", []) or []:
        if not isinstance(other, str):
            err(where, "see_also must list source ids")
    if s.get("kind") == "faq" and not s.get("question_ar"):
        err(where, "faq without question_ar")
    if s.get("kind") == "dictionary" and not (s.get("term_en") and s.get("term_ar")):
        err(where, "dictionary entry without term_en/term_ar")


def check_see_also(sources):
    for sid, s in sources.items():
        for other in s.get("see_also", []) or []:
            if other not in sources:
                err(f"sources:{sid}", f"see_also references unknown {other}")


def load_sources():
    sources = {}
    for f in sorted((ROOT / "sources").glob("*.json")):
        for s in json.loads(f.read_text(encoding="utf-8")):
            where = f"sources/{f.name}:{s.get('id')}"
            if s.get("id") in sources:
                err(where, "duplicate source id")
            arabic_only = s.get("languages") == ["ar"]
            for key in ("id", "kind", "ref_en", "ref_ar", "text_ar", "text_en", "origin", "url", "review_status"):
                if key == "text_en" and arabic_only:
                    if s.get(key) != "":
                        err(where, "Arabic-only source must have text_en == ''")
                    continue
                if not s.get(key):
                    err(where, f"missing '{key}'")
            if s.get("kind") not in SOURCE_KINDS:
                err(where, f"bad kind {s.get('kind')!r}")
            if s.get("review_status") not in ("pending", "approved"):
                err(where, "review_status must be pending|approved")
            check_source_fields(where, s)
            sources[s["id"]] = s
    return sources


def check_ref(where, sid, sources, allow_null=False):
    if sid is None:
        if not allow_null:
            err(where, "source is required")
        return
    if sid not in sources:
        err(where, f"unknown source id {sid!r}")


def check_overlap(where, text, lang, cited, sources):
    n = NGRAM[lang]
    words = normalize(text, lang)
    if len(words) < n:
        return
    mine = ngrams(words, n)
    for sid in cited:
        s = sources.get(sid)
        if not s or s["kind"] not in ("quran", "hadith"):
            continue
        hit = mine & ngrams(normalize(s[f"text_{lang}"], lang), n)
        if hit:
            err(where, f"reproduces scripture from {sid} ({lang}): '{' '.join(sorted(hit)[0])}…' — paraphrase, or move it to a quote card")


def check_lesson(path, sources, fix):
    data = json.loads(path.read_text(encoding="utf-8"))
    lid = data.get("id")
    where = f"lessons/{path.name}"
    if lid != path.stem:
        err(where, f"id {lid!r} must match file name")
    members = data.get("tracks")
    if not isinstance(members, list) or not members or any(track not in TRACKS for track in members) or len(members) != len(set(members)):
        err(where, "tracks must list one or more distinct known tracks")
    if data.get("subject") not in SUBJECTS:
        err(where, "unknown subject")
    if any(key in data for key in ("track", "module", "tags")):
        err(where, "course classification uses subject, level and tracks; no track/module/tags fields")
    if data.get("level") not in LEVELS:
        err(where, f"bad level {data.get('level')!r}")
    if data.get("status") not in STATUSES:
        err(where, f"bad status {data.get('status')!r}")
    if not isinstance(data.get("minutes"), int) or data["minutes"] <= 0:
        err(where, "minutes must be a positive integer")
    if data.get("cover") is not None and not str(data["cover"]).startswith("/img/"):
        err(where, "cover must be an /img/ path")
    bilingual(f"{where}.title", data.get("title"))
    bilingual(f"{where}.summary", data.get("summary"))

    cards = data.get("cards") or []
    if not cards:
        err(where, "no cards")
    seen = set()
    for card in cards:
        cw = f"{where}.cards[{card.get('id')}]"
        if card.get("id") in seen:
            err(cw, "duplicate card id")
        seen.add(card.get("id"))
        kind = card.get("kind")
        if kind not in CARD_KINDS:
            err(cw, f"bad kind {kind!r}")
        bilingual(f"{cw}.title", card.get("title"))
        bilingual(f"{cw}.takeaway", card.get("takeaway"))
        cited = card.get("sources") or []
        if not cited:
            err(cw, "card cites no sources")
        for sid in cited:
            check_ref(cw, sid, sources)
        if kind == "quote":
            if "body" in card:
                err(cw, "quote cards must not have a body: the verbatim source is the body")
            if cited and sources.get(cited[0], {}).get("kind") not in ("quran", "hadith"):
                err(cw, "a quote card's first source must be Quran or hadith")
        else:
            bilingual(f"{cw}.body", card.get("body"))
        if card.get("label") is not None and card["label"] not in LABELS:
            err(cw, f"bad label {card['label']!r}")
        if card.get("visual") is not None and card["visual"] not in VISUALS:
            err(cw, f"bad visual {card['visual']!r}")
        for field in ("body", "takeaway"):
            for lang in LANGS:
                text = (card.get(field) or {}).get(lang)
                if text:
                    check_overlap(f"{cw}.{field}.{lang}", text, lang, cited, sources)
        expected_audio = {lang: f"/audio/{lid}/{card.get('id')}.{lang}.mp3" for lang in LANGS}
        if fix:
            card["audio"] = expected_audio
        elif card.get("audio") is not None and card["audio"] != expected_audio:
            err(cw, "audio paths not in the contract pattern (run with --fix)")

    eb = data.get("explain_back")
    if eb is not None:
        bilingual(f"{where}.explain_back.prompt", eb.get("prompt"))
        ideas = eb.get("key_ideas") or []
        if len(ideas) < 2:
            err(where, "explain_back needs at least 2 key ideas")
        for k in ideas:
            kw = f"{where}.explain_back[{k.get('id')}]"
            bilingual(kw, {"en": k.get("en"), "ar": k.get("ar")})
            check_ref(kw, k.get("source"), sources, allow_null=True)

    quiz = data.get("quiz") or []
    if not quiz:
        err(where, "no quiz")
    for q in quiz:
        qw = f"{where}.quiz[{q.get('id')}]"
        bilingual(f"{qw}.question", q.get("question"))
        bilingual(f"{qw}.explanation", q.get("explanation"))
        opts = q.get("options") or []
        if len(opts) < 2:
            err(qw, "needs at least 2 options")
        for i, o in enumerate(opts):
            bilingual(f"{qw}.options[{i}]", o)
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(opts):
            err(qw, "answer index out of range")
        check_ref(qw, q.get("source"), sources, allow_null=True)

    if fix:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def check_tracks(lessons):
    tracks = json.loads((ROOT / "tracks.json").read_text(encoding="utf-8"))
    listed = set()
    for t in tracks:
        tw = f"tracks.json[{t.get('id')}]"
        if t.get("id") not in TRACKS:
            err(tw, "unknown track id")
        for f in ("title", "tagline", "audience"):
            bilingual(f"{tw}.{f}", t.get(f))
        seen = set()
        for m in t.get("modules") or []:
            bilingual(f"{tw}.{m.get('id')}.title", m.get("title"))
            for lid in m.get("lessons") or []:
                if lid in seen:
                    err(tw, f"course {lid} is ordered more than once")
                seen.add(lid)
                if lid not in lessons:
                    err(tw, f"journey lists unknown course {lid!r}")
                    continue
                listed.add((t["id"], lid))
                if t["id"] not in lessons[lid].get("tracks", []):
                    err(tw, f"course {lid} does not belong to this track")
    for lid, course in lessons.items():
        for track in course.get("tracks", []):
            if (track, lid) not in listed:
                err("tracks.json", f"course {lid} has no ordering position in track {track}")


def check_eval(sources):
    path = ROOT / "eval" / "safety_cases.json"
    if not path.exists():
        err("eval/safety_cases.json", "missing")
        return
    for c in json.loads(path.read_text(encoding="utf-8")):
        cw = f"eval[{c.get('id')}]"
        bilingual(f"{cw}.question", c.get("question"))
        if c.get("expected_tier") not in ("A", "B", "C", "D", "OUT", "NONE"):
            err(cw, f"bad expected_tier {c.get('expected_tier')!r}")
        if not c.get("expected_behaviour"):
            err(cw, "missing expected_behaviour")


def main():
    fix = "--fix" in sys.argv
    sources = load_sources()
    check_see_also(sources)
    lessons = {}
    for path in sorted((ROOT / "lessons").glob("*.json")):
        data = check_lesson(path, sources, fix)
        lessons[data["id"]] = data
    check_tracks(lessons)
    check_eval(sources)
    cards = sum(len(l["cards"]) for l in lessons.values())
    if errors:
        print("\n".join(errors))
        print(f"\nFAIL: {len(errors)} problem(s) across {len(lessons)} courses")
        sys.exit(1)
    print(f"OK: {len(lessons)} courses, {cards} pages, {len(sources)} sources")


if __name__ == "__main__":
    main()
