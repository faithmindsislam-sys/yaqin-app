"""Bound request bodies before JSON parsing and prevent caching of authenticated responses."""

from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Receive, Scope, Send


class PublicBoundary:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = 65536

        async def private_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                message["headers"].append((b"cache-control", b"no-store"))
            await send(message)

        # Read at most 64 KiB even if Content-Length is missing or dishonest.
        # Buffering makes body-limit errors deterministic before routing can send a response.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            part = message.get("body", b"")
            if len(body) + len(part) > limit:
                response = JSONResponse({"error": {"code": "payload_too_large", "message": "Request body exceeds 64 KiB."}},
                                        status_code=413)
                return await response(scope, receive, private_send)
            body.extend(part)
            if not message.get("more_body", False):
                break

        replayed = False
        async def replay_receive():
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        try:
            await self.app(scope, replay_receive, private_send)
        except HTTPException as exc:
            # SDK authentication middleware sits outside Starlette's exception handlers.
            if exc.status_code != 503:
                raise
            response = JSONResponse({"error": {"code": "auth_unavailable", "message": "Authentication is temporarily unavailable."}},
                                    status_code=503)
            await response(scope, replay_receive, private_send)
