"""Validated scholarly-review and curriculum requests."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.audience import Track


class Decision(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str = Field(default="", max_length=4000)


class DraftRequest(BaseModel):
    """Teacher's prompt for the Studio 'Generate with AI' lesson draft."""
    model_config = ConfigDict(str_strip_whitespace=True)
    prompt: str = Field(min_length=1, max_length=4000)
    lang: Literal["en", "ar"] = "en"
    track: Track | None = None


class AyahRef(BaseModel):
    surah: int = Field(ge=1, le=114)
    ayah: int = Field(ge=1, le=286)
