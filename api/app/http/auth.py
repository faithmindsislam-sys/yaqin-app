"""HTTP session dependencies; role decisions use persisted backend profiles."""

import asyncio
import uuid

from fastapi import Depends, Request

from app.dependencies import get_repository, get_token_gateway
from app.domain.errors import ApiError
from app.domain.users import User, has_role
from app.gateways.token_gateway import InvalidSessionToken, TokenGateway
from app.repositories.repository import Repository


async def current_user(
    request: Request,
    repository: Repository = Depends(get_repository),
    tokens: TokenGateway = Depends(get_token_gateway),
) -> User:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "Sign in to continue.")
    if len(header) > 16384:
        raise ApiError(401, "unauthorized", "Invalid session token.")
    token = header.split(" ", 1)[1].strip()
    try:
        claims = await asyncio.wait_for(tokens.decode_token(token), timeout=12)
        uuid.UUID(claims["sub"])
    except (InvalidSessionToken, ValueError, TypeError, KeyError) as e:
        raise ApiError(401, "unauthorized", "Invalid session token.") from e
    except TimeoutError:
        raise ApiError(503, "auth_unavailable", "Session verification is temporarily unavailable.") from None
    if claims.get("is_anonymous"):
        raise ApiError(401, "unauthorized", "Sign in to continue.")
    user_id = claims.get("sub")
    try:
        role = await asyncio.wait_for(repository.get_role(user_id), timeout=10) if user_id else None
    except Exception:
        raise ApiError(503, "auth_unavailable", "User authorization is temporarily unavailable.") from None
    if role is None:
        raise ApiError(403, "account_unavailable", "An active account is required.")
    if role == "disabled":
        raise ApiError(403, "account_disabled", "Your account is disabled. Contact an administrator.")
    return User(id=user_id, role=role or "learner", email=claims.get("email"))


def require_role(minimum: str):
    async def dep(user: User = Depends(current_user)) -> User:
        if user.role == "anonymous":
            raise ApiError(401, "unauthorized", "Sign in to continue.")
        if not has_role(user, minimum):
            raise ApiError(403, "forbidden", f"This needs the {minimum} role.")
        return user

    return dep
