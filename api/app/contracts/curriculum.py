from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Entry(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Title(Entry):
    en: str = Field(min_length=1, max_length=300, pattern=r"\S")
    ar: str = Field(min_length=1, max_length=300, pattern=r"\S")


Id = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9-]{0,99}$")]
Number = Annotated[int, Field(strict=True, gt=0)]


class Subject(Entry):
    id: Id
    title: Title
    levels: list[Number] = Field(max_length=100)


class Level(Entry):
    id: Number
    title: Title


class Module(Entry):
    id: Id
    title: Title
    goal: Title | None = None
    lessons: list[Id] = Field(max_length=10000)

    @model_validator(mode="before")
    @classmethod
    def drop_planned(cls, data):
        # Static "Coming soon" titles were removed; pages loaded before that still send the key.
        return {k: v for k, v in data.items() if k != "planned"} if isinstance(data, dict) else data


class Save(Entry):
    updated_at: str | None = Field(max_length=100)


class SubjectsSave(Save):
    subjects: list[Subject] = Field(max_length=1000)


class LevelsSave(Save):
    levels: list[Level] = Field(max_length=100)


class TrackSave(Save):
    modules: list[Module] = Field(max_length=1000)
