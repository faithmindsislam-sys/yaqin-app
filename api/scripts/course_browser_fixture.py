"""Isolated browser-test API: real content/review workflows, deterministic AI and test identity.

python -m scripts.course_browser_fixture
Never uses .env credentials, remote storage, AWS, or the deployed app.
"""

import copy
import os
from contextlib import asynccontextmanager

os.environ.update(ENV="local", DATABASE_URL="", SUPABASE_URL="", SUPABASE_JWT_SECRET="", YAQIN_AWS_PROFILE="",
                  RAG_SERVICE_URL="", RAG_SERVICE_TOKEN="", QURAN_S3_URI="", DEV_ROLE="", TUTOR_RATE_PER_MINUTE="1000",
                  ALLOWED_ORIGINS="http://127.0.0.1:3107,http://localhost:3107")
for key in ("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI"):
    os.environ.pop(key, None)

from app.gateways.quran_gateway import QuranGateway
from app.domain.users import User
from app.http.auth import current_user
from app.main import create_app, lifespan

USER_ID = "00000000-0000-0000-0000-000000000001"
app = create_app()


class FixtureQuran(QuranGateway):
    """Use exact checked-in references; never reads a production resource bucket."""
    def __init__(self, repository):
        self.repository = repository

    def ayah_source(self, surah: int, ayah: int):
        return copy.deepcopy(self.repository.sources.get(f"quran:{surah}:{ayah}"))


class FixtureLLM:
    def __init__(self, seed):
        self.seed = seed

    async def structured(self, **kwargs):
        props = kwargs["schema"]["properties"]
        if "cards" in props:
            return {**copy.deepcopy(self.seed), "title": {"en": "Generated verification course", "ar": "دورة التحقق المُنشأة"},
                    "subject": "fiqh", "level": 2, "tracks": ["first-steps", "deepen"]}
        if "issues" in props:
            return {"issues": []}
        if "covered" in props:
            return {"covered": [], "misconceptions": [], "feedback": "Verification feedback"}
        raise RuntimeError("Unexpected fixture AI call")

    async def close(self):
        pass


@asynccontextmanager
async def fixture_lifespan(application):
    async with lifespan(application):
        services = application.state.services
        repository = services.repository
        repository.users[USER_ID] = {"id": USER_ID, "role": "admin", "email": "admin@example.test", "display_name": "Test Admin"}
        seed = copy.deepcopy(repository.lessons["wudu-order"])
        for sid in {sid for card in seed["cards"] for sid in card.get("sources", [])}:
            repository.sources[sid]["review_status"] = "approved"
        repository.reload_index()
        services.lessons.quran = FixtureQuran(repository)
        llm = FixtureLLM(seed)
        services.lessons.author.llm = llm
        services.lessons.reviewer.llm = llm
        services.tutor.llm = llm
        yield


app.router.lifespan_context = fixture_lifespan
app.dependency_overrides[current_user] = lambda: User(id=USER_ID, role="admin")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8797)
