from fastapi import APIRouter, Depends, Response

from app.contracts.curriculum import LevelsSave, SubjectsSave, TrackSave
from app.dependencies import get_curriculum_service
from app.domain.users import User
from app.http.auth import require_role
from app.services.curriculum_service import CurriculumService

router = APIRouter(prefix="/curriculum", dependencies=[Depends(require_role("admin"))])


@router.get("")
async def curriculum(response: Response, service: CurriculumService = Depends(get_curriculum_service)):
    response.headers["Cache-Control"] = "no-store"
    return await service.read()


@router.post("/subjects")
async def subjects(body: SubjectsSave, user: User = Depends(require_role("admin")),
                   service: CurriculumService = Depends(get_curriculum_service)):
    return await service.save("subjects", [s.model_dump() for s in body.subjects], body.updated_at, user)


@router.post("/levels")
async def levels(body: LevelsSave, user: User = Depends(require_role("admin")),
                 service: CurriculumService = Depends(get_curriculum_service)):
    return await service.save("levels", [l.model_dump() for l in body.levels], body.updated_at, user)


@router.post("/tracks/{track_id}")
async def track(track_id: str, body: TrackSave, user: User = Depends(require_role("admin")),
                service: CurriculumService = Depends(get_curriculum_service)):
    return await service.save("tracks", [m.model_dump(exclude_none=True) for m in body.modules], body.updated_at, user, track_id)
