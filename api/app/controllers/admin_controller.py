from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.contracts.admin import RoleChange, StatusChange, UserListParams
from app.dependencies import get_user_service
from app.domain.users import User
from app.http.auth import require_role
from app.services.user_service import UserService

router = APIRouter(prefix="/admin", dependencies=[Depends(require_role("super_admin"))])


@router.get("/users")
async def users(params: Annotated[UserListParams, Query()], service: UserService = Depends(get_user_service)):
    return await service.users(params)


@router.post("/users/{user_id}/role")
async def change_role(
    user_id: UUID,
    body: RoleChange,
    user: User = Depends(require_role("super_admin")),
    service: UserService = Depends(get_user_service),
):
    return await service.change_role(user_id, body.role, user)


@router.post("/users/{user_id}/status")
async def change_status(
    user_id: UUID,
    body: StatusChange,
    user: User = Depends(require_role("super_admin")),
    service: UserService = Depends(get_user_service),
):
    return await service.change_status(user_id, body.disabled, user)


@router.get("/users/{user_id}/events")
async def user_events(user_id: UUID, service: UserService = Depends(get_user_service)):
    return await service.events(user_id)
