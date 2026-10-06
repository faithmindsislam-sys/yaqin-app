"""Public content and authorized lesson reads."""

from app.contracts.lesson import contract_fields
from app.domain.errors import ApiError
from app.domain.lessons import is_live, lesson_source_ids
from app.domain.source_policy import source_view, source_views
from app.domain.users import User, has_role
from app.repositories.repository import Repository


def public_lesson(lesson: dict) -> dict:
    """Staff email credits never reach learner responses."""
    return {k: v for k, v in contract_fields(lesson).items() if k != "contributors"}


class ContentService:
    def __init__(self, repository: Repository):
        self.repository = repository

    async def content_bundle(self) -> dict:
        bundle = await self.repository.content_bundle()
        courses = {i: public_lesson(lesson) for i, lesson in bundle["lessons"].items()}
        # lessons is a deprecated alias for older deployed clients.
        return {**bundle, "sources": source_views(bundle["sources"]), "courses": courses, "lessons": courses}

    async def lesson(self, lesson_id: str, user: User) -> dict:
        staff = has_role(user, "teacher")
        data = await self.repository.get_lesson(lesson_id, include_unpublished=staff)
        if data is None or (
            data.get("status") != "published" and not has_role(user, "admin") and data.get("author_id") != user.id
        ):
            raise ApiError(404, "not_found", f"No course '{lesson_id}'.")
        return {
            **({**contract_fields(data), "author_id": data.get("author_id")} if staff else public_lesson(data)),
            "sources_by_id": source_views(await self.repository.get_sources(lesson_source_ids(data))),
        }

    async def source(self, source_id: str) -> dict:
        found = await self.repository.get_sources([source_id])
        if source_id not in found:
            raise ApiError(404, "not_found", f"No source '{source_id}'.")
        return source_view(found[source_id])

    async def tracks(self) -> list[dict]:
        return await self.repository.list_tracks()

    async def published_courses(self, *, offset: int, limit: int, track: str | None = None) -> dict:
        # ponytail: catalogue metadata is paginated in memory; move filtering/pagination to SQL when it grows.
        courses = sorted((course for course in await self.repository.list_courses()
                          if track is None or track in course.get("tracks", [])), key=lambda course: course["id"])
        return {"items": courses[offset:offset + limit], "total": len(courses), "offset": offset, "limit": limit}

    async def published_course(self, course_id: str) -> dict:
        course = await self.repository.get_lesson(course_id)
        if course is None or not is_live(course):
            raise ApiError(404, "not_found", "Published course not found.")
        ids = lesson_source_ids(course)
        sources = await self.repository.get_sources(ids)
        if any(sid not in sources or sources[sid].get("review_status") != "approved" for sid in ids):
            raise ApiError(409, "sources_unavailable", "This course is awaiting source approval.")
        return {**public_lesson(course), "sources_by_id": source_views(sources)}

    async def approved_source(self, source_id: str) -> dict:
        source = await self.source(source_id)
        if source.get("review_status") != "approved":
            raise ApiError(404, "not_found", "Approved source not found.")
        return source
