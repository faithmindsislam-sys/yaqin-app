"""Temporary bilingual practice; never persisted as course content or progress."""
import re
import secrets

from app.domain.support import SupportFailure, text_units

PROMPT = """Generate temporary AI practice for Mariam's current course, not a new syllabus.
Choose a concept taught anywhere in the WHOLE course (any page, not only current_page), preferring a concept
the avoided questions have not covered yet, so repeated requests move across the course. Do not build on the
previous question or the chat. Build the question from the course content, the provided SOURCES and
well-established mainstream Islamic knowledge. Stay within the course subject,
difficulty and selected journey: Explore assumes no Islamic background; First Steps gently supports
new Muslims; Deepen avoids repeating familiar basics. Test understanding, never religious sincerity.
Generate exactly 1 fresh question, avoiding earlier questions in history and supplied
course and session questions. It needs three distinct plausible parallel options, exactly one defensible
correct answer (zero-based index), a short gentle explanation, and the id of the provided source it relies
on, or "" when it relies on the course content or general knowledge.
Avoid copy-wording, trivial questions, answer-length clues and unsupported facts or rulings.
Preserve disagreement and qualifications; never mark a disputed ruling as uniquely correct.
Use natural English AND Arabic with equivalent meaning and the SAME correct option index.
Do not quote, invent, or translate scripture; explain concepts in your own educational prose.
An optional hint must help thinking without naming, quoting or paraphrasing the correct option;
use empty strings in both languages when no useful hint is possible. Vary correct option positions.
Always return one question with a clear, uncontroversial correct answer. Never use em dashes.
Questions are AI-generated, temporary, and not human/scholarly reviewed or infallible.
Return only structured practice; if the schema also has answer, makes_religious_claim and
follow_ups, set them to "", true and [] respectively. Never reveal answers in chat prose.
"""

BI = {"type": "object", "additionalProperties": False, "required": ["en", "ar"],
      "properties": {lang: {"type": "string", "maxLength": 800} for lang in ("en", "ar")}}
PROPS = {"practice": {"type": "array", "maxItems": 1, "items": {
    "type": "object", "additionalProperties": False,
    "required": ["question", "options", "answer", "hint", "explanation", "source"],
    "properties": {"question": BI, "options": {"type": "array", "minItems": 3, "maxItems": 3, "items": BI},
                   "answer": {"type": "integer", "minimum": 0, "maximum": 2}, "hint": BI,
                   "explanation": BI, "source": {"type": "string"}}}}}


def requested(question):
    # ponytail: only outage routing uses this small matcher; the classifier handles natural phrasing.
    return bool(re.search(r"\b(quiz me|test my knowledge|(?:more|practice) questions)\b|"
                          r"اختبر\s*(?:ني|معلوماتي)|اسئلة|أسئلة", question, re.I))


def _valid(item, sources, excluded, seen):
    if (not isinstance(item, dict) or not {"question", "options", "answer", "explanation"} <= set(item)
            or type(item["answer"]) is not int or not 0 <= item["answer"] < 3
            or not isinstance(item["options"], list) or len(item["options"]) != 3):
        return None
    item = {**item, "hint": item.get("hint") or {"en": "", "ar": ""}}
    # A source the model was not given is dropped, not fatal.
    if not isinstance(item.get("source"), str) or item["source"] not in sources:
        item["source"] = ""
    for field, value in [("question", item["question"]), ("explanation", item["explanation"]),
                         ("hint", item["hint"]), *[("option", v) for v in item["options"]]]:
        if (not isinstance(value, dict) or set(value) != {"en", "ar"}
                or any(not isinstance(v, str) or len(v) > 800 or (field != "hint" and not v.strip())
                       or any(marker in v for marker in ("[[", "]]", "\ufd3f", "\ufd3e")) for v in value.values())):
            return None
    for lang in ("en", "ar"):
        question = item["question"][lang].strip().casefold()
        options = [v[lang].strip().casefold() for v in item["options"]]
        if question in seen[lang] or question in excluded or len(set(options)) != 3:
            return None
        hint = item["hint"][lang].casefold()
        if hint and options[item["answer"]] in hint:
            item["hint"] = {"en": "", "ar": ""}
    for lang in ("en", "ar"):
        seen[lang].add(item["question"][lang].strip().casefold())
    return {k: item[k] for k in ("question", "options", "answer", "hint", "explanation", "source")}


def validate(items, sources, avoid=()):
    """Keep the usable questions; drop the rest. Returns [] when none is usable."""
    if not isinstance(items, list):
        return []
    seen = {"en": set(), "ar": set()}
    excluded = {q.strip().casefold() for q in avoid}
    out = []
    for item in items[:3]:
        item = _valid(item, sources, excluded, seen)
        if item is None:
            continue
        # Random position for the correct option, same in both languages.
        correct = item["options"][item["answer"]]
        options = [v for i, v in enumerate(item["options"]) if i != item["answer"]]
        at = secrets.randbelow(3)
        options.insert(at, correct)
        out.append({**item, "options": options, "answer": at})
    return out


def units(items):
    out = text_units({"practice": items})
    for n, item in enumerate(items):
        for lang in ("en", "ar"):
            # The citation requires a supported verdict, never non_claim for the designated answer.
            out[f"practice.{n}.correct.{lang}"] = (
                f"Question: {item['question'][lang]}\nDesignated correct answer: "
                f"{item['options'][item['answer']][lang]} [[{item['source']}]]")
    return out
