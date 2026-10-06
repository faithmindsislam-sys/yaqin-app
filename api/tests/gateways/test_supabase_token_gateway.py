import time

import jwt
import pytest

from app.configuration.settings import Settings
from app.gateways.supabase_token_gateway import SupabaseTokenGateway
from app.gateways.token_gateway import InvalidSessionToken

SUPABASE = "https://test-project.supabase.co"


async def test_legacy_tokens_require_a_valid_signature_and_claims():
    settings = Settings(_env_file=None, supabase_url=SUPABASE, supabase_jwt_secret="test-secret-" * 4)
    gateway = SupabaseTokenGateway(settings)
    claims = {"sub": "test-user", "aud": "authenticated", "iss": f"{SUPABASE}/auth/v1", "exp": time.time() + 600}
    token = jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")
    assert await gateway.decode_token(token) == claims
    invalid = jwt.encode({**claims, "aud": "anon"}, settings.supabase_jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidSessionToken):
        await gateway.decode_token(invalid)
    tampered = jwt.encode(claims, "wrong-secret-" * 4, algorithm="HS256")
    with pytest.raises(InvalidSessionToken):
        await gateway.decode_token(tampered)


async def test_unconfigured_authentication_starts_but_rejects_tokens():
    gateway = SupabaseTokenGateway(Settings(_env_file=None))
    with pytest.raises(InvalidSessionToken):
        await gateway.decode_token("invalid-token")
