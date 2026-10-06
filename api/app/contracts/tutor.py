"""Validated HTTP requests for the tutor and explain-back endpoints."""

from typing import Annotated, Literal

from pydantic import AliasChoices, BaseModel, Field

from app.domain.audience import Track

Lang = Literal["en", "ar"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1500)
    lang: Lang = "en"
    lesson_id: str | None = Field(default=None, validation_alias=AliasChoices("course_id", "lesson_id"))
    card_id: str | None = Field(default=None, min_length=1, max_length=100)
    practice: bool = False
    practice_avoid: list[Annotated[str, Field(max_length=800)]] = Field(default_factory=list, max_length=1000)
    track: Track | None = None
    history: list[Turn] = Field(default_factory=list, max_length=20)


class ExplainRequest(BaseModel):
    lesson_id: str = Field(validation_alias=AliasChoices("course_id", "lesson_id"))
    track: Track | None = None
    transcript: str = Field(min_length=1, max_length=4000)
    lang: Lang = "en"
