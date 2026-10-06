"""Small server-owned navigation context; course prose is never source evidence."""

import json
import re

from app.domain.errors import ApiError
from app.domain.richtext import clean

MAX_CONTEXT_BYTES = 24000
SOURCE_ID = re.compile(r"^[a-z]+:[^\s\]]{1,120}$")
PAGE_ACTIONS = {
    "explain this page simply", "what are the key points of this page?",
    "explain a word from this page", "test my knowledge",
    "اشرح هذه الصفحة ببساطة", "ما أهم نقاط هذه الصفحة؟",
    "اشرح لي كلمة من هذه الصفحة", "اختبر معلوماتي",
}


def page_action(req):
    # Only explicit page actions are narrow; arbitrary questions may need the whole course.
    # Practice is course-wide: it draws on every page, not only the current one.
    return bool(req.card_id and not req.practice and req.question.strip().casefold() in PAGE_ACTIONS)


def text(value, lang):
    if isinstance(value, dict):
        return value.get(lang) or value.get("en") or value.get("ar") or ""
    return value if isinstance(value, str) else ""


def displayed_body(card, lang):
    # Match CardBody's preference for localized formatted content, including legacy snapshots.
    if card.get("html") is not None:
        return clean(text(card["html"], lang))[1]
    return text(card.get("body"), lang)


def _size(value):
    return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))


async def learning_context(repository, req, lesson, user_id=None):
    if req.card_id and not lesson:
        raise ApiError(400, "bad_request", "A current page requires a course.")
    page = next((p for p in lesson.get("cards", []) if p["id"] == req.card_id), None) if lesson else None
    if req.card_id and page is None:
        raise ApiError(400, "bad_request", "This page does not belong to the current course.")
    if not lesson:
        return None

    truncated = []
    truncated_count = 0
    def mark(field):
        nonlocal truncated_count
        truncated_count += 1
        if len(truncated) < 16 and _size([*truncated, field]) <= 1000:
            truncated.append(field)
    def clip(value, field, limit):
        value = text(value, req.lang)
        if _size(value) > limit:
            mark(field)
            low, high = 0, len(value)
            while low < high:
                middle = (low + high + 1) // 2
                if _size(value[:middle]) <= limit:
                    low = middle
                else:
                    high = middle - 1
            return value[:low]
        return value

    def refs(card, field):
        ids = [sid for sid in card.get("sources", []) if isinstance(sid, str) and SOURCE_ID.fullmatch(sid)]
        kept = []
        for sid in ids[:12]:
            if _size([*kept, sid]) > 2000:
                break
            kept.append(sid)
        if len(kept) < len(ids):
            mark(field)
        return kept

    # Current page comes first. Oversized content has visible coverage markers, never a silent cut.
    current = None if page is None else {
        "id": page["id"], "title": clip(page.get("title"), "current_page.title", 600),
        "body": clip(displayed_body(page, req.lang), "current_page.body", 10000),
        "takeaway": clip(page.get("takeaway"), "current_page.takeaway", 2000),
        "sources": refs(page, "current_page.sources"),
    }
    context = {"version": "1", "lang": req.lang, "journey_id": req.track,
               "current_page": current,
               "course": {"id": lesson["id"], "title": clip(lesson.get("title"), "course.title", 600),
                          "summary": clip(lesson.get("summary"), "course.summary", 1200), "pages": []},
               "module": None, "completed_courses": [],
               "coverage": {"page_count": len(lesson.get("cards", [])), "omitted_pages": 0,
                            "omitted_module_courses": 0, "omitted_completed_courses": 0,
                            "truncated_fields": truncated}}

    def append_bounded(items, value, *, reserve=2500):
        items.append(value)
        if _size(context) > MAX_CONTEXT_BYTES - reserve:
            items.pop()
            return False
        return True

    # Reserve space for module/completion summaries before adding optional older-page prose.
    pages = []
    for card in lesson.get("cards", []):
        outline = {"id": card["id"], "title": clip(card.get("title"), f"pages.{card['id']}.title", 200)}
        if append_bounded(context["course"]["pages"], outline, reserve=6000):
            pages.append((card, outline))
        else:
            context["coverage"]["omitted_pages"] += 1

    if page_action(req):
        # Keep navigation titles, but do not load prior learning for a current-page action.
        for card, _ in pages:
            if card is not page:
                mark(f"pages.{card['id']}.prose")
        mark("module")
        mark("completed_courses")
        context["coverage"]["truncated_field_count"] = truncated_count
        assert _size(context) <= MAX_CONTEXT_BYTES
        return context

    journeys = await repository.list_tracks() if req.track else []
    journey = next((t for t in journeys if t["id"] == req.track), None)
    module = next((m for m in journey.get("modules", [])
                   if any(c["id"] == lesson["id"] for c in m.get("lessons", []))), None) if journey else None
    if module:
        context["module"] = {"id": module["id"], "title": clip(module.get("title"), "module.title", 600), "courses": []}
        context["coverage"]["omitted_module_courses"] = max(0, len(module.get("lessons", [])) - 100)
    completed = await repository.completed_courses(user_id, req.track, exclude=lesson["id"]) if user_id and req.track else []
    for course in completed:
        outline = {"id": course["id"], "title": clip(course.get("title"), f"completed.{course['id']}.title", 200),
                   "summary": clip(course.get("summary"), f"completed.{course['id']}.summary", 450)}
        if not append_bounded(context["completed_courses"], outline):
            context["coverage"]["omitted_completed_courses"] += 1
    if module:
        for course in module.get("lessons", [])[:100]:
            outline = {"id": course["id"], "title": clip(course.get("title"), f"module.{course['id']}.title", 200),
                       "summary": clip(course.get("summary"), f"module.{course['id']}.summary", 450)}
            if not append_bounded(context["module"]["courses"], outline):
                context["coverage"]["omitted_module_courses"] += 1

    # Only enrich the retained page outline after navigation and prior learning fit.
    for card, outline in pages:
        if card is page:
            continue
        prose = {"body": displayed_body(card, req.lang), "takeaway": text(card.get("takeaway"), req.lang),
                 "sources": refs(card, f"pages.{card['id']}.sources")}
        outline.update(prose)
        if _size(context) > MAX_CONTEXT_BYTES - 2500:
            for key in prose:
                outline.pop(key)
            mark(f"pages.{card['id']}.prose")
    # Keep the marker list itself bounded for very large edited courses.
    context["coverage"]["truncated_field_count"] = truncated_count
    assert _size(context) <= MAX_CONTEXT_BYTES
    return context
