"""Authenticated external API. All operations reuse existing content and tutor services."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.security import HTTPBearer

from app.agents.tutor.agent import TutorAgent
from app.contracts.public import CoursePage, ErrorResponse, PublicAskRequest, PublicCourse, PublicSource, TutorAnswer
from app.dependencies import get_content_service, get_tutor_agent
from app.domain.users import User
from app.http.auth import current_user
from app.http.rate_limit import limit, public_limit
from app.services.content_service import ContentService

router = APIRouter(
    dependencies=[Depends(HTTPBearer(auto_error=False, bearerFormat="JWT")), Depends(public_limit)],
    responses={"default": {"model": ErrorResponse, "description": "Unexpected error"},
               # Python versions use different default phrases for HTTP 413.
               413: {"model": ErrorResponse, "description": "Content Too Large"},
               **{code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 429, 503)}},
)


@router.get("/courses", response_model=CoursePage, tags=["Courses"], summary="List published courses")
async def courses(
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    track: Literal["explore", "first-steps", "deepen"] | None = None,
    service: ContentService = Depends(get_content_service),
):
    return await service.published_courses(offset=offset, limit=limit, track=track)


@router.get("/courses/{course_id}", response_model=PublicCourse, tags=["Courses"],
            summary="Read a published course and its approved sources")
async def course(course_id: str, service: ContentService = Depends(get_content_service)):
    return await service.published_course(course_id)


@router.get("/sources/{source_id}", response_model=PublicSource, tags=["Sources"], summary="Read an approved source")
async def source(source_id: str, service: ContentService = Depends(get_content_service)):
    return await service.approved_source(source_id)


@router.post("/tutor/ask", response_model=TutorAnswer, dependencies=[Depends(limit)], tags=["Tutor"],
             summary="Ask the tutor and receive cited evidence")
async def ask(req: PublicAskRequest, request: Request, user: User = Depends(current_user),
              service: TutorAgent = Depends(get_tutor_agent)):
    return await service.ask(req, authorization=request.headers.get("authorization", ""), user_id=user.id)
