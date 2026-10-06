"""Validated HTTP request for the speech endpoint."""

from typing import Literal

from pydantic import BaseModel, Field


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: Literal["en", "ar"] = "en"
    voice: Literal["male", "female"] = "male"
