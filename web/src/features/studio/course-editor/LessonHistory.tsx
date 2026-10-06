"use client";

import type { LessonEvent } from "@/features/studio/api";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

/** The timeline of who changed a lesson and when. Shared by the lesson list and the editor. */
export function LessonHistory({ events, onRetry }: { events: LessonEvent[] | "loading" | "error"; onRetry: () => void }) {
  const { t, lang } = useI18n();
  if (events === "loading") return <p role="status" className="mt-4 text-sm text-muted">{t(S.instructor.historyLoading)}</p>;
  if (events === "error") return <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
    <p>{t(S.instructor.historyError)}</p><button type="button" className="mt-2 underline" onClick={onRetry}>{t(S.instructor.retry)}</button>
  </div>;
  if (!events.length) return <p className="mt-4 rounded-xl bg-brand-50/50 p-4 text-sm text-muted">{t(S.instructor.historyEmpty)}</p>;
  return <ol className="studio-timeline mt-5">{events.map((event) => {
    const key = event.kind === "approve" && event.payload.reviewed ? "reviewed" : event.kind;
    const label = S.instructor.events[key as keyof typeof S.instructor.events] ?? S.instructor.events.other;
    return <li key={event.id}>
      <span className="studio-timeline-dot" aria-hidden />
      <p className="break-words text-sm"><span className="text-ink-soft">{t(label)}</span> <span className="font-medium" title={event.actor_id ?? undefined}>{event.actor_email || event.actor_name || (event.actor_id ? `${t(S.instructor.unknownActor)} (${event.actor_id.slice(0, 8)})` : t(S.instructor.unknownActor))}</span></p>
      <time dateTime={event.created_at} className="mt-1 block text-xs text-muted">{new Date(event.created_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" })}</time>
      {event.payload.note && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-brand-50/60 p-3 text-sm text-ink-soft">{event.payload.note}</p>}
    </li>;
  })}</ol>;
}
