import { apiEnabled, BASE, getAccessToken, request } from "@/lib/http";
import type { Lang } from "@/lib/types";

/** Generates (or returns a cached) narration audio URL for the given text. */
export async function speak(text: string, lang: Lang, voice: "male" | "female"): Promise<string> {
  const { url } = await request<{ url: string }>("/speech", { text, lang, voice });
  return url;
}

/** A narration that has already begun fetching: start() begins playback, stop() tears it down. */
export type StreamPlayer = { start(): Promise<void>; stop(): void; onended?: () => void };

const PCM_RATE = 24000;
const WAV_HEADER_BYTES = 44;

type AudioContextCtor = new (options?: { sampleRate?: number }) => AudioContext;

function audioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("audio_unsupported");
  return Ctor;
}

/** A player for the cached MP3 the stream endpoint redirected to. */
function redirectPlayer(url: string): StreamPlayer {
  const audio = new Audio(url);
  const player: StreamPlayer = {
    async start() {
      audio.onended = () => player.onended?.();
      await audio.play();
    },
    stop() {
      audio.onended = null;
      audio.pause();
    },
  };
  return player;
}

/** A player that decodes the live 24 kHz mono PCM stream and schedules it back to back. */
function pcmPlayer(controller: AbortController, body: ReadableStream<Uint8Array>): StreamPlayer {
  const Ctor = audioContextCtor();
  // Prefer a native 24 kHz context; fall back to the default rate and let AudioBuffers resample.
  let context: AudioContext;
  try {
    context = new Ctor({ sampleRate: PCM_RATE });
  } catch {
    context = new Ctor();
  }
  const sources = new Set<AudioBufferSourceNode>();
  let nextTime = 0;
  let scheduledAny = false;
  let streamEnded = false;
  let stopped = false;
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  const player: StreamPlayer = {
    async start() {
      // The context is created after awaits in the click handler, so Safari (and a stale
      // Chrome gesture) start it suspended; resume before scheduling or nothing is audible
      // and currentTime never advances (which would also leave `playing` stuck true).
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      if (stopped) return;
      await pump();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      controller.abort();
      if (endTimer) clearTimeout(endTimer);
      endTimer = null;
      for (const node of sources) {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // already stopped
        }
      }
      sources.clear();
      context.close().catch(() => undefined);
    },
  };

  function maybeFinish() {
    if (stopped || !streamEnded || sources.size > 0) return;
    const remaining = Math.max(0, (nextTime - context.currentTime) * 1000);
    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      if (stopped) return;
      stopped = true;
      context.close().catch(() => undefined);
      player.onended?.();
    }, remaining + 20);
  }

  function schedule(samples: Float32Array) {
    if (stopped || samples.length === 0) return;
    const buffer = context.createBuffer(1, samples.length, PCM_RATE);
    buffer.getChannelData(0).set(samples);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    if (nextTime < context.currentTime + 0.15) nextTime = context.currentTime + 0.15;
    node.onended = () => {
      sources.delete(node);
      maybeFinish();
    };
    sources.add(node);
    node.start(nextTime);
    nextTime += buffer.duration;
    scheduledAny = true;
  }

  async function pump() {
    const reader = body.getReader();
    let skipped = 0;
    let leftover: number | null = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (stopped) break;
        let bytes: Uint8Array = value;
        if (skipped < WAV_HEADER_BYTES) {
          const drop = Math.min(WAV_HEADER_BYTES - skipped, bytes.length);
          skipped += drop;
          bytes = bytes.subarray(drop);
          if (bytes.length === 0) continue;
        }
        // Carry an odd trailing byte so Int16 samples never straddle two reads.
        let pcm = bytes;
        if (leftover !== null) {
          const merged = new Uint8Array(bytes.length + 1);
          merged[0] = leftover;
          merged.set(bytes, 1);
          pcm = merged;
          leftover = null;
        }
        if (pcm.length % 2 === 1) {
          leftover = pcm[pcm.length - 1];
          pcm = pcm.subarray(0, pcm.length - 1);
        }
        if (pcm.length === 0) continue;
        const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        const samples = new Float32Array(pcm.length / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 0x8000;
        schedule(samples);
      }
      streamEnded = true;
      if (!scheduledAny && !stopped) throw new Error("speech_stream_empty");
      maybeFinish();
    } catch (err) {
      if (stopped) return;
      if (!scheduledAny) {
        player.stop();
        throw err;
      }
      streamEnded = true;
      maybeFinish();
    }
  }

  return player;
}

/**
 * Fetches the streaming narration endpoint and returns a player ready to start.
 * A cached narration redirects to its MP3; otherwise live 24 kHz mono PCM is scheduled
 * as it arrives. Throws if the backend is disabled or the stream fails before any audio.
 */
export async function speakStream(
  text: string,
  lang: Lang,
  voice: "male" | "female",
  signal: AbortSignal,
): Promise<StreamPlayer> {
  if (!apiEnabled) throw new Error("backend_unavailable");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api/speech/stream`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, lang, voice }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = data?.error ?? {};
    throw new Error(err.message ?? res.statusText ?? "speech_stream_failed");
  }
  if (res.redirected) {
    // Cached MP3: we only need the final URL, so drop the body.
    res.body?.cancel().catch(() => undefined);
    return redirectPlayer(res.url);
  }
  if (!res.body) throw new Error("speech_stream_no_body");
  const controller = new AbortController();
  signal.addEventListener("abort", () => controller.abort(), { once: true });
  return pcmPlayer(controller, res.body);
}
