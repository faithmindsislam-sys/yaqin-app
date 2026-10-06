from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import ClassVar, Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
ROOT = API_DIR.parent

# Profiles for unrelated accounts that must never power this app.
DENIED_PROFILE_PREFIXES = ("aws-",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    env: Literal["local", "prod"] = "local"
    allowed_origins: str = "http://localhost:3000"

    aws_region: str = "eu-west-1"
    # Claude's Messages endpoint on Bedrock (Mantle) serves Opus 5.5 from us-east-1.
    bedrock_region: str = "us-east-1"
    # Deliberately not AWS_PROFILE: a shell-wide AWS_PROFILE must not leak into this app.
    yaqin_aws_profile: str | None = None
    bedrock_model_id: str = "anthropic.claude-opus-5-5"
    # Pin interactive tutors for this release: stale environment values cannot select Opus.
    # ClassVar deliberately excludes these from environment configuration. Hassan uses BEDROCK_MODEL_ID.
    # anthropic.claude-sonnet-5-5 is not served on Bedrock (404); it took Ask down on 2026-10-06.
    tutor_model_id: ClassVar[str] = "anthropic.claude-sonnet-5"
    # Classification only. The evidence review uses tutor_model_id.
    fast_model_id: ClassVar[str] = "anthropic.claude-haiku-4-5"
    # Tiers whose answers skip the second-model evidence review when every citation is an approved
    # canonical source (library passages are always reviewed). "A" = settled core facts. Empty = review all.
    review_skip_tiers: str = ""
    # Required at every runtime safety boundary, in local and prod alike. No bypass flag.
    guardrail_id: str = ""
    guardrail_version: str = ""
    embed_model_id: str = "amazon.titan-embed-text-v2:0"

    # Text-to-speech. Empty key = feature disabled (POST /api/speech returns 503 speech_unavailable).
    gemini_api_key: str | None = Field(default=None, repr=False)
    speech_model: str = "gemini-3.8-flash-lite-tts"
    speech_bucket: str = "yaqin-resources-744172873146"
    speech_voices: str = "en:male=Charon,en:female=Kore,ar:male=Enceladus,ar:female=Aoede"

    database_url: str | None = Field(default=None, repr=False)
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = Field(default=None, repr=False)  # legacy HS256 projects only

    content_dir: Path = ROOT / "content"
    quran_s3_uri: str | None = "s3://yaqin-resources-744172873146/resources/quran/"

    rag_service_url: str | None = None
    # Ask & Check answers through the agents service (which adds Studio library passages via RAG).
    # Unset: the tutor answers in-process from approved sources only.
    agents_service_url: str | None = None
    # Set the public endpoint to enable anonymous, rate-limited MCP.
    mcp_resource_url: str | None = None
    mcp_allowed_hosts: str = "localhost:*,127.0.0.1:*"

    # Owner decision (2026-10-06): the daily ceilings exist only as a runaway-cost backstop,
    # not as a product limit. They are set high enough that a learner, a judge or a demo can
    # never meet them. Per-minute limits stay, as abuse protection, but are generous.
    tutor_rate_per_minute: int = Field(default=120, gt=0)
    public_api_rate_per_minute: int = Field(default=60, gt=0)
    public_api_service_rate_per_minute: int = Field(default=500, gt=0)
    tutor_seconds: int = Field(default=55, ge=1, le=120)
    tutor_tokens: int = Field(default=200_000, gt=0)
    tutor_model_calls: int = Field(default=4, gt=0, le=20)
    review_seconds: int = Field(default=180, ge=1, le=300)
    review_tokens: int = Field(default=800_000, gt=0)
    review_model_calls: int = Field(default=12, gt=0, le=30)
    course_seconds: int = Field(default=480, ge=1, le=540)
    course_tokens: int = Field(default=3_000_000, gt=0)
    course_model_calls: int = Field(default=32, gt=0, le=40)
    user_daily_tokens: int = Field(default=1_000_000_000_000, gt=0)
    service_daily_tokens: int = Field(default=10_000_000_000_000, gt=0)
    service_rate_per_minute: int = Field(default=500, gt=0)
    retrieval_k: int = Field(default=8, gt=0)
    vector_floor: float = Field(default=0.32, ge=0, le=1)

    @field_validator(
        "database_url",
        "supabase_url",
        "supabase_jwt_secret",
        "yaqin_aws_profile",
        "rag_service_url",
        "agents_service_url",
        "quran_s3_uri",
        "mcp_resource_url",
        "gemini_api_key",
        mode="before",
    )
    @classmethod
    def empty_is_unconfigured(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("rag_service_url", "agents_service_url", "supabase_url")
    @classmethod
    def https_origin(cls, value):
        if value is None:
            return value
        u = urlsplit(value)
        if (u.scheme != "https" or not u.hostname or u.username or u.password
                or u.query or u.fragment or u.path not in ("", "/") or u.port not in (None, 443)):
            raise ValueError("Service configuration requires an HTTPS origin without credentials or URL extras")
        return value.rstrip("/")

    @field_validator("mcp_resource_url")
    @classmethod
    def mcp_resource(cls, value):
        if value is None:
            return value
        u = urlsplit(value)
        if (u.scheme != "https" or not u.hostname or u.username or u.password or u.query or u.fragment
                or u.port not in (None, 443) or u.path != "/api/v1/mcp/"):
            raise ValueError("MCP_RESOURCE_URL must be the exact HTTPS /api/v1/mcp/ endpoint, including its final slash")
        return value

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def aws_profile(self) -> str | None:
        p = self.yaqin_aws_profile
        if p and p.startswith(DENIED_PROFILE_PREFIXES):
            raise RuntimeError(f"AWS profile '{p}' is on the deny list for this app")
        return p

    @property
    def aws_enabled(self) -> bool:
        """AWS is used only with an explicit app profile or an attached task role."""
        in_container = any(
            os.environ.get(k) for k in ("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI")
        )
        return bool(self.aws_profile) or in_container


@lru_cache
def get_settings() -> Settings:
    return Settings()
