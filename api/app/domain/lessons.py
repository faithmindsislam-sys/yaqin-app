"""Lesson visibility, citations, ownership and curriculum rules."""

from .errors import ApiError


def lesson_source_ids(lesson: dict | None) -> list[str]:
    if not lesson:
        return []
    ids: list[str] = []
    for card in lesson.get("cards", []):
        ids += card.get("sources", [])
    for idea in lesson.get("explain_back", {}).get("key_ideas", []):
        if idea.get("source"):
            ids.append(idea["source"])
    for q in lesson.get("quiz", []):
        if q.get("source"):
            ids.append(q["source"])
    return list(dict.fromkeys(ids))


def lesson_summary(lesson: dict) -> dict:
    keys = ("id", "subject", "tracks", "level", "minutes", "title", "summary", "cover", "status")
    return {k: lesson.get(k) for k in keys} | {"cards": len(lesson.get("cards", []))}


def card_docs(lesson: dict) -> list[tuple[str, str, list[str]]]:
    """(doc_id, text, source_ids) for each card's reviewed prose, in both languages.
    A card without its own sources points at the lesson's sources."""

    fallback = lesson_source_ids(lesson)
    title = " ".join((lesson.get("title") or {}).values())
    out = []
    for card in lesson.get("cards", []):
        parts = [title]
        for field in ("title", "body", "takeaway"):
            parts += [v for v in (card.get(field) or {}).values() if isinstance(v, str)]
        ids = card.get("sources") or fallback
        if ids:
            out.append((f"lesson:{lesson['id']}:{card.get('id')}", " ".join(parts), ids))
    return out


def tracks_with_lessons(tracks: list[dict], lessons: dict[str, dict]) -> list[dict]:
    out = []
    for t in tracks:
        modules = []
        for m in t.get("modules", []):
            items = [
                lesson_summary(lessons[i])
                for i in m.get("lessons", [])
                if i in lessons and is_live(lessons[i]) and t["id"] in lessons[i].get("tracks", [])
            ]
            modules.append({**{k: v for k, v in m.items() if k not in ("lessons", "planned")}, "lessons": items})
        out.append({**{k: v for k, v in t.items() if k != "modules"}, "modules": modules})
    return out


def ensure_known_sources(lesson: dict, sources: dict) -> None:
    ids = lesson_source_ids(lesson)
    if any(sid not in sources for sid in ids):
        raise ApiError(409, "unknown_sources", "The course cites an unknown source.")


def check_owner(lesson: dict, actor_id: str | None, reviewer: bool) -> None:
    if not reviewer and (not actor_id or lesson.get("author_id") != actor_id):
        raise ApiError(403, "forbidden", "Only the author or an admin can manage this course.")


COMING_SOON_STATUSES = ("draft", "in_review", "published")


def is_live(lesson: dict) -> bool:
    """Learners can open it: published, and not locked by the Coming soon setting."""
    return lesson.get("status") == "published" and not lesson.get("coming_soon")


def coming_soon_teasers(lessons) -> dict[str, dict]:
    """Courses with the Coming soon setting on (any status but archived): learners see them locked.
    Title and classification only: the course content is never included."""
    keys = ("id", "title", "subject", "level", "tracks")
    return {
        lesson["id"]: {k: lesson.get(k) for k in keys}
        for lesson in lessons
        if lesson.get("coming_soon") and lesson.get("status") in COMING_SOON_STATUSES
    }
