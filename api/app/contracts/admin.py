"""Validated account administration requests."""

from typing import Literal

from pydantic import BaseModel, Field, StrictBool


class UserListParams(BaseModel):
    q: str = ""
    role: Literal["learner", "teacher", "admin", "super_admin"] | None = None
    status: Literal["active", "disabled"] | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=50)


class RoleChange(BaseModel):
    role: Literal["learner", "teacher", "admin", "super_admin"]


class StatusChange(BaseModel):
    disabled: StrictBool
