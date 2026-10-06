"""Verify Supabase tokens using cached JWKS or an opt-in legacy secret."""

import asyncio

import jwt

from app.configuration.settings import Settings
from app.gateways.token_gateway import InvalidSessionToken, TokenGateway


class SupabaseTokenGateway(TokenGateway):
    def __init__(self, settings: Settings):
        self.settings = settings
        self._jwks_client = (
            jwt.PyJWKClient(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json",
                cache_keys=False,
                lifespan=600,
                timeout=5,
            )
            if settings.supabase_url
            else None
        )

    async def decode_token(self, token: str, *, audience: str = "authenticated") -> dict:
        try:
            # JWKS refresh performs blocking HTTP; keep it off the event loop.
            return await asyncio.to_thread(self._decode_sync, token, audience=audience)
        except (jwt.PyJWTError, jwt.PyJWKClientError, ValueError, TypeError) as error:
            raise InvalidSessionToken("Session verification failed") from error

    def _decode_sync(self, token: str, *, audience: str = "authenticated") -> dict:
        settings = self.settings
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not settings.supabase_jwt_secret or not settings.supabase_url:
                raise jwt.InvalidTokenError("HS256 token but no legacy secret configured")
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            if not settings.supabase_url:
                raise jwt.InvalidTokenError("SUPABASE_URL not configured")
            key = self._jwks_client.get_signing_key_from_jwt(token).key
            algorithms = ["ES256", "RS256"]
        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=audience,
            issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
            options={"require": ["sub", "exp", "aud", "iss"]},
        )
