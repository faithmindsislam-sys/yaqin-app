"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import Link from "@/components/RouteLink";
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { Select } from "@/components/Select";
import { apiEnabled, ApiError } from "@/lib/http";
import { curriculum, saveLevels, saveSubjects, saveTrackModules, type Curriculum } from "@/features/studio/curriculum/api";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { canReview } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { lessonLevel, type Bi, type Module, type TrackId } from "@/lib/types";

const C = S.curriculum;
const TABS = ["modules", "subjects", "levels"] as const;
type Editor = { kind: "subject" | "level" | "section"; id?: string | number; title: Bi; levels: number[]; track: TrackId };
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
function moved<T>(items: T[], index: number, target: number): T[] {
  const next = [...items];
  next.splice(target, 0, ...next.splice(index, 1));
  return next;
}

export default function CurriculumPage() {
  const { t } = useI18n();
  return <AppShell title={t(C.title)} sub={t(C.sub)}><Suspense><CurriculumEditor /></Suspense></AppShell>;
}

function CurriculumEditor() {
  const { t, lang } = useI18n();
  const { user, role } = useSession();
  const { refresh } = useContent();
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((value) => value === params.get("tab")) ?? "modules";
  const [data, setData] = useState<Curriculum | null>(null);
  const trackFilter: TrackId | "all" = (["explore", "first-steps", "deepen"] as const).find((id) => id === params.get("track")) ?? "all";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<{ name: string; operation: () => Promise<boolean> } | null>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const toast = useRef<HTMLDivElement>(null);
  const allowed = canReview(role) && !!user && apiEnabled;

  const load = useCallback(async (signal?: AbortSignal) => {
    try { const next = await curriculum(signal); if (!signal?.aborted) { setData(next); setNotice(null); } }
    catch { if (!signal?.aborted) setNotice({ error: true, text: t(C.loadError) }); }
  }, [t]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load updates state after an external API response.
    void load(controller.signal);
    return () => controller.abort();
  }, [allowed, load]);

  useEffect(() => {
    const notification = toast.current;
    if (!notification || !notice) return;
    notification.showPopover();
    const timer = notice.error ? undefined : window.setTimeout(() => setNotice(null), 6000);
    return () => {
      window.clearTimeout(timer);
      if (notification.isConnected) notification.hidePopover();
    };
  }, [notice, editor, confirmation]);

  async function action(operation: () => Promise<Curriculum>) {
    setBusy(true); setNotice(null);
    try {
      setData(await operation());
      await refresh();
      setNotice({ error: false, text: t(C.saved) });
      return true;
    } catch (e) {
      setNotice({ error: true, text: t(e instanceof ApiError && e.code === "stale_curriculum" ? C.stale
        : e instanceof ApiError && e.code === "in_use" ? C.inUse : C.error) });
      return false;
    } finally { setBusy(false); }
  }

  if (!canReview(role) || !user) return <p className="card p-6">{t(C.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(C.unavailable)}</p>;
  const visibleModules = data?.tracks.filter((track) => trackFilter === "all" || track.id === trackFilter)
    .flatMap((track) => track.modules.map((section, sectionIndex) => ({ track, section, sectionIndex }))) ?? [];
  const saveModules = (trackId: TrackId, items: Module[]) => action(() => saveTrackModules(trackId, items, data!.updated_at.tracks));
  const countSubject = (id: string) => data!.courses.filter((c) => c.subject === id).length;
  const countLevel = (id: number) => data!.courses.filter((c) => lessonLevel(c.level) === id).length;

  function openEditor(kind: Editor["kind"], title: Bi = { en: "", ar: "" }, id?: string | number, offered: number[] = [], track: TrackId = trackFilter === "all" ? data?.tracks[0]?.id ?? "explore" : trackFilter) {
    setEditor({ kind, title: { ...title }, id, levels: offered, track }); editDialog.current?.showModal();
  }
  function confirm(name: string, operation: () => Promise<boolean>) {
    setConfirmation({ name, operation }); confirmDialog.current?.showModal();
  }
  async function submitEditor() {
    if (!editor || !data) return;
    let saved = false;
    if (editor.kind === "subject") {
      const item = { id: String(editor.id ?? slug(editor.title.en)), title: editor.title, levels: editor.levels };
      saved = await action(() => saveSubjects(editor.id ? data.subjects.map((s) => s.id === editor.id ? item : s) : [...data.subjects, item], data.updated_at.subjects));
    } else if (editor.kind === "level") {
      const item = { id: Number(editor.id ?? Math.max(0, ...data.levels.map((l) => l.id)) + 1), title: editor.title };
      saved = await action(() => saveLevels(editor.id ? data.levels.map((l) => l.id === editor.id ? item : l) : [...data.levels, item], data.updated_at.levels));
    } else {
      const modules = data.tracks.find((track) => track.id === editor.track)!.modules;
      saved = await saveModules(editor.track, editor.id ? modules.map((m) => m.id === editor.id ? { ...m, title: editor.title } : m)
        : [...modules, { id: `module-${crypto.randomUUID()}`, title: editor.title, lessons: [] }]);
    }
    if (saved) {
      editDialog.current?.close();
      if (editor.kind === "section" && trackFilter !== "all" && trackFilter !== editor.track) router.replace(`/studio/curriculum/?tab=modules&track=${editor.track}`, { scroll: false });
    }
  }

  const orderButtons = (index: number, length: number, operation: (direction: number) => void, name: string) => <>
    <button type="button" className="btn btn-ghost !p-2" disabled={busy || index === 0} aria-label={`${t(C.up)}: ${name}`} onClick={() => operation(-1)}><ArrowUp className="h-4 w-4" aria-hidden /></button>
    <button type="button" className="btn btn-ghost !p-2" disabled={busy || index === length - 1} aria-label={`${t(C.down)}: ${name}`} onClick={() => operation(1)}><ArrowDown className="h-4 w-4" aria-hidden /></button>
  </>;
  const orderSelect = (index: number, length: number, operation: (target: number) => void, name: string) => <label className="curriculum-order">
    <span className="sr-only">{t(C.order)}: {name}</span>
    <select className="input" value={index} disabled={busy || length < 2} onChange={(event) => operation(Number(event.target.value))}>
      {Array.from({ length }, (_, position) => <option key={position} value={position}>{position + 1}</option>)}
    </select>
  </label>;

  return <div className="studio-workspace curriculum-workspace space-y-5">
    <PageBanner title={t(C.title)} sub={t(C.sub)} />
    <div ref={toast} popover="manual" role={notice?.error ? "alert" : "status"} className={`studio-toast ${notice?.error ? "is-error" : "is-success"}`}>
      {notice?.error ? <CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1"><p className="font-semibold">{t(notice?.error ? S.instructor.actionFailed : S.instructor.actionSuccess)}</p><p className="mt-1 text-sm break-words">{notice?.text}</p></div>
      <button type="button" className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => setNotice(null)}><X className="h-4 w-4" aria-hidden /></button>
    </div>
    <aside className="rounded-xl border border-line bg-sky-50 p-4 text-sm">
      <p className="font-semibold text-ink">{t(C.structure)}</p>
      <p className="mt-1 text-ink-soft">{t(C.hierarchyHelp)}</p>
      <p className="mt-2 text-muted">{t(C.hierarchyExample)}</p>
    </aside>
    <nav className="curriculum-nav" aria-label={t(C.title)}>{TABS.map((value) => <button type="button" key={value} disabled={busy} aria-current={tab === value ? "page" : undefined} onClick={() => { setNotice(null); router.push(`/studio/curriculum/?tab=${value}&track=${trackFilter}`, { scroll: false }); }}>{t(C[value])}</button>)}</nav>
    {!data && <p role="status">{t(C.loading)}</p>}

    <dialog ref={editDialog} className="card studio-dialog studio-confirm" aria-labelledby="curriculum-edit-title" onClose={() => setEditor(null)}>
      {editor && <form className="space-y-5 p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void submitEditor(); }}>
        <h2 id="curriculum-edit-title" className="font-serif text-2xl">{t(editor.id ? C.edit : editor.kind === "subject" ? C.addSubject : editor.kind === "level" ? C.addLevel : C.addSection)}</h2>
        {notice?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{notice.text}</p>}
        <fieldset disabled={busy} className="space-y-4">
          {editor.kind === "section" && !editor.id && <Select label={t(C.track)} value={editor.track} options={data?.tracks.map((track) => ({ value: track.id, label: t(track.title) })) ?? []} disabled={busy || !!editor.id} onChange={(value) => setEditor({ ...editor, track: value as TrackId })} />}
          <label className="block text-sm">{t(C.english)}<input className="input mt-1" dir="ltr" lang="en" required maxLength={300} value={editor.title.en} onChange={(e) => setEditor({ ...editor, title: { ...editor.title, en: e.target.value } })} /></label>
          <label className="block text-sm">{t(C.arabic)}<input className="input mt-1" dir="rtl" lang="ar" required maxLength={300} value={editor.title.ar} onChange={(e) => setEditor({ ...editor, title: { ...editor.title, ar: e.target.value } })} /></label>
          {editor.kind === "subject" && <>
            <p className="text-sm text-muted">{t(C.id)}: <bdi>{editor.id ?? slug(editor.title.en)}</bdi><span className="mt-1 block text-xs">{t(C.slugHint)}</span></p>
            <fieldset><legend className="mb-2 text-sm font-medium">{t(C.offered)}</legend><div className="flex flex-wrap gap-4">{data?.levels.map((level) => {
              const used = data.courses.some((c) => c.subject === editor.id && lessonLevel(c.level) === level.id);
              return <label key={level.id} className="flex items-center gap-2 text-sm" title={used ? t(C.used) : undefined}><input type="checkbox" checked={editor.levels.includes(level.id)} disabled={used} onChange={(e) => setEditor({ ...editor, levels: e.target.checked ? [...editor.levels, level.id].sort((a, b) => a - b) : editor.levels.filter((id) => id !== level.id) })} />{t(level.title)}</label>;
            })}</div></fieldset>
          </>}
        </fieldset>
        <div className="flex justify-end gap-3"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => editDialog.current?.close()}>{t(C.cancel)}</button><button type="submit" className="btn btn-primary" disabled={busy || !editor.title.en.trim() || !editor.title.ar.trim() || (editor.kind === "subject" && !editor.id && !slug(editor.title.en))}>{t(C.save)}</button></div>
      </form>}
    </dialog>
    <dialog ref={confirmDialog} className="card studio-dialog studio-confirm" aria-labelledby="curriculum-confirm-title" aria-describedby="curriculum-confirm-description" onClose={() => setConfirmation(null)}>
      <div className="p-6 sm:p-8"><h2 id="curriculum-confirm-title" className="flex items-center gap-3 font-serif text-2xl"><CircleAlert className="h-5 w-5" aria-hidden />{t(C.remove)}</h2>
        <p id="curriculum-confirm-description" className="mt-4 text-sm text-ink-soft">{t(C.confirm)}</p><p className="mt-4 rounded-xl bg-sky-50 p-4 font-medium">{confirmation?.name}</p>
        {notice?.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">{notice.text}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => confirmDialog.current?.close()}>{t(C.cancel)}</button><button type="button" className="btn btn-tint-danger" disabled={busy} onClick={async () => { if (await confirmation?.operation()) confirmDialog.current?.close(); }}>{t(C.remove)}</button></div>
      </div>
    </dialog>

    <div key={tab} className="space-y-5" aria-label={t(C[tab])}>
    {data && tab === "subjects" && <section className="card studio-lessons p-4 sm:p-6" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">{t(C.subjects)}</h2><button type="button" className="btn btn-primary" disabled={busy} onClick={() => openEditor("subject", undefined, undefined, data.levels.map((l) => l.id))}>{t(C.addSubject)}</button></div>
      <p className="mt-3 text-sm text-muted">{t(C.subjectHelp)}</p><div className="overflow-x-auto"><table className="studio-table curriculum-table mt-4"><thead><tr>{[C.subjects, C.offered, C.count, S.instructor.colActions].map((label, i) => <th scope="col" key={i}>{t(label)}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{data.subjects.map((subject) => <tr key={subject.id} className="studio-lesson-row">
          <td><span className="curriculum-name"><bdi lang={lang}>{t(subject.title)}</bdi></span><span className="curriculum-translation"><bdi lang={lang === "en" ? "ar" : "en"}>{subject.title[lang === "en" ? "ar" : "en"]}</bdi></span></td><td data-label={t(C.offered)}><div className="flex flex-wrap gap-1.5">{subject.levels.map((id) => <span key={id} className="curriculum-level" title={t(data.levels.find((l) => l.id === id)?.title)}>{id}</span>)}</div></td><td data-label={t(C.count)}>{countSubject(subject.id)}</td>
          <td><div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => openEditor("subject", subject.title, subject.id, subject.levels)}>{t(C.edit)}</button><button type="button" className="btn btn-tint-danger" disabled={busy || countSubject(subject.id) > 0} title={countSubject(subject.id) ? t(C.used) : undefined} onClick={() => confirm(t(subject.title), () => action(() => saveSubjects(data.subjects.filter((s) => s.id !== subject.id), data.updated_at.subjects)))}>{t(C.delete)}</button></div></td>
        </tr>)}</tbody></table></div>{!data.subjects.length && <p className="studio-empty">{t(C.empty)}</p>}
    </section>}

    {data && tab === "levels" && <section className="card studio-lessons p-4 sm:p-6" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">{t(C.levels)}</h2><button type="button" className="btn btn-primary" disabled={busy} onClick={() => openEditor("level")}>{t(C.addLevel)}</button></div>
      <p className="mt-3 text-sm text-muted">{t(C.levelHelp)}</p><div className="overflow-x-auto"><table className="studio-table curriculum-table curriculum-levels-table mt-4"><thead><tr>{[C.number, C.levels, C.count, S.instructor.colActions].map((label, i) => <th scope="col" key={i}>{t(label)}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{data.levels.map((level) => <tr key={level.id} className="studio-lesson-row">
          <td data-label={t(C.number)}><span className="curriculum-level">{level.id}</span></td><td><span className="curriculum-name"><bdi lang={lang}>{t(level.title)}</bdi></span><span className="curriculum-translation"><bdi lang={lang === "en" ? "ar" : "en"}>{level.title[lang === "en" ? "ar" : "en"]}</bdi></span></td><td data-label={t(C.count)}>{countLevel(level.id)}</td>
          <td><div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => openEditor("level", level.title, level.id)}>{t(C.edit)}</button><button type="button" className="btn btn-tint-danger" disabled={busy || countLevel(level.id) > 0} title={countLevel(level.id) ? t(C.used) : undefined} onClick={() => confirm(t(level.title), () => action(() => saveLevels(data.levels.filter((l) => l.id !== level.id), data.updated_at.levels)))}>{t(C.delete)}</button></div></td>
        </tr>)}</tbody></table></div>{!data.levels.length && <p className="studio-empty">{t(C.empty)}</p>}
    </section>}

    {data && tab === "modules" && <>
      <section className="curriculum-track-toolbar"><div className="min-w-0 w-full sm:max-w-sm"><Select label={t(C.filterTrack)} value={trackFilter} options={[{ value: "all", label: t(C.allTracks) }, ...data.tracks.map((track) => ({ value: track.id, label: t(track.title) }))]} disabled={busy} onChange={(value) => router.replace(`/studio/curriculum/?tab=modules&track=${value}`, { scroll: false })} /></div><button type="button" className="btn btn-primary" disabled={busy || !data.tracks.length} onClick={() => openEditor("section")}>{t(C.addSection)}</button></section>
      <div><h2 className="font-serif text-2xl">{t(C.modules)}</h2><p className="mt-1 text-sm text-muted">{t(C.moduleHelp)}</p></div>
      {visibleModules.map(({ track, section, sectionIndex }) => {
        const trackId = track.id;
        const modules = track.modules;
        const courseIds = section.lessons.filter((id) => data.courses.find((course) => course.id === id)?.status !== "archived");
        const deleteReason = busy ? t(C.saving) : section.lessons.length
          ? t(courseIds.length < section.lessons.length ? C.archivedSection : C.emptySection) : undefined;
        return <section className="card curriculum-module" key={`${trackId}:${section.id}`} aria-busy={busy}>
        <div className="curriculum-module-row">
          <span className="curriculum-module-number" title={t(track.title)}>{sectionIndex + 1}</span>
          <div className="min-w-0 flex-1"><h3 className="font-serif text-xl">{t(section.title)}</h3><p className="mt-1 text-xs text-muted">{t(track.title)} · {t(C.count)}: {courseIds.length}</p></div>
          <div className="curriculum-module-actions flex items-center gap-2">
            {orderButtons(sectionIndex, modules.length, (direction) => void saveModules(trackId, moved(modules, sectionIndex, sectionIndex + direction)), t(section.title))}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => openEditor("section", section.title, section.id, [], trackId)}>{t(C.edit)}</button>
            <span className="tip curriculum-delete" data-tip={deleteReason} tabIndex={deleteReason ? 0 : undefined}
              role={deleteReason ? "group" : undefined} aria-label={deleteReason ? `${t(C.delete)}: ${deleteReason}` : undefined}>
              <button type="button" className="btn btn-tint-danger" disabled={!!deleteReason} onClick={() => confirm(t(section.title), () => saveModules(trackId, modules.filter((module) => module.id !== section.id)))}>{t(C.delete)}</button>
            </span>
          </div>
        </div>
        {!!courseIds.length && <ol className="curriculum-courses" aria-label={`${t(C.courseOrder)}: ${t(section.title)}`}>
          {courseIds.map((id, index) => {
            const course = data.courses.find((course) => course.id === id);
            const name = course ? t(course.title) : id;
            const reorder = (target: number) => void saveModules(trackId, modules.map((module) => module.id === section.id
              ? { ...module, lessons: moved(section.lessons, section.lessons.indexOf(id), section.lessons.indexOf(courseIds[target])) } : module));
            return <li key={id} className="curriculum-course-row">
              {orderSelect(index, courseIds.length, reorder, name)}
              <div className="min-w-0 flex-1">
                <Link href={`/studio/course/?id=${encodeURIComponent(id)}`} className="font-medium text-ink hover:underline">{name}</Link>
                {course?.status && <p className="mt-1 text-xs text-muted">{t(S.instructor.status[course.status])}</p>}
              </div>
              <div className="flex gap-1">{orderButtons(index, courseIds.length, (direction) => reorder(index + direction), name)}</div>
            </li>;
          })}
        </ol>}
      </section>;
      })}
      {!visibleModules.length && <p className="card p-6 text-muted">{t(C.empty)}</p>}
    </>}
    </div>
  </div>;
}
