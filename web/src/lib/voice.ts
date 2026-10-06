"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBrowserValue } from "@/lib/store";
import type { StreamPlayer } from "@/lib/speech";
import type { Lang } from "@/lib/types";

/* ---------- Narration ---------- */

// Narration plays pre-rendered audio when a page has one (served from the CDN); otherwise it streams
// from the speech API (Gemini TTS), with the browser voice as the last fallback.
// Otherwise it falls back to the browser's voice. Recitation is never synthesized:
// callers pass explanation text only, never ayah or hadith text.

// Every message/card has its own useNarration() instance, but only one narration may play at a
// time across the whole page: starting one must stop whichever instance (if any) is currently
// playing elsewhere. This holds the currently-playing instance's id and its own stop function.
let activeNarration: { id: object; stop: () => void } | null = null;

export function useNarration() {
  const id = useRef({}).current;
  const audio = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<StreamPlayer | null>(null);
  const aborter = useRef<AbortController | null>(null);
  // Synchronous view of "a narration is active": React state lags a render behind, so two
  // quick clicks could both see playing === false. Each play() gets a session id; any step that
  // finishes after a newer play() or a stop() exits instead of starting audio.
  const active = useRef(false);
  const session = useRef(0);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    session.current += 1;
    active.current = false;
    if (activeNarration?.id === id) activeNarration = null;
    audio.current?.pause();
    audio.current = null;
    stream.current?.stop();
    stream.current = null;
    aborter.current?.abort();
    aborter.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlaying(false);
  }, [id]);

  // A narration ending on its own (onended/onend), rather than via an explicit stop() call,
  // still must release the global "who is playing" slot so a later play() elsewhere doesn't
  // think this instance is still active.
  const finish = useCallback(() => {
    active.current = false;
    if (activeNarration?.id === id) activeNarration = null;
    setPlaying(false);
  }, [id]);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    async (opts: {
      src?: string;
      fetchStream?: (signal: AbortSignal) => Promise<StreamPlayer>;
      fetchSrc?: () => Promise<string>;
      text: string;
      lang: Lang;
    }) => {
      stop();
      // Claim the single page-wide narration slot: whoever held it before (a different
      // message's or card's button) is stopped now, so at most one voice ever plays.
      activeNarration?.stop();
      activeNarration = { id, stop };
      const mine = session.current;
      active.current = true;
      setPlaying(true);
      const stale = () => session.current !== mine;
      if (opts.src) {
        const ok = await fetch(opts.src, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
        if (stale()) return;
        if (ok) {
          const a = new Audio(opts.src);
          audio.current = a;
          a.onended = finish;
          setPlaying(true);
          await a.play().catch(finish);
          return;
        }
      }
      // Streaming narration: audio starts as the bytes arrive. Show the stop state at once,
      // then fall through to the fetched URL / browser voice if the stream never plays.
      if (opts.fetchStream) {
        const controller = new AbortController();
        aborter.current = controller;
        try {
          const player = await opts.fetchStream(controller.signal);
          if (stale()) {
            player.stop();
            return;
          }
          stream.current = player;
          player.onended = finish;
          await player.start();
          return;
        } catch {
          stream.current?.stop();
          stream.current = null;
          aborter.current = null;
          // A user stop() aborts this controller mid-startup; don't fall through and
          // start the fallback voice after the learner has asked us to stop.
          if (controller.signal.aborted) return;
        }
      }
      // Server-generated narration: show the loading/stop state immediately, then play the
      // fetched URL. Any failure falls through to the browser voice below.
      if (opts.fetchSrc) {
        try {
          const url = await opts.fetchSrc();
          if (stale()) return;
          const a = new Audio(url);
          audio.current = a;
          a.onended = finish;
          await a.play();
          return;
        } catch {
          if (typeof window !== "undefined") window.speechSynthesis?.cancel();
          audio.current = null;
        }
      }
      if (stale()) return;
      const synth = window.speechSynthesis;
      if (!synth || !opts.text) { finish(); return; }
      const u = new SpeechSynthesisUtterance(opts.text);
      u.lang = opts.lang === "ar" ? "ar-SA" : "en-US";
      const voice = synth.getVoices().find((v) => v.lang.startsWith(opts.lang === "ar" ? "ar" : "en"));
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = finish;
      synth.speak(u);
    },
    [id, stop, finish],
  );

  /** One button, one behaviour: the first click starts; a click on the button that is currently
   * playing stops it; a click on any other button stops that one and starts this one instead
   * (play() already stops whichever instance held the page-wide slot). */
  const toggle = useCallback(
    (opts: Parameters<typeof play>[0]) => {
      if (active.current) return stop();
      void play(opts);
    },
    [play, stop],
  );

  return { play, stop, toggle, playing };
}

/* ---------- Dictation ---------- */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser speech-to-text. Transcripts stay on the page until the learner submits them. */
export function useDictation(lang: Lang, onText: (text: string) => void) {
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const supported = useBrowserValue(() => !!getRecognition(), true) && !unsupported;

  useEffect(() => () => {
    const current = rec.current;
    rec.current = null;
    if (current) {
      current.onresult = current.onend = current.onerror = null;
      current.stop();
    }
  }, [lang, onText]);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) return setUnsupported(true);
    if (rec.current) {
      rec.current.onresult = rec.current.onend = rec.current.onerror = null;
      rec.current.stop();
    }
    const r = new Ctor();
    r.lang = lang === "ar" ? "ar-SA" : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      // Silence or a manual stop is normal. Anything else (mic blocked, no speech service) means voice can't work here.
      if (e.error !== "no-speech" && e.error !== "aborted") setUnsupported(true);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang, onText]);

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  return { start, stop, listening, supported };
}
