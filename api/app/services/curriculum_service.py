from app.domain.users import User
from app.repositories.repository import Repository


class CurriculumService:
    def __init__(self, repository: Repository):
        self.repository = repository

    async def read(self) -> dict:
        return await self.repository.curriculum()

    async def save(self, key: str, items: list, updated_at: str | None, user: User, track_id=None) -> dict:
        return await self.repository.save_curriculum(key, items, updated_at, user.id, track_id)
