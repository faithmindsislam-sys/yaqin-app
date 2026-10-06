"""Server-only HTTP access to the separate ingestion and retrieval service."""

import httpx

from app.configuration.settings import Settings
from app.domain.errors import ApiError


class RagGateway:
    def __init__(self, settings: Settings):
        self.url = (settings.rag_service_url or "").rstrip("/")
        self.client = httpx.AsyncClient(timeout=45, follow_redirects=False, trust_env=False)

    async def request(self, method: str, path: str, body: dict | None = None, *, authorization: str,
                      params: dict | None = None):
        if not self.url:
            raise ApiError(503, "rag_unavailable", "Knowledge Base service is not configured.")
        if not authorization.lower().startswith("bearer ") or not authorization.split(" ", 1)[1].strip():
            raise ApiError(401, "unauthorized", "Sign in to use the Knowledge Base.")
        try:
            response = await self.client.request(
                method,
                f"{self.url}/rag{path}",
                json=body,
                params=params,
                headers={"Authorization": authorization},
            )
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ApiError(502, "rag_unavailable", "Knowledge Base service could not be reached. Try again.") from exc
        if not response.is_success:
            status = response.status_code if response.status_code in (400, 401, 403, 404, 409, 429) else 502
            raise ApiError(
                status,
                "rag_service_error",
                "Session or permissions changed. Sign in again." if status in (401, 403)
                else "Knowledge Base service request failed. Try again.",
            )
        if not isinstance(data, dict):
            raise ApiError(502, "rag_invalid_response", "Knowledge Base service returned an invalid response.")
        return data

    async def close(self):
        await self.client.aclose()
