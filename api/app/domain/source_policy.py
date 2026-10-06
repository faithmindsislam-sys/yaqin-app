"""Published translation views; raw records and scholarly approval stay separate."""

import re
from urllib.parse import urlsplit

TRANSLATION_RULES = """TRANSLATION AUTHORITY
Exact Quran/hadith wording and English translations come only from the stored source renderer,
never from your own translation. translation_status_en=published identifies an allowed publisher,
not scholarly approval; review_status remains a separate gate. Keep the exact translator/edition,
reference, grading and qualifications. Missing or unsupported English must stay missing: explain
from supported Arabic when possible, but do not present your explanation as a scripture translation.
Prefer supplied primary HadeethEnc records for hadith; see_also links are related variants, never
permission to transfer text, identity or approval between records. Commentary is not hadith wording.
"""

# Preferred teaching labels from content/kb/kb.pdf, p. 7. These are not factual evidence.
TERMINOLOGY_RULES = """PREFERRED TEACHING TERMINOLOGY
For generated prose use these labels when relevant: الإسلام / Islam; التوحيد / Tawhid
(Oneness of God); العبادة / Worship; النبوة / Prophethood; الوحي / Revelation;
الشريعة / Sharia (Islamic law and guidance); الحديث / Hadith; السنة / Sunnah;
الفتوى / Fatwa; الدعوة / Da‘wah (Invitation to Islam).
These are teaching labels, not evidence for definitions. Use relevant supplied, approved dictionary
meaning as terminology authority; never promote pending dictionary records. Other explanations
remain bound to supplied evidence and its original review qualifiers. Missing essential meaning
requires abstention. Prefer dictionary meaning over automatic word-for-word translation; do not
infer equivalence from a slug alone. Compose natural prose,
gloss unfamiliar terms briefly for beginners, and avoid redundant basic glosses on Deepen.
Never replace words inside exact quotations or broaden/narrow a source's meaning to fit a label.
"""


def source_view(source: dict) -> dict:
    """Withhold unsupported scripture English without altering stored originals or IDs."""
    view = dict(source)
    kind = source.get("kind")
    if kind not in {"quran", "hadith"}:
        return view
    # Scripture uses designated canonical fields; only library passages need this fallback.
    view.pop("original_text", None)
    published = False
    try:
        raw_url = source.get("url") or ""
        url = urlsplit(raw_url)
        label = source.get("translation") or ""
        sid = source.get("id") or ""
        safe_url = (url.scheme == "https" and url.username is None and url.password is None
                    and url.port in (None, 443) and "?" not in raw_url and "\\" not in raw_url
                    and not re.search(r"[\s\x00-\x1f\x7f]", raw_url))
        if safe_url and kind == "quran":
            verse = re.fullmatch(r"quran:([1-9][0-9]*):([1-9][0-9]*)", sid)
            if verse and url.hostname == "quranenc.com" and "QuranEnc" in label:
                path = re.fullmatch(r"/en/browse/[a-z0-9_]+/([1-9][0-9]*)", url.path)
                published = bool(path and path[1] == verse[1] and url.fragment == verse[2])
            elif verse and url.hostname == "quran.com" and label == "Saheeh International":
                published = url.path == f"/{verse[1]}/{verse[2]}" and "#" not in raw_url
            elif (verse and url.hostname == "quranpedia.net" and (label, source.get("origin")) in {
                    ("Sahih International - English translation (Quranpedia.net)", "Quranpedia.net"),
                    ("Sahih International (Quranpedia.net)", "Quranpedia.net / King Fahd Glorious Quran Printing Complex")}):
                # The catalog stores a chapter-level publisher URL, not a per-verse URL.
                published = url.path == f"/surah/1/{verse[1]}/book/13638" and "#" not in raw_url
        elif safe_url and kind == "hadith" and url.hostname == "hadeethenc.com":
            path = re.fullmatch(r"/en/browse/hadith/([1-9][0-9]*)", url.path)
            published = bool(path and sid == f"hadith:henc:{path[1]}" and "#" not in raw_url
                             and label == "HadeethEnc published English translation"
                             and source.get("provider", "hadeethenc") == "hadeethenc")
    except (TypeError, ValueError):
        pass
    english = source.get("text_en")
    status = "unavailable" if not isinstance(english, str) or not english.strip() else "published" if published else "unsupported_provider"
    view["translation_status_en"] = status
    if status != "published":
        view["text_en"] = ""
    return view


def source_views(sources: dict) -> dict:
    return {sid: source_view(source) for sid, source in sources.items()}
