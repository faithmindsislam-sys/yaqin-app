"""Narrate course pages and tutor answers as cached MP3 audio."""

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse, StreamingResponse

from app.contracts.speech import SpeechRequest
from app.dependencies import get_speech_service
from app.http.auth import require_role
from app.http.rate_limit import limit
from app.services.speech_service import SpeechService

router = APIRouter(dependencies=[Depends(require_role("learner")), Depends(limit)])


@router.post("/speech")
async def speech(req: SpeechRequest, service: SpeechService = Depends(get_speech_service)):
    return await service.narrate(req.text, req.lang, req.voice)


@router.post("/speech/stream")
async def speech_stream(req: SpeechRequest, service: SpeechService = Depends(get_speech_service)):
    """Audio that starts within about a second. A cached narration redirects to its MP3;
    otherwise a WAV stream is produced live and cached for next time."""
    cached = await service.cached_url(req.text, req.lang, req.voice)
    if cached:
        return RedirectResponse(cached, status_code=307, headers={"X-Speech-Cache": "hit", "Cache-Control": "no-store"})
    return StreamingResponse(service.stream_wav(req.text, req.lang, req.voice), media_type="audio/wav",
                             headers={"Cache-Control": "no-store", "X-Speech-Cache": "miss", "X-Accel-Buffering": "no"})
