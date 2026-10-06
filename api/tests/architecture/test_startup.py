from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.configuration.settings import ROOT, Settings, get_settings
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.main import create_app
from app.http.auth import current_user
from app.domain.users import User
from app.repositories.memory_repository import MemoryRepository


def test_applications_have_independent_repositories_and_close_them(monkeypatch):
    first = MemoryRepository(get_settings().content_dir)
    second = MemoryRepository(get_settings().content_dir)
    first.close = AsyncMock()
    second.close = AsyncMock()
    monkeypatch.setattr("app.main.create_repository", AsyncMock(side_effect=[first, second]))
    with TestClient(create_app()) as one, TestClient(create_app()) as two:
        assert one.app.state.services.repository is first
        assert two.app.state.services.repository is second
        assert one.app.state.services.llm is not two.app.state.services.llm
        assert one.app.state.services.embeddings is not two.app.state.services.embeddings
        assert one.app.state.services.tokens is not two.app.state.services.tokens
        assert one.app.state.services.tutor.llm is one.app.state.services.lessons.reviewer.llm
        for application in (one.app, two.app):
            application.dependency_overrides[current_user] = lambda: User(id="learner", role="learner")
        first.lessons.pop("wudu-order")
        assert one.get("/api/lessons/wudu-order").status_code == 404
        assert two.get("/api/lessons/wudu-order").status_code == 200
    first.close.assert_awaited_once()
    second.close.assert_awaited_once()


def test_composition_failure_closes_the_open_repository(monkeypatch):
    repository = MemoryRepository(get_settings().content_dir)
    repository.close = AsyncMock()
    monkeypatch.setattr("app.main.create_repository", AsyncMock(return_value=repository))

    def fail_composition(*_):
        raise RuntimeError("composition failed")

    monkeypatch.setattr("app.main.create_services", fail_composition)
    with pytest.raises(RuntimeError, match="composition failed"), TestClient(create_app()):
        pass
    repository.close.assert_awaited_once()


def test_cleanup_failure_still_closes_other_providers_and_storage(monkeypatch):
    repository = MemoryRepository(get_settings().content_dir)
    repository.close = AsyncMock()
    llm_close = AsyncMock(side_effect=RuntimeError("model cleanup failed"))
    embedding_close = AsyncMock()
    monkeypatch.setattr("app.main.create_repository", AsyncMock(return_value=repository))
    monkeypatch.setattr(BedrockLLMGateway, "close", llm_close)
    monkeypatch.setattr(BedrockEmbeddingGateway, "close", embedding_close)
    with pytest.raises(RuntimeError, match="model cleanup failed"):
        with TestClient(create_app()) as client:
            assert client.get("/api/health").status_code == 200
    llm_close.assert_awaited_once()
    embedding_close.assert_awaited_once()
    repository.close.assert_awaited_once()


def test_dotenv_location_does_not_depend_on_working_directory(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("RETRIEVAL_K=999\n")
    monkeypatch.delenv("RETRIEVAL_K", raising=False)
    monkeypatch.chdir(tmp_path)
    assert Settings.model_config["env_file"] == ROOT / ".env"
    assert Settings().retrieval_k != 999


@pytest.mark.parametrize(
    "setting,value",
    [("env", "production-typo"), ("tutor_rate_per_minute", 0), ("retrieval_k", -1), ("vector_floor", 2)],
)
def test_invalid_operational_configuration_fails_early(setting, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{setting: value})


def test_secret_settings_are_excluded_from_repr():
    settings = Settings(_env_file=None, database_url="postgresql://private-value", supabase_jwt_secret="private-secret")
    assert "private-value" not in repr(settings)
    assert "private-secret" not in repr(settings)
