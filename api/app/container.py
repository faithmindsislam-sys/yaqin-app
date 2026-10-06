"""Application composition: concrete providers are selected only here."""

import re
from dataclasses import dataclass

from app.agents.course.agent import CourseAgent
from app.agents.review.agent import ReviewAgent
from app.agents.tutor.agent import TutorAgent
from app.configuration.settings import Settings
from app.domain.operations import configure
from app.gateways.agent_gateway import AgentGateway
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.gateways.embedding_gateway import EmbeddingGateway
from app.gateways.gemini_speech_gateway import GeminiSpeechGateway
from app.gateways.http_agent_gateway import HttpAgentGateway
from app.gateways.llm_gateway import LLMGateway
from app.gateways.quran_catalog_gateway import QuranCatalogGateway
from app.gateways.rag_gateway import RagGateway
from app.gateways.s3_resource_store import S3ResourceStore
from app.gateways.speech_gateway import SpeechGateway
from app.gateways.supabase_token_gateway import SupabaseTokenGateway
from app.gateways.token_gateway import TokenGateway
from app.repositories.memory_repository import MemoryRepository
from app.repositories.postgres_repository import PostgresRepository
from app.repositories.repository import Repository
from app.services.content_service import ContentService
from app.services.curriculum_service import CurriculumService
from app.services.lesson_service import LessonService
from app.services.retrieval_service import RetrievalService
from app.services.speech_service import SpeechService
from app.services.user_service import UserService


@dataclass
class ApplicationServices:
    repository: Repository
    curriculum: CurriculumService
    content: ContentService
    lessons: LessonService
    users: UserService
    tutor: TutorAgent
    speech: SpeechService
    tokens: TokenGateway
    llm: LLMGateway
    embeddings: EmbeddingGateway
    rag: RagGateway
    agent: AgentGateway
    speech_gateway: SpeechGateway


async def create_repository(settings: Settings) -> Repository:
    if settings.env == "prod" and (not settings.database_url or not settings.supabase_url):
        raise RuntimeError(
            "Production requires DATABASE_URL and SUPABASE_URL; memory storage is for local development only."
        )
    if settings.database_url:
        return await PostgresRepository.connect(settings.database_url)
    return MemoryRepository(settings.content_dir)


def create_services(repository: Repository, settings: Settings) -> ApplicationServices:
    if settings.env == "prod" and not settings.quran_s3_uri:
        raise RuntimeError("Production requires QURAN_S3_URI; local Quran catalogs are only for offline tests.")
    if settings.env == "prod" and (not settings.guardrail_id or
                                  not re.fullmatch(r"[1-9][0-9]{0,7}", settings.guardrail_version)):
        raise RuntimeError("Production requires GUARDRAIL_ID and a published numeric GUARDRAIL_VERSION.")
    configure(settings)
    llm = BedrockLLMGateway(settings)
    embeddings = BedrockEmbeddingGateway(settings)
    agent = HttpAgentGateway(settings)
    retrieval = RetrievalService(repository, embeddings, k=settings.retrieval_k, vector_floor=settings.vector_floor)
    reviewer = ReviewAgent(repository, llm)
    author = CourseAgent(repository, llm, retrieval)
    speech_gateway = GeminiSpeechGateway(settings)
    speech = SpeechService(
        speech_gateway, S3ResourceStore(settings, region=settings.aws_region),
        model=settings.speech_model, voices=settings.speech_voices, enabled=bool(settings.gemini_api_key),
    )
    return ApplicationServices(
        repository=repository,
        content=ContentService(repository),
        curriculum=CurriculumService(repository),
        lessons=LessonService(repository, reviewer, QuranCatalogGateway(
            settings.content_dir, s3_uri=settings.quran_s3_uri,
            profile=settings.aws_profile, region=settings.aws_region,
        ), author, course_seconds=settings.course_seconds),
        users=UserService(repository, daily_token_limit=settings.user_daily_tokens),
        tutor=TutorAgent(repository, llm, retrieval, agent, fast_model=settings.fast_model_id,
                         review_skip_tiers=settings.review_skip_tiers, tutor_model=settings.tutor_model_id),
        speech=speech,
        tokens=SupabaseTokenGateway(settings),
        llm=llm,
        embeddings=embeddings,
        rag=RagGateway(settings),
        agent=agent,
        speech_gateway=speech_gateway,
    )
