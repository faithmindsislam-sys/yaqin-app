from fastapi import APIRouter, Depends, Response

from app.dependencies import get_content_service
from app.domain.users import User
from app.http.auth import current_user, require_role
from app.services.content_service import ContentService

router = APIRouter(dependencies=[Depends(require_role("learner"))])


@router.get("/content")
async def content_bundle(response: Response, service: ContentService = Depends(get_content_service)):
    response.headers["Cache-Control"] = "no-store"
    return await service.content_bundle()


@router.get("/tracks")
async def tracks(service: ContentService = Depends(get_content_service)):
    return await service.tracks()


@router.get("/courses/{lesson_id}")
@router.get("/lessons/{lesson_id}", include_in_schema=False)
async def lesson(
    lesson_id: str, user: User = Depends(current_user), service: ContentService = Depends(get_content_service)
):
    return await service.lesson(lesson_id, user)


@router.get("/sources/{source_id}")
async def source(source_id: str, service: ContentService = Depends(get_content_service)):
    return await service.source(source_id)
