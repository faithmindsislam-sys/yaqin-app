"use client";

import { useCallback, useMemo } from "react";
import { readStored, useStored, writeStored } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export type LessonProgress = {
  card: number;
  cardsDone: boolean;
  explained: boolean;
  quizScore: number | null;
  completedAt: string | null;
};
export type ProgressState = {
  lessons: Record<string, LessonProgress>;
  days: string[];
  notes: Record<string, string>;
  pending: string[];
};
export const ACCOUNT_KEY = "yaqin.account";
export const PROGRESS_ERROR = "yaqin.sync.progress";
const GUEST_KEY = "yaqin.progress";
const empty = (): ProgressState => ({ lessons: {}, days: [], notes: {}, pending: [] });
const blank: LessonProgress = { card: 0, cardsDone: false, explained: false, quizScore: null, completedAt: null };
const keyFor = (uid: string | null) => uid ? `${GUEST_KEY}.${uid}` : GUEST_KEY;
const account = () => readStored(ACCOUNT_KEY);
const read = (uid = account()) => parse(readStored(keyFor(uid)));
const write = (state: ProgressState, uid = account()) => writeStored(keyFor(uid), JSON.stringify(state));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function parse(raw: string | null): ProgressState {
  try {
    const data = raw ? JSON.parse(raw) : {};
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const entries = (value: unknown): [string, unknown][] => value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
    return { lessons: Object.fromEntries(entries(data.lessons).flatMap(([id, value]) => {
      if (!value || typeof value !== "object") return [];
      const p = value as Partial<LessonProgress>;
      return [[id, { card: Number.isInteger(p.card) && p.card! >= 0 ? p.card! : 0,
        cardsDone: p.cardsDone === true, explained: p.explained === true,
        quizScore: typeof p.quizScore === "number" && Number.isFinite(p.quizScore) && p.quizScore >= 0 && p.quizScore <= 1 ? p.quizScore : null,
        completedAt: typeof p.completedAt === "string" ? p.completedAt : null }]];
    })), notes: Object.fromEntries(entries(data.notes).flatMap(([id, value]) => typeof value === "string" ? [[id, value]] : [])),
      days: strings(data.days), pending: strings(data.pending) };
  } catch { return empty(); }
}

export function mergeLesson(a: LessonProgress = blank, b: LessonProgress = blank): LessonProgress {
  return { card: Math.max(a.card, b.card), cardsDone: a.cardsDone || b.cardsDone,
    explained: a.explained || b.explained,
    quizScore: a.quizScore == null ? b.quizScore : b.quizScore == null ? a.quizScore : Math.max(a.quizScore, b.quizScore),
    completedAt: a.completedAt ?? b.completedAt };
}

/** Consume guest work once, into this account's separate cache. */
export function activateAccount(uid: string | null) {
  if (account() === uid) return;
  if (uid && account() !== uid) {
    const guest = read(null);
    const own = read(uid);
    for (const [id, p] of Object.entries(guest.lessons)) own.lessons[id] = mergeLesson(own.lessons[id], p);
    own.notes = { ...guest.notes, ...own.notes };
    own.days = [...new Set([...own.days, ...guest.days])].sort();
    own.pending = [...new Set([...own.pending, ...Object.keys(guest.lessons), ...Object.keys(guest.notes)])];
    write(own, uid);
    writeStored(GUEST_KEY, null);
  }
  writeStored(ACCOUNT_KEY, uid);
  writeStored(PROGRESS_ERROR, null);
}

let writes: Promise<void> = Promise.resolve();
function enqueue(lessonId: string) {
  const uid = account();
  if (!uid) return;
  writes = writes.catch(() => {}).then(async () => {
    if (account() !== uid) return;
    await pushLesson(uid, lessonId);
  }).catch((e: unknown) => {
    if (account() === uid) writeStored(PROGRESS_ERROR, e && typeof e === "object" && "message" in e ? String(e.message) : "Progress could not be saved.");
  });
}

