import { ApiError, request } from "@/lib/http";
import { normalizeCourse } from "@/features/courses/catalog";
import type { Lesson, Source, Lang, TrackId } from "@/lib/types";
import type { Role } from "@/features/auth/roles";

export function staffLessons() { return request<StaffLesson[]>("/review/courses").then((items) => items.map((item) => normalizeCourse(item) as StaffLesson)); }
export type StaffLesson = Lesson & { author_id?: string | null };
/** One lesson for the editor. The API also returns drafts to their author and to admins. */
export function staffLesson(id: string) { return request<StaffLesson & { sources_by_id?: unknown }>(`/courses/${encodeURIComponent(id)}`).then((item) => normalizeCourse(item) as StaffLesson & { sources_by_id?: unknown }); }
/** AI first draft from a prompt ("Generate with AI"). Drafting can take minutes, so it runs
 *  as a background job: `startDraft` returns a job id at once, and `draftJob` reports its
 *  stage until it ends. A finished draft is already saved as a draft lesson owned by the
 *  teacher (`lesson_id`), so it also appears in the Studio list. `no_sources` means no
 *  approved sources matched the topic; `reason` explains any empty or failed result. */
export type DraftStage = "queued" | "sources" | "writing" | "saving" | "done" | "no_sources" | "failed";
export type DraftJob = {
  job_id: string;
  track?: TrackId | null;
  status: "running" | "done" | "no_sources" | "failed";
  stage: DraftStage;
  attempt: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  lesson_id: string | null;
  lesson: Lesson | null;
  reason?: string | null;
  resumable?: boolean;
  execution?: number;
  max_executions?: number;
};
export function startDraft(prompt: string, lang: Lang, track: TrackId) {
  return request<{ job_id: string; status: string; stage: DraftStage }>("/review/draft", { prompt, lang, track });
}
export function draftJob(jobId: string) { return request<DraftJob>(`/review/draft/${encodeURIComponent(jobId)}`); }
export function resumeDraft(jobId: string) {
  return request<{ job_id: string; status: string; stage: DraftStage }>(`/review/draft/${encodeURIComponent(jobId)}/resume`, {});
}

async function pollDraft(jobId: string, active: () => boolean): Promise<DraftJob | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!active()) return null;
    try {
      return await draftJob(jobId);
    } catch (error) {
      const transient = error instanceof TypeError || (error instanceof ApiError && error.status >= 500 && error.status < 600);
      if (!transient || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return null;
}

/** Keep one generation visible while interrupted executions resume their saved work. */
export async function waitForDraft(jobId: string, active: () => boolean, progress: (job: DraftJob) => void) {
  let current = await pollDraft(jobId, active);
  let continuations = 0;
  while (current && active()) {
    progress(current);
    if (current.status === "failed" && current.resumable && continuations < 2) {
      continuations++;
      await resumeDraft(jobId);
    } else if (current.status !== "running") {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!active()) return null;
    current = await pollDraft(jobId, active);
  }
  return null;
}
export type LessonEvent = {
  id: string; kind: string; actor_id: string | null; actor_name: string | null; actor_email?: string | null; created_at: string;
  payload: { note?: string; reviewed?: boolean; from_role?: Role; to_role?: Role };
};
export function lessonHistory(id: string) { return request<LessonEvent[]>(`/review/${encodeURIComponent(id)}/history`); }
export function archiveLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/archive`, {}); }
export function pendingSources() { return request<Source[]>("/review/sources"); }
/** Puts one Quran verse in the source library (if it is not there yet) and returns the library entry. */
export function quranSource(surah: number, ayah: number) { return request<Source>("/review/sources/quran", { surah, ayah }); }
export function approveSource(id: string) { return request(`/review/sources/${encodeURIComponent(id)}/approve`, {}); }
type Saved = { lesson_id: string; status: string; contributors?: string[] };
export function saveDraft(lesson: unknown) { return request<Saved>("/review/drafts", lesson); }
/** An admin updates a live course in place without an automated review check. */
export function updatePublished(lesson: unknown) { return request<Saved>("/review/published", lesson); }
export function submitDraft(id: string) { return request(`/review/${encodeURIComponent(id)}/submit`, {}); }
export function reviewDecision(id: string, decision: "approve" | "request_changes", note: string) {
  return request(`/review/${encodeURIComponent(id)}/decision`, { decision, note });
}

export function unpublishLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/unpublish`, {}); }
export function deleteLesson(id: string) { return request(`/review/${encodeURIComponent(id)}/delete`, {}); }
