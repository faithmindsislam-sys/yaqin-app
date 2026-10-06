"""The FaithMinds agents service's interactive Ask & Check endpoint."""

from abc import ABC, abstractmethod


class AgentUnavailable(Exception):
    """The agent could not answer; the caller answers from approved sources itself."""


class AgentGateway(ABC):
    enabled: bool = False

    @abstractmethod
    async def ask(self, payload: dict, *, authorization: str) -> dict:
        """POST /agents/v1/ask with the learner's own 'Bearer <Supabase JWT>'.
        Returns {answer, makesReligiousClaim, followUps, librarySources, libraryAvailable}.
        AgentUnavailable permits a local fallback; safety or unknown outcomes raise
        the transport-independent SafetyFailure and must stop the operation."""

    async def close(self) -> None: ...
