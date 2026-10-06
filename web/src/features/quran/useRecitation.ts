"use client";

import { useEffect, useRef, useState } from "react";
import { ayahAt, loadTimings, type Timings } from "@/features/quran/data";

/** One native audio element per surah; text/translation/page changes never replace it. */
export function useRecitation(surah: number, available: boolean, count: number) {
  const audio = useRef<HTMLAudioElement>(null);
  const timings = useRef<Timings | null>(null);
  const request = useRef(0);
  const frame = useRef(0);
  const mode = useRef(-1); // 0: continuous; positive: one verse; -1: never started.
  const finished = useRef(false);
  const intent = useRef(false);
  const seek = useRef<number | null>(null);
  const lastAyah = useRef(0);
  const [state, setState] = useState({ surah, playing: false, buffering: false, error: false, ayah: 0, oneVerse: 0, open: false });
  const current = state.surah === surah ? state : { surah, playing: false, buffering: false, error: false, ayah: 0, oneVerse: 0, open: false };
  const update = (patch: Partial<typeof state>) => setState((s) => ({ ...(s.surah === surah ? s : current), ...patch, surah }));

  useEffect(() => {
    const element = audio.current;
    const requests = request;
    timings.current = null;
    mode.current = -1;
    intent.current = false;
    seek.current = null;
    lastAyah.current = 0;
    return () => {
      requests.current++;
      intent.current = false;
      cancelAnimationFrame(frame.current);
      element?.pause();
    };
  }, [surah, available]);

  const pause = () => {
    request.current++;
    intent.current = false;
    audio.current?.pause();
    cancelAnimationFrame(frame.current);
    lastAyah.current = 0;
    update({ playing: false, buffering: false, ayah: 0 });
  };
  const fail = () => {
    pause();
    update({ error: true });
  };
  const applySeek = () => {
    if (audio.current && seek.current !== null && audio.current.readyState >= 1) {
      audio.current.currentTime = seek.current;
      seek.current = null;
    }
  };

  const start = async (oneVerse: number, selected: number, retry = false) => {
    const element = audio.current;
    if (!available || !element) return;
    if (!retry && intent.current && (oneVerse === 0 || mode.current === oneVerse)) { pause(); return; }
    const id = ++request.current;
    const resume = !retry && mode.current === oneVerse && !finished.current && !element.ended;
    element.pause();
    cancelAnimationFrame(frame.current);
    intent.current = true;
    mode.current = oneVerse;
    finished.current = false;
    update({ playing: false, buffering: true, error: false, oneVerse, ...(oneVerse ? null : { open: true }) });
    try {
      const times = timings.current ?? await loadTimings(surah);
      if (id !== request.current) return;
      // Validate the fetched data before seeking; never invent a missing verse time.
      if (times.length !== count || !times.every((t, i) => Array.isArray(t) && t.length === 2 && t.every(Number.isFinite) && t[0] >= 0 && t[1] > t[0] && (!i || t[0] >= times[i - 1][0]))) throw new Error("Invalid verse timings");
      timings.current = times;
      const verse = oneVerse || selected;
      if (verse && !times[verse - 1]) throw new Error("Missing verse timing");
      if (retry || element.error) element.load();
      if (!resume) seek.current = verse ? times[verse - 1][0] / 1000 : 0;
      applySeek();
      await element.play();
      if (id !== request.current) return;
    } catch {
      if (id === request.current) fail();
    }
  };

  const tick = () => {
    const element = audio.current;
    const times = timings.current;
    if (!element || element.paused || !times) return;
    const ms = element.currentTime * 1000;
    if (mode.current > 0 && ms >= times[mode.current - 1][1]) {
      const end = times[mode.current - 1][1] / 1000;
      finished.current = true;
      pause();
      element.currentTime = end;
      return;
    }
    const ayah = ayahAt(times, ms);
    if (ayah !== lastAyah.current) { lastAyah.current = ayah; update({ ayah }); }
    frame.current = requestAnimationFrame(tick);
  };

  return {
    ...current, audio, start,
    /** Ends the surah player: the next listen starts fresh instead of resuming. */
    stop: () => { pause(); mode.current = -1; update({ open: false, error: false }); },
    retry: (selected: number) => { timings.current = null; void start(Math.max(0, mode.current), selected, true); },
    events: {
      onLoadedMetadata: applySeek,
      onPlay: () => { update({ playing: true }); cancelAnimationFrame(frame.current); tick(); },
      onPlaying: () => update({ buffering: false }),
      onWaiting: () => { if (intent.current) update({ buffering: true }); },
      // Native timeupdate also runs when animation frames are suspended in a background tab.
      onTimeUpdate: () => { cancelAnimationFrame(frame.current); tick(); },
      onPause: () => { cancelAnimationFrame(frame.current); lastAyah.current = 0; update({ playing: false, buffering: false, ayah: 0 }); },
      onEnded: () => { finished.current = true; pause(); },
      onError: fail,
    },
  };
}
