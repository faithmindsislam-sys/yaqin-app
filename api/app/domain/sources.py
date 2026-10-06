"""Canonical source fields and citable retrieval passages."""
import hashlib
import json
import re

from app.domain.safety import SafetyFailure

CORE_SOURCE_FIELDS = (
    "id",
    "kind",
    "ref_en",
    "ref_ar",
    "text_ar",
    "text_en",
    "translation",
    "origin",
    "url",
    "grading",
    "review_status",
)


def source_extra(source: dict) -> dict:
    """Kind-specific fields stored in `sources.extra` (jsonb)."""
    return {k: v for k, v in source.items() if k not in CORE_SOURCE_FIELDS}


def source_passages(source: dict) -> list[tuple[str, str, str]]:
    """Retrievable passages for one source as (chunk suffix, lang, text).

    Hadith explanations and benefits are scholarly commentary: their chunks are
    labelled as such and resolve to the hadith id, so the tutor cites the hadith
    while never presenting the commentary as the hadith itself."""
    ref = f"{source.get('ref_en', '')} | {source.get('ref_ar', '')}"
    out: list[tuple[str, str, str]] = []
    for lang in ("en", "ar"):
        head = ref
        if source.get("kind") == "faq" and source.get(f"question_{lang}"):
            head = f"{ref}\n{source[f'question_{lang}']}"
        if source.get("kind") == "dictionary" and source.get(f"term_{lang}"):
            head = f"{ref}\n{source[f'term_{lang}']}"
        if source.get("kind") == "hadith" and source.get(f"title_{lang}"):
            head = f"{ref}\n{source[f'title_{lang}']}"
        text = source.get(f"text_{lang}")
        if text:
            out.append((lang, lang, f"{head}\n{text}"))
        expl = source.get(f"explanation_{lang}")
        benefits = source.get(f"benefits_{lang}") or []
        if expl or benefits:
            label = "Scholarly explanation (not hadith text)" if lang == "en" else "شرح أهل العلم (ليس من نص الحديث)"
            body = "\n".join([expl or "", *benefits]).strip()
            out.append((f"expl-{lang}", lang, f"{ref}\n[{label}]\n{body}"))
    return out


def passage_text(source: dict) -> str:
    return "\n".join(text for _suffix, _lang, text in source_passages(source))


LIBRARY_ID = re.compile(r"^library:[a-f0-9]{24}$")
SOURCE_FIELDS = ("kind", "ref_en", "ref_ar", "text_ar", "text_en", "origin")


def library_sources(items) -> list[dict]:
    """The authenticated agents service owns these request-scoped RAG snapshots.
    Eligibility is access control, not scholarly approval. Malformed evidence fails closed."""
    if not isinstance(items, list) or len(items) > 8:
        raise SafetyFailure()
    out = []
    for s in items:
        fields = (*SOURCE_FIELDS, "resource_id", "document_id", "passage_id", "original_text", "uri")
        if (not isinstance(s, dict) or not isinstance(s.get("id"), str) or not LIBRARY_ID.fullmatch(s["id"])
                or s.get("kind") != "library" or any(not isinstance(s.get(k), str) for k in fields)
                or any(not s[k].strip() for k in ("resource_id", "document_id", "passage_id", "original_text", "uri"))
                or s.get("review_status") != "unreviewed" or s.get("eligibility") != "rag_access_eligible"):
            raise SafetyFailure()
        # Accept the previous service during rollout; new IDs survive RAG rank changes.
        identities = ([s["resource_id"], s["document_id"], s["uri"], s["original_text"]],
                      [s["resource_id"], s["document_id"], s["passage_id"]])
        if s["id"] not in {"library:" + hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest()[:24]
                           for identity in identities}:
            raise SafetyFailure()
        original = re.sub(r"\s+", " ", re.sub(r"\[page \d+\]\s*", " ", s["original_text"]).replace("\u0640", "")).strip()
        if (s["text_en"] or s["text_ar"]) != original or bool(s["text_en"]) == bool(s["text_ar"]):
            raise SafetyFailure()
        out.append({**s, "translation": None, "grading": None, "review_status": "unreviewed"})
    if len({s["id"] for s in out}) != len(out):
        raise SafetyFailure()
    return out
