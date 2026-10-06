from typing import Any

from fastapi import APIRouter, Depends

from app.contracts.lesson import LessonDraft
from app.contracts.review import AyahRef, Decision, DraftRequest
from app.dependencies import get_lesson_service
from app.domain.users import User
from app.http.auth import require_role
from app.http.rate_limit import limit
from app.services.lesson_service import LessonService

router = APIRouter(prefix="/review")


@router.post("/check", dependencies=[Depends(limit)])
async def check(
    draft: dict[str, Any],
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.check(draft, user)


@router.post("/draft", status_code=202, dependencies=[Depends(limit)])
async def draft(
    body: DraftRequest,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    """Start AI drafting in the background; poll GET /review/draft/{job_id} for its stage."""
    return await service.start_draft(body.prompt, body.lang, user, track=body.track)


@router.get("/draft/{job_id}")
async def draft_status(
    job_id: str,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.get_draft_job(job_id, user)


@router.post("/draft/{job_id}/resume", status_code=202, dependencies=[Depends(limit)])
async def resume_draft(
    job_id: str,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    """Continue an interrupted job from its server-owned checkpoint."""
    return await service.resume_draft(job_id, user)


@router.get("/courses")
@router.get("/lessons", include_in_schema=False)
async def staff_lessons(
    user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.staff_lessons(user)


@router.get("/{lesson_id}/history")
async def history(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.history(lesson_id, user)


@router.post("/{lesson_id}/archive")
async def archive(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.archive(lesson_id, user)


@router.post("/drafts")
async def save_draft(
    body: LessonDraft,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.save_draft(body.model_dump(exclude_none=True), user)


@router.post("/published")
async def update_published(
    body: LessonDraft,
    user: User = Depends(require_role("admin")),
    service: LessonService = Depends(get_lesson_service),
):
    """An admin updates a live course in place without an automated review check."""
    return await service.save_draft(body.model_dump(exclude_none=True), user, live=True)


@router.post("/{lesson_id}/submit")
async def submit(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.submit(lesson_id, user)


@router.get("/queue")
async def queue(user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)):
    return await service.queue(user)


@router.get("/sources")
async def pending_sources(
    _: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.pending_sources()


@router.post("/sources/quran")
async def quran_source(
    body: AyahRef, _: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    """Puts one verse in the source library, word for word from the bundled Quran, and returns the library entry."""
    return await service.quran_source(body.surah, body.ayah)


@router.post("/sources/{source_id}/approve")
async def approve_source(
    source_id: str, user: User = Depends(require_role("admin")), service: LessonService = Depends(get_lesson_service)
):
    return await service.approve_source(source_id, user)


@router.post("/{lesson_id}/decision")
async def decide(
    lesson_id: str,
    body: Decision,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.decide(lesson_id, body.decision, body.note, user)


@router.post("/{lesson_id}/unpublish")
async def unpublish(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.unpublish(lesson_id, user)


@router.post("/{lesson_id}/delete")
async def delete(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.delete(lesson_id, user)
