import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.agents.tutor.agent import TutorAgent
from app.contracts.tutor import AskRequest, ExplainRequest
from app.dependencies import get_tutor_agent
from app.domain.errors import ApiError
from app.domain.users import User
from app.http.auth import current_user, require_role
from app.http.rate_limit import limit

router = APIRouter(prefix="/tutor", dependencies=[Depends(require_role("learner")), Depends(limit)])


@router.post("/ask")
async def ask(req: AskRequest, request: Request, user: User = Depends(current_user),
              service: TutorAgent = Depends(get_tutor_agent)):
    # The learner's own JWT is forwarded to the agent, which forwards it to RAG.
    return await service.ask(req, authorization=request.headers.get("authorization", ""), user_id=user.id)


@router.post("/explain-back")
async def explain_back(req: ExplainRequest, user: User = Depends(current_user),
                       service: TutorAgent = Depends(get_tutor_agent)):
    result = await service.explain_back(req, user_id=user.id)
    if result is None:
        raise ApiError(404, "not_found", f"No course '{req.lesson_id}'.")
    return result


@router.post("/ask/stream")
async def ask_stream(req: AskRequest, request: Request, user: User = Depends(current_user),
                     service: TutorAgent = Depends(get_tutor_agent)):
    """Server-sent events: a `draft` (moderated, citations shown, still being verified) as soon as the
    answer is written, then `final` (the verified answer, or an abstention). Clients that cannot
    stream keep using POST /ask."""
    queue: asyncio.Queue = asyncio.Queue()

    async def on_draft(result):
        await queue.put(("draft", result))

    async def run():
        try:
            result = await service.ask(req, authorization=request.headers.get("authorization", ""),
                                       user_id=user.id, on_draft=on_draft)
            await queue.put(("final", result))
        except Exception as exc:  # noqa: BLE001  the stream must always terminate
            code = getattr(exc, "code", "upstream")
            await queue.put(("error", {"error": {"code": code, "message": "The tutor could not answer."}}))

    async def events():
        task = asyncio.create_task(run())
        try:
            while True:
                kind, payload = await queue.get()
                yield f"event: {kind}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                if kind in ("final", "error"):
                    break
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
