"""Language helpers: Arabic normalization, tokenizing, scripture detection."""

from __future__ import annotations

import re

HARAKAT = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]")
ARABIC_LETTER = re.compile("[ء-يٱ-ۓ]")
TATWEEL = "ـ"
_ALEF = re.compile("[آأإٱ]")
_TOKEN = re.compile(r"[\w؀-ۿ]+", re.UNICODE)

STOP = {
    "the",
    "a",
    "an",
    "of",
    "to",
    "in",
    "and",
    "or",
    "is",
    "are",
    "was",
    "be",
    "for",
    "on",
    "with",
    "that",
    "this",
    "it",
    "as",
    "by",
    "at",
    "from",
    "do",
    "does",
    "did",
    "what",
    "why",
    "how",
    "who",
    "can",
    "i",
    "you",
    "my",
    "we",
    "me",
    "about",
    "if",
    "so",
    "not",
    "no",
    "your",
    "they",
    "their",
    "there",
    "which",
    "when",
    "في",
    "من",
    "على",
    "إلى",
    "الى",
    "عن",
    "ما",
    "ماذا",
    "لماذا",
    "هل",
    "و",
    "أو",
    "او",
    "هذا",
    "هذه",
    "ان",
    "أن",
    "إن",
    "كان",
    "التي",
    "الذي",
    "مع",
    "كيف",
    "لا",
    "لم",
    "ثم",
}


def normalize_ar(text: str) -> str:
    text = HARAKAT.sub("", text).replace(TATWEEL, "")
    text = _ALEF.sub("ا", text)
    return text.replace("ى", "ي").replace("ة", "ه")


def tokens(text: str) -> list[str]:
    out = []
    for t in _TOKEN.findall(normalize_ar(text.lower())):
        if t in STOP or len(t) < 2:
            continue
        if ARABIC_LETTER.match(t) and t.startswith("ال") and len(t) > 4:
            t = t[2:]
        out.append(t)
    return out


def looks_like_scripture(segment: str) -> bool:
    """Densely vowelled Arabic is how Quran and hadith text is typeset; ordinary
    Arabic prose is mostly unvowelled. Used to catch model-written quotations."""
    letters = len(ARABIC_LETTER.findall(segment))
    if letters < 12:
        return False
    return len(HARAKAT.findall(segment)) / letters > 0.35


_SCRIPTURE_SPAN = re.compile("﴿[^﴾]*﴾|[؀-ۿ][؀-ۿ\\s،؛]{12,}[؀-ۿ]")


def strip_scripture(text: str) -> tuple[str, bool]:
    """Remove ornate-bracket quotations and densely vowelled Arabic spans."""
    removed = False

    def repl(m: re.Match) -> str:
        nonlocal removed
        span = m.group(0)
        if span.startswith("\ufd3f") or looks_like_scripture(span):
            removed = True
            return ""
        return span

    cleaned = _SCRIPTURE_SPAN.sub(repl, text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"[\"“”«»]\s*[\"“”«»]", "", cleaned)
    return cleaned.strip(), removed
