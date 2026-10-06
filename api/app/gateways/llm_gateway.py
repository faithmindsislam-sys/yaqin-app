from abc import ABC, abstractmethod

from app.domain.safety import SafetyFailure


class LLMUnavailable(Exception):
    """Model execution failed; callers can use their deterministic fallback."""


class LLMGateway(ABC):
    """Return a JSON object validated against the caller's schema."""

    async def assess(self, value, source: str) -> None:
        """Implementations must provide assessment; absence fails closed."""
        raise SafetyFailure()

    @abstractmethod
    async def structured(
        self, *, system: str, messages: list[dict], schema: dict, effort: str = "medium", max_tokens: int = 4000,
        safety_input=None, moderate: bool = True, model: str | None = None, think: bool = True,
    ) -> dict: ...

    @abstractmethod
    async def close(self) -> None: ...
