"""Version-one external schemas: explicit fields keep staff and storage metadata private."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.contracts.lesson import Bi, Card, Explain, Quiz
from app.contracts.tutor import AskRequest
from app.domain.courses import lesson_level


class PublicSource(BaseModel):
    id: str
    kind: str
    ref_en: str | None = None
    ref_ar: str | None = None
    text_en: str | None = None
    text_ar: str | None = None
    translation: str | None = None
    translation_status_en: str | None = None
    origin: str | None = None
    url: str | None = None
    grading: str | None = None
    review_status: Literal["approved", "unreviewed"]
    eligibility: str | None = None


class CourseSummary(BaseModel):
    id: str
    title: Bi
    summary: Bi
    subject: str
    tracks: list[str]
    level: int
    minutes: int
    cover: str | None = None
    status: Literal["published"]

    @field_validator("level", mode="before")
    @classmethod
    def normalized_level(cls, value):
        return lesson_level(value)


class CoursePage(BaseModel):
    items: list[CourseSummary]
    total: int
    offset: int
    limit: int


class PublicCourse(CourseSummary):
    cards: list[Card]
    explain_back: Explain | None = None
    quiz: list[Quiz] | None = None
    sources_by_id: dict[str, PublicSource]


class PublicAskRequest(AskRequest):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [
        {"question": "What is wudu?", "lang": "en"}
    ]})


class TextBlock(BaseModel):
    type: Literal["text"]
    text: str


class SourceBlock(BaseModel):
    type: Literal["source"]
    id: str


class PracticeQuestion(BaseModel):
    id: str
    question: Bi
    options: list[Bi]
    answer: int
    hint: dict[str, str]
    explanation: Bi
    source: str


class TutorAnswer(BaseModel):
    tier: str
    answer: list[TextBlock | SourceBlock]
    sources: dict[str, PublicSource]
    referral: dict[str, str] | None = None
    follow_ups: list[str] = Field(default_factory=list)
    ai_generated: bool
    safety_outcome: str | None = None
    practice: list[PracticeQuestion] | None = None
    practice_fallback: bool = False


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
