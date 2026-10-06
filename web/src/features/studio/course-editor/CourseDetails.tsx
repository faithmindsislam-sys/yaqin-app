"use client";
import Link from "@/components/RouteLink";
import { Select } from "@/components/Select";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { TrackId } from "@/lib/types";
import { lessonLevel } from "@/lib/types";
import type { StaffLesson } from "@/features/studio/api";
const E = S.editor;
export function CourseDetails({ lesson, locked, busy, direct, moduleChoices, chooseModule, change }: {
  lesson: StaffLesson; locked: boolean; busy: boolean; direct: boolean; moduleChoices: Record<string, string>;
  chooseModule: (id: string, value: string) => void; change: (patch: Partial<StaffLesson>) => void;
}) {
  const { t } = useI18n();
  const { tracks, subjects, levels } = useContent();
  const track = tracks.find((track) => track.id === lesson.tracks[0]);
  const courseModule = track?.modules.find((module) => module.lessons.includes(lesson.id)) ?? track?.modules[0];
  return (
    <fieldset disabled={locked} className="card min-w-0 space-y-4 p-5">
      <h2 className="font-serif text-xl text-ink">{t(E.details)}</h2>
      {/* Admins lock the course for learners, whatever its status: they see the title with "Coming soon". */}
      {direct && <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-brand-50/40 p-4">
        <div className="min-w-0">
          <p id="course-soon-label" className="text-sm font-medium text-ink">{t(S.instructor.comingSoon)}</p>
          <p id="course-soon-hint" className="mt-1 text-xs leading-relaxed text-muted">{t(S.instructor.comingSoonHint)}</p>
        </div>
        <button type="button" role="switch" className="switch" aria-checked={!!lesson.coming_soon} aria-labelledby="course-soon-label" aria-describedby="course-soon-hint"
          disabled={busy} onClick={() => change({ coming_soon: !lesson.coming_soon })} />
      </div>}
      <Select label={t(S.instructor.subject)} value={lesson.subject} disabled={!subjects.length}
        options={subjects.map((subject) => ({ value: subject.id, label: t(subject.title) }))} onChange={(value) => { const offered = subjects.find((s) => s.id === value)?.levels ?? []; change({ subject: value, level: offered.includes(lessonLevel(lesson.level)) ? lesson.level : offered[0] ?? 1 }); }} />
      <Select label={t(S.instructor.track)} value={track?.id ?? ""} disabled={busy || !tracks.length}
        options={tracks.map((track) => ({ value: track.id, label: t(track.title) }))}
        onChange={(value) => {
          if (value === track?.id) return;
          change({ tracks: [value as TrackId], audience_track: value as TrackId });
          chooseModule(value, tracks.find((track) => track.id === value)?.modules[0]?.id ?? "");
        }} />
      <div className="space-y-2 border-t border-line pt-3">
        <p className="studio-field-label">{t(S.curriculum.placement)}</p>
        <Select label={t(S.dash.module)} value={(track && moduleChoices[track.id]) || courseModule?.id || ""}
          disabled={!direct || busy || !track?.modules.length}
          options={(track?.modules ?? []).map((module) => ({ value: module.id, label: t(module.title) }))}
          onChange={(value) => { if (track) chooseModule(track.id, value); }} />
        <p className="text-xs text-muted">{t(E.moduleHint)}</p>
        {direct && <Link href={`/studio/curriculum/?track=${track?.id ?? "explore"}`} className="inline-block text-sm text-brand-700 hover:underline">{t(S.curriculum.manageModules)}</Link>}
      </div>
      <Select label={t(S.instructor.level)} value={String(lessonLevel(lesson.level))} disabled={!subjects.find((s) => s.id === lesson.subject)?.levels.length}
        options={levels.filter((level) => subjects.find((s) => s.id === lesson.subject)?.levels.includes(level.id)).map((level) => ({ value: String(level.id), label: t(level.title) }))}
        onChange={(value) => change({ level: Number(value) })} />
      <label className="block">
        <span className="studio-field-label">{t(E.minutes)}</span>
        <input type="number" className="input" min={0} max={180} aria-label={t(E.minutes)} value={lesson.minutes}
          onChange={(event) => change({ minutes: Math.max(0, Math.min(180, Math.round(Number(event.target.value)) || 0)) })} />
      </label>
    </fieldset>
);
}
