"""Shared account budgets and anonymous MCP request limits."""
import asyncio
from hashlib import sha256
from ipaddress import IPv6Address, ip_address, ip_network
import time

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from app.configuration.settings import get_settings
from app.dependencies import get_repository
from app.domain.errors import ApiError
from app.domain.operations import caps
from app.domain.users import User, has_role
from app.http.auth import current_user, require_role
from app.repositories.repository import Repository


def mcp_guest(request: Request, settings) -> str:
    raw = request.client.host if request.client else ""
    if settings.env == "prod":
        # The verified origin is CloudFront -> ALB (append mode). Both append a hop;
        # earlier X-Forwarded-For values can be forged, even with Uvicorn proxy headers.
        hops = request.headers.get("x-forwarded-for", "").split(",")
        raw = hops[-2].strip() if len(hops) >= 2 else ""
    try:
        address = ip_address(raw)
        if isinstance(address, IPv6Address):
            address = address.ipv4_mapped or ip_network(f"{address}/64", strict=False)
        identity = str(address)
    except ValueError:
        identity = "unknown"  # Missing/malformed addresses share one bounded bucket.
    # ponytail: NAT and hosted connector users share a quota; use keys if isolation is needed.
    return "mcp:" + sha256(identity.encode()).hexdigest()


class MCPRateLimit:
    def __init__(self, app, application, settings):
        self.app, self.application, self.settings = app, application, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        scope["mcp_guest"] = mcp_guest(Request(scope), self.settings)
        try:
            await asyncio.wait_for(self.application.state.services.repository.reserve_budget(
                scope["mcp_guest"], 0, self.settings, public=True), timeout=10)
        except ApiError as exc:
            if exc.status == 429:
                exc = ApiError(429, "rate_limited", "The MCP request limit is temporarily exhausted.",
                               headers={"Retry-After": str(60 - int(time.time()) % 60)})
            response = JSONResponse({"error": {"code": exc.code, "message": exc.message}},
                                    status_code=exc.status, headers=exc.headers)
            return await response(scope, receive, send)
        except Exception:
            response = JSONResponse({"error": {"code": "quota_unavailable", "message": "The request quota is temporarily unavailable."}},
                                    status_code=503)
            return await response(scope, receive, send)
        await self.app(scope, receive, send)


async def limit(request: Request, user: User = Depends(current_user),
                repository: Repository = Depends(get_repository)) -> None:
    path = request.url.path
    learner_path = "/tutor/" in path or path.endswith("/speech") or path.endswith("/speech/stream")
    role = "learner" if learner_path else "admin" if path.endswith("/published") else "teacher"
    if not has_role(user, role):
        raise ApiError(403, "forbidden", "This operation requires an authorized account.")
    kind = "tutor" if learner_path else "course" if path.endswith("/draft") else "review"
    try:
        await repository.reserve_budget(user.id, caps(kind)[1], get_settings())
    except ApiError:
        raise
    except Exception:
        raise ApiError(503, "quota_unavailable", "The model budget is temporarily unavailable.") from None


async def public_limit(user: User = Depends(require_role("learner")),
                       repository: Repository = Depends(get_repository)) -> None:
    try:
        await repository.reserve_budget(user.id, 0, get_settings(), public=True)
    except ApiError as exc:
        if exc.status != 429:
            raise
        raise ApiError(429, "rate_limited", "The public API request limit is temporarily exhausted.",
                       headers={"Retry-After": str(60 - int(time.time()) % 60)}) from None
    except Exception:
        raise ApiError(503, "quota_unavailable", "The request quota is temporarily unavailable.") from None