async function pushLesson(uid: string, lessonId: string) {
  const sb = supabase();
  if (!sb || account() !== uid) return;
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError) throw authError;
  if (auth.user?.id !== uid || account() !== uid) return;
  const state = read(uid);
  const p = state.lessons[lessonId] ?? blank;
  const before = JSON.stringify([p, state.notes[lessonId]]);
  const { error } = await sb.rpc("save_learning_progress", {
    p_user: uid, p_lesson: lessonId, p_card: p.card, p_cards_done: p.cardsDone, p_explained: p.explained,
    p_quiz_score: p.quizScore, p_completed_at: p.completedAt,
    p_note: state.notes[lessonId] ?? null, p_day: today(),
  });
  if (error) throw error;
  if (account() !== uid) return;
  const current = read(uid);
  if (JSON.stringify([current.lessons[lessonId] ?? blank, current.notes[lessonId]]) === before) {
    current.pending = current.pending.filter((id) => id !== lessonId);
    write(current, uid);
  }
  if (!current.pending.length) writeStored(PROGRESS_ERROR, null);
}

export function updateLesson(lessonId: string, patch: Partial<LessonProgress>) {
  const state = read();
  const next = mergeLesson(state.lessons[lessonId], { ...blank, ...state.lessons[lessonId], ...patch });
  const days = [...new Set([...state.days, today()])].sort();
  write({ ...state, lessons: { ...state.lessons, [lessonId]: next }, days,
    pending: [...new Set([...state.pending, lessonId])] });
  enqueue(lessonId);
}

export function saveNote(lessonId: string, text: string) {
  const state = read();
  write({ ...state, notes: { ...state.notes, [lessonId]: text },
    pending: [...new Set([...state.pending, lessonId])] });
  enqueue(lessonId);
}

/** Merge current remote data, then upload guest work and writes that previously failed. */
export async function hydrateFromRemote(uid = account()) {
  const sb = supabase();
  if (!sb || !uid) return;
  // Wait for local writes to avoid merging a stale read over a new note.
  await writes;
  const [progress, activity] = await Promise.all([
    sb.from("progress").select("*").eq("user_id", uid),
    sb.from("learning_days").select("day").eq("user_id", uid),
  ]);
  if (account() !== uid) return;
  if (progress.error) throw progress.error;
  if (activity.error) throw activity.error;
  const state = read(uid);
  for (const row of progress.data ?? []) {
    state.lessons[row.lesson_id] = mergeLesson(state.lessons[row.lesson_id], {
      card: row.card_index ?? 0, cardsDone: row.cards_done || !!row.completed_at,
      explained: row.explain_back_score != null, quizScore: row.quiz_score,
      completedAt: row.completed_at,
    });
    if (!state.pending.includes(row.lesson_id)) state.notes[row.lesson_id] = row.note ?? "";
  }
  state.days = [...new Set([...state.days, ...(activity.data ?? []).map((r) => r.day as string)])].sort();
  write(state, uid);
  for (const lessonId of state.pending) {
    enqueue(lessonId);
  }
  await writes;
  if (account() !== uid) return;
  if (state.days.length) {
    const { error } = await sb.from("learning_days").upsert(state.days.map((day) => ({ user_id: uid, day })), { onConflict: "user_id,day" });
    if (error) throw error;
  }
  if (account() === uid && !read(uid).pending.length) writeStored(PROGRESS_ERROR, null);
}

export function streak(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  const day = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let n = 0;
  if (!set.has(day())) d.setDate(d.getDate() - 1);
  while (set.has(day())) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

/** Recommended next lesson: the first unfinished one, with "already confident" lessons moved to the end. */
export function nextLesson<T extends { id: string }>(lessons: T[], known: string[], done: ProgressState["lessons"]): T | undefined {
  const ordered = [...lessons.filter((l) => !known.includes(l.id)), ...lessons.filter((l) => known.includes(l.id))];
  return ordered.find((l) => !done[l.id]?.completedAt) ?? ordered[0];
}

export function useProgress(): ProgressState {
  const uid = useStored(ACCOUNT_KEY);
  const raw = useStored(keyFor(uid));
  return useMemo(() => parse(raw), [raw]);
}

export function useLessonProgress(lessonId: string | undefined) {
  const state = useProgress();
  const p = (lessonId && state.lessons[lessonId]) || blank;
  const update = useCallback((patch: Partial<LessonProgress>) => lessonId && updateLesson(lessonId, patch), [lessonId]);
  return [p, update] as const;
}
