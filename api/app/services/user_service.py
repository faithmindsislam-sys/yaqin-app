"""Account administration with persisted role changes and audit events."""

from uuid import UUID

from app.contracts.admin import UserListParams
from app.domain.errors import ApiError
from app.domain.users import User
from app.repositories.repository import Repository


class UserService:
    def __init__(self, repository: Repository, *, daily_token_limit: int):
        self.repository = repository
        self.daily_token_limit = daily_token_limit

    def check_change(self, user_id: UUID, actor: User) -> None:
        if not actor.id:
            raise ApiError(401, "unauthorized", "A real user session is required for account changes.")
        if actor.role != "super_admin":
            raise ApiError(403, "forbidden", "This needs the super_admin role.")
        if UUID(actor.id) == user_id:
            raise ApiError(403, "forbidden", "You cannot change your own role or status.")
        # Two super admins can demote or disable each other concurrently; not handled.

    async def change_role(self, user_id: UUID, role: str, actor: User) -> dict:
        self.check_change(user_id, actor)
        await self.repository.set_user_role(str(user_id), role, actor.id)
        return {"id": str(user_id), "role": role}

    async def change_status(self, user_id: UUID, disabled: bool, actor: User) -> dict:
        self.check_change(user_id, actor)
        await self.repository.set_user_disabled(str(user_id), disabled, actor.id)
        return {"id": str(user_id), "disabled": disabled}

    async def users(self, params: UserListParams) -> dict:
        result = await self.repository.search_users(
            params.q.strip(), role=params.role, status=params.status, page=params.page, page_size=params.page_size
        )
        return {**result, "daily_token_limit": self.daily_token_limit}

    async def events(self, user_id: UUID) -> list[dict]:
        return await self.repository.user_history(str(user_id))
