"""FastAPI dependency accessors for the current application's services."""

from fastapi import Request

from app.agents.tutor.agent import TutorAgent
from app.container import ApplicationServices
from app.gateways.token_gateway import TokenGateway
from app.repositories.repository import Repository
from app.services.content_service import ContentService
from app.services.curriculum_service import CurriculumService
from app.services.lesson_service import LessonService
from app.services.speech_service import SpeechService
from app.services.user_service import UserService


def get_services(request: Request) -> ApplicationServices:
    return request.app.state.services


def get_repository(request: Request) -> Repository:
    return get_services(request).repository


def get_token_gateway(request: Request) -> TokenGateway:
    return get_services(request).tokens


def get_content_service(request: Request) -> ContentService:
    return get_services(request).content


def get_lesson_service(request: Request) -> LessonService:
    return get_services(request).lessons


def get_user_service(request: Request) -> UserService:
    return get_services(request).users


def get_tutor_agent(request: Request) -> TutorAgent:
    return get_services(request).tutor


def get_curriculum_service(request: Request) -> CurriculumService:
    return get_services(request).curriculum


def get_speech_service(request: Request) -> SpeechService:
    return get_services(request).speech
