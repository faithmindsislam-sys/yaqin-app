"""POST /api/speech: auth, validation, availability, caching and voice mapping."""

import pytest

from app.gateways.resource_store import ResourceStore
from app.gateways.speech_gateway import SpeechClip, SpeechGateway
from app.services.speech_service import SpeechService

VOICES = "en:male=Charon,en:female=Kore,ar:male=Enceladus,ar:female=Aoede"


class FakeSpeechGateway(SpeechGateway):
    def __init__(self):
        self.calls = []

    async def synthesize(self, text, *, voice_name):
        self.calls.append({"text": text, "voice_name": voice_name})
        return SpeechClip(mp3=b"ID3-fake-mp3", duration_ms=1234)

    async def close(self):
        pass

    async def stream_pcm(self, text, *, voice_name):
        self.calls.append(("stream", text, voice_name))
        for chunk in (b"\x01\x02" * 100, b"\x03\x04" * 100):
            yield chunk

    async def pcm_to_mp3(self, pcm, rate=24000):
        return b"ID3-from-" + str(len(pcm)).encode()


class FakeStore(ResourceStore):
    def __init__(self, *, present=False):
        self.present = present
        self.puts = []

    async def exists(self, key):
        return self.present

    async def put_mp3(self, key, body):
        self.puts.append((key, body))


def install(client, monkeypatch, *, present=False, enabled=True):
    from app.main import app

    gateway = FakeSpeechGateway()
    store = FakeStore(present=present)
    service = SpeechService(gateway, store, model="gemini-3.8-flash-lite-tts", voices=VOICES, enabled=enabled)
    monkeypatch.setattr(app.state.services, "speech", service)
    return gateway, store


def test_anonymous_is_rejected(client):
    r = client.post("/api/speech", json={"text": "Hello", "lang": "en", "voice": "male"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_bad_input_is_rejected(client, learner):
    r = client.post("/api/speech", json={"text": "", "lang": "en", "voice": "male"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"


def test_scripture_markers_rejected(client, learner, monkeypatch):
    install(client, monkeypatch)
    r = client.post("/api/speech", json={"text": "See [[quran:5:6]]", "lang": "en", "voice": "male"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"


def test_disabled_returns_503(client, learner, monkeypatch):
    install(client, monkeypatch, enabled=False)
    r = client.post("/api/speech", json={"text": "Hello", "lang": "en", "voice": "male"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "speech_unavailable"


def test_cache_hit_returns_cached_without_calling_gateway(client, learner, monkeypatch):
    gateway, store = install(client, monkeypatch, present=True)
    r = client.post("/api/speech", json={"text": "Hello world", "lang": "en", "voice": "male"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cached"] is True and body["duration_ms"] is None
    assert body["url"].startswith("/resources/speech/") and body["url"].endswith(".mp3")
    assert gateway.calls == [] and store.puts == []


def test_cache_miss_generates_and_uploads(client, learner, monkeypatch):
    gateway, store = install(client, monkeypatch, present=False)
    r = client.post("/api/speech", json={"text": "Hello world", "lang": "en", "voice": "male"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cached"] is False and body["duration_ms"] == 1234
    assert len(gateway.calls) == 1
    assert len(store.puts) == 1
    key, payload = store.puts[0]
    assert key == body["url"].removeprefix("/") and payload == b"ID3-fake-mp3"


@pytest.mark.parametrize(
    "lang,voice,expected",
    [("en", "male", "Charon"), ("en", "female", "Kore"), ("ar", "male", "Enceladus"), ("ar", "female", "Aoede")],
)
def test_voice_mapping_by_lang_and_gender(client, learner, monkeypatch, lang, voice, expected):
    gateway, _ = install(client, monkeypatch, present=False)
    r = client.post("/api/speech", json={"text": "A line to read", "lang": lang, "voice": voice})
    assert r.status_code == 200, r.text
    assert gateway.calls[0]["voice_name"] == expected


def test_key_is_stable_for_normalised_text(client, learner, monkeypatch):
    gateway, store = install(client, monkeypatch, present=False)
    first = client.post("/api/speech", json={"text": "Hello   world", "lang": "en", "voice": "male"}).json()
    second = client.post("/api/speech", json={"text": "Hello world", "lang": "en", "voice": "male"}).json()
    assert first["url"] == second["url"]


def test_stream_redirects_to_the_cached_mp3(client, learner, monkeypatch):
    gateway, _ = install(client, monkeypatch, present=True)
    r = client.post("/api/speech/stream", json={"text": "Wudu prepares you for prayer.", "lang": "en", "voice": "male"}, follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"].startswith("/resources/speech/") and r.headers["x-speech-cache"] == "hit"
    assert not [c for c in gateway.calls if c[0] == "stream"]


def test_stream_sends_wav_then_caches_mp3(client, learner, monkeypatch):
    gateway, store = install(client, monkeypatch, present=False)
    r = client.post("/api/speech/stream", json={"text": "Wudu prepares you for prayer.", "lang": "en", "voice": "male"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("audio/wav") and r.headers["x-speech-cache"] == "miss"
    body = r.content
    assert body[:4] == b"RIFF" and body[8:12] == b"WAVE" and body[44:] == b"\x01\x02" * 100 + b"\x03\x04" * 100
    # The MP3 is written after the stream ends, from the complete PCM.
    for _ in range(50):
        if store.puts:
            break
        __import__("time").sleep(0.02)
    assert [body for _, body in store.puts] == [b"ID3-from-400"], store.puts
