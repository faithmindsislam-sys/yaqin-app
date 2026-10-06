from fastapi import APIRouter, Depends

from app.configuration.settings import get_settings
from app.dependencies import get_repository
from app.repositories.repository import Repository

router = APIRouter()


@router.get("/health")
async def health(repository: Repository = Depends(get_repository)):
    settings = get_settings()
    return {
        "ok": True,
        "model": settings.bedrock_model_id if settings.aws_enabled else None,
        "db": await repository.ping(),
        "store": repository.kind,
    }
