"use client";

import Link from "@/components/RouteLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, BookCheck, BookOpen, CheckCircle2, CircleAlert, Clock3, Ellipsis, EyeOff, FilePenLine, History, MessageSquare, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Select } from "@/components/Select";
import { TRACK_META } from "@/features/courses/track-meta";
import { CardView } from "@/features/learning/CardView";
import { ComingSoonChip } from "@/features/studio/ComingSoonChip";
import { LessonHistory } from "@/features/studio/course-editor/LessonHistory";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { apiEnabled } from "@/lib/http";
import { staffLessons, submitDraft, reviewDecision, unpublishLesson, deleteLesson, archiveLesson, lessonHistory, type LessonEvent, type StaffLesson } from "@/features/studio/api";
import { useContent } from "@/features/courses/ContentProvider";
import { COURSE_IMAGES_ENABLED } from "@/features/courses/catalog";
import { isTrackId, lessonLevel, type Lesson, type TrackId } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { canReview, isStaff } from "@/features/auth/roles";

const STATUSES = ["published", "in_review", "draft", "archived"] as const;
const SORTS = ["default", "titleAsc", "titleDesc", "levelAsc", "levelDesc"] as const;
type Filters = { trackFilter: TrackId | "all"; moduleFilter: string; subjectFilter: string; levelFilter: number | "all"; statusFilter: Lesson["status"] | "all"; search: string };
const DEFAULT_FILTERS: Filters = { trackFilter: "all", moduleFilter: "all", subjectFilter: "all", levelFilter: "all", statusFilter: "all", search: "" };

function readFilters(key: string | null): Filters {
  try {
    const saved = JSON.parse(key ? sessionStorage.getItem(key) ?? "null" : "null");
    return {
      trackFilter: isTrackId(saved?.trackFilter) ? saved.trackFilter : "all",
      moduleFilter: typeof saved?.moduleFilter === "string" ? saved.moduleFilter : "all",
      subjectFilter: typeof saved?.subjectFilter === "string" ? saved.subjectFilter : "all",
      levelFilter: Number.isInteger(saved?.levelFilter) && saved.levelFilter > 0 ? saved.levelFilter : "all",
      statusFilter: STATUSES.includes(saved?.statusFilter) ? saved.statusFilter : "all",
      search: typeof saved?.search === "string" ? saved.search : "",
    };
  } catch { return DEFAULT_FILTERS; }
}

const STATUS_ICONS = { published: BookCheck, in_review: Clock3, draft: FilePenLine, archived: Archive };
const editorLink = (id: string) => `/studio/course/?id=${encodeURIComponent(id)}`;
/** The "Coming soon" setting is on: learners see the title locked (an archived course is hidden anyway). */
const shownSoon = (lesson: Lesson) => !!lesson.coming_soon && lesson.status !== "archived";

export default function StudioPage() {
  const { t } = useI18n();
  const { user } = useSession();
  return (
    <AppShell title={t(S.instructor.title)} sub={t(S.instructor.sub)}>
      <Workspace key={user?.id ?? "guest"} />
    </AppShell>
  );
}

/** Fills the styled tooltip of a `.tip` wrapper, only when the text inside is cut with "…". */
function tip({ currentTarget: el }: { currentTarget: HTMLElement }) {
  if (el.parentElement) el.parentElement.dataset.tip = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight ? el.textContent ?? "" : "";
}

function Workspace() {
  const { t, lang } = useI18n();
  const { role, user } = useSession();
  const { tracks, subjects, levels, refresh } = useContent();
  const filterKey = user ? `yaqin.studio.filters.${user.id}` : null;
  const [filters, setFilters] = useState(() => readFilters(filterKey));
  const { moduleFilter, statusFilter, search } = filters;
  const trackFilter = tracks.some((track) => track.id === filters.trackFilter) ? filters.trackFilter : "all";
  const subjectFilter = subjects.some((subject) => subject.id === filters.subjectFilter) ? filters.subjectFilter : "all";
  const levelFilter = levels.some((level) => level.id === filters.levelFilter) ? filters.levelFilter : "all";
  const moduleOptions = tracks.find((track) => track.id === trackFilter)?.modules ?? [];
  const selectedModule = moduleOptions.find((module) => module.id === moduleFilter);
  const [staff, setStaff] = useState<StaffLesson[]>([]);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StaffLesson | null>(null);
  const [history, setHistory] = useState<LessonEvent[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("ready");
  const historyRequest = useRef(0);
  const [pageSize, setPageSize] = useState(5);
  const [confirmation, setConfirmation] = useState<{ lesson: Lesson; label: string; description: string; operation: () => Promise<unknown>; success: string; danger: boolean } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const cancelConfirmation = useRef<HTMLButtonElement>(null);
  // The page of the lesson that is open in the lesson dialog.
  const [shown, setShown] = useState(0);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("default");
  const toast = useRef<HTMLDivElement>(null);
  const trackOptions = tracks.map((track) => ({ value: track.id, label: t(track.title) }));
  const levelOptions = levels.map((level) => ({ value: String(level.id), label: t(level.title) }));

  useEffect(() => {
    if (!filterKey || !isStaff(role)) return;
    try {
      if (JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)) sessionStorage.removeItem(filterKey);
      else sessionStorage.setItem(filterKey, JSON.stringify(filters));
    } catch { /* Filters still work in memory when browser storage is blocked. */ }
  }, [filterKey, filters, role]);

  const load = useCallback(async () => {
    if (!isStaff(role) || !user || !apiEnabled) return;
    try {
      setStaff(await staffLessons());
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
  }, [role, user, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the staff API; updates happen after its promise resolves.
  useEffect(() => { void load(); }, [load]);
  // The editor leaves its success message here when it returns to this list (see save() in studio/lesson/page.tsx).
  useEffect(() => {
    try {
      const done = sessionStorage.getItem("yaqin-studio-toast");
      if (!done) return;
      sessionStorage.removeItem("yaqin-studio-toast");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads browser storage once, after the page is on screen.
      setMessage(done);
    } catch { /* storage is blocked: no message */ }
  }, []);

  useEffect(() => {
    const notification = toast.current;
    if (!notification || (!message && !error)) return;
    notification.showPopover();
    const timer = window.setTimeout(() => { setMessage(null); setError(null); }, 6000);
    return () => { window.clearTimeout(timer); if (notification.isConnected) notification.hidePopover(); };
  }, [message, error, preview]);

  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await operation();
      await load(); await refresh(); setMessage(success);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); return false; }
    finally { setBusy(false); }
  }
  async function loadHistory(id: string) {
    const request = ++historyRequest.current;
    setHistory([]); setHistoryState("loading");
    try {
      const events = await lessonHistory(id);
      if (request === historyRequest.current) { setHistory(events); setHistoryState("ready"); }
    } catch {
      if (request === historyRequest.current) setHistoryState("error");
    }
  }

  function openLesson(lesson: StaffLesson) {
    setPreview(lesson); setShown(0); setError(null);
    void loadHistory(lesson.id);
    dialog.current?.showModal();
  }

  function changeFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch })); setPage(1);
  }

  function resetFilters() { changeFilters(DEFAULT_FILTERS); }

  function hide(lesson: Lesson) {
    confirm(lesson, t(S.instructor.hide), t(S.instructor.hideReviewed),
      () => unpublishLesson(lesson.id), t(S.instructor.hidden));
  }

  function confirm(lesson: Lesson, label: string, description: string, operation: () => Promise<unknown>, success: string, danger = false) {
    setConfirmation({ lesson, label, description, operation, success, danger });
    confirmDialog.current?.showModal();
    cancelConfirmation.current?.focus();
  }

  const byTitle = (a: Lesson, b: Lesson) => t(a.title).localeCompare(t(b.title), lang);
  const byLevel = (a: Lesson, b: Lesson) => lessonLevel(a.level) - lessonLevel(b.level);
  const order = {
    default: (a: Lesson, b: Lesson) => Number(b.status === "published") - Number(a.status === "published"),
    titleAsc: byTitle, titleDesc: (a: Lesson, b: Lesson) => byTitle(b, a),
    levelAsc: byLevel, levelDesc: (a: Lesson, b: Lesson) => byLevel(b, a),
  }[sort];
  const filtered = staff.filter((lesson) => (trackFilter === "all" || lesson.tracks.includes(trackFilter))
    && (!selectedModule || selectedModule.lessons.includes(lesson.id))
    && (subjectFilter === "all" || lesson.subject === subjectFilter)
    && (levelFilter === "all" || lessonLevel(lesson.level) === levelFilter) && (statusFilter === "all" || lesson.status === statusFilter)
    && (!search.trim() || Object.values(lesson.title).some((title) => title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))))
    .sort(order);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = (currentPage - 1) * pageSize;
  const visible = filtered.slice(first, first + pageSize);

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  const notice = <div ref={toast} popover="manual" role={error ? "alert" : "status"} className={`studio-toast ${error ? "is-error" : "is-success"}`}>
    {error ? <CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />}
    <div className="min-w-0 flex-1"><p className="font-semibold">{t(error ? S.instructor.actionFailed : S.instructor.actionSuccess)}</p><p className="mt-1 text-sm break-words">{error || message}</p></div>
    <button type="button" className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => { setError(null); setMessage(null); }}><X className="h-4 w-4" aria-hidden /></button>
  </div>;

  return (
    <div className="studio-workspace space-y-6">
      <PageBanner title={t(S.instructor.title)} sub={t(S.instructor.sub)} />
      {!canReview(role) && <p className="text-sm text-muted">{t(S.instructor.reviewMode)}</p>}

      {!preview && notice}
      <dialog ref={confirmDialog} className="card studio-dialog studio-confirm" aria-labelledby="studio-confirm-title" aria-describedby="studio-confirm-description"
        onClose={() => setConfirmation(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className={`studio-confirm-icon${confirmation?.danger ? " is-danger" : ""}`}><CircleAlert className="h-6 w-6" aria-hidden /></span>
            <button type="button" className="btn btn-ghost btn-close !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => confirmDialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <h2 id="studio-confirm-title" className="mt-5 font-serif text-2xl">{confirmation?.label}</h2>
          {confirmation && <p className="mt-2 font-medium text-ink">{t(confirmation.lesson.title)}</p>}
          <p id="studio-confirm-description" className="mt-3 text-sm leading-relaxed text-ink-soft">{confirmation?.description}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button ref={cancelConfirmation} type="button" className="btn btn-ghost" onClick={() => confirmDialog.current?.close()}>{t(S.instructor.closeForm)}</button>
            <button type="button" className={`btn ${confirmation?.danger ? "btn-tint-danger" : "btn-primary"}`} disabled={!confirmation || busy} onClick={() => {
              if (!confirmation) return;
              confirmDialog.current?.close();
              void action(confirmation.operation, confirmation.success);
            }}>{confirmation?.label}</button>
          </div>
        </div>
      </dialog>
      <dialog ref={dialog} className="card studio-dialog" aria-labelledby="studio-lesson-title"
        onClose={() => { historyRequest.current++; setPreview(null); }}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        {preview && notice}
        <header className="flex items-center justify-between gap-3 border-b border-line p-6">
          <h2 id="studio-lesson-title" className="font-serif text-2xl">{preview && t(preview.title)}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {preview && (preview.author_id === user.id || canReview(role)) && <Link href={editorLink(preview.id)} className="btn btn-ghost !min-h-10 !px-3 !py-2 text-sm"><FilePenLine className="h-4 w-4" aria-hidden />{t(S.instructor.edit)}</Link>}
            <button className="btn btn-ghost btn-close !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => dialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
          </div>
        </header>
        {preview && <div className="space-y-6 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {COURSE_IMAGES_ENABLED && preview.cover && <img src={preview.cover} alt="" className="aspect-[16/6] w-full rounded-2xl object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip studio-status status-${preview.status}`}>{t(S.instructor.status[preview.status])}</span>
            {shownSoon(preview) && <ComingSoonChip />}
            <span className="text-sm text-muted">{preview.tracks.map((id) => t(tracks.find((track) => track.id === id)?.title)).join(" · ")} · {t(levels.find((l) => l.id === lessonLevel(preview.level))?.title)} · {preview.minutes} {t(S.instructor.minutes)}</span>
          </div>
          {!!preview.contributors?.length && <p className="text-sm text-muted">{t(S.editor.contributors)}: <span className="text-ink-soft">{preview.contributors.join(lang === "ar" ? "، " : ", ")}</span></p>}
          <p className="text-ink-soft">{t(preview.summary)}</p>
          {/* One page at a time, as a learner sees it (the same view as "View lesson" in the editor). */}
          <nav className="editor-pages" aria-label={t(S.editor.pages)}>
            <button type="button" className="rich-tool" title={t(S.instructor.previousPage)} aria-label={t(S.instructor.previousPage)} disabled={shown <= 0} onClick={() => setShown(shown - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            {preview.cards.map((card, index) => <button key={card.id} type="button" className="editor-page"
              aria-current={index === shown ? "page" : undefined} aria-label={`${t(S.editor.section)} ${index + 1}`} onClick={() => setShown(index)}>{index + 1}</button>)}
            <button type="button" className="rich-tool" title={t(S.instructor.nextPage)} aria-label={t(S.instructor.nextPage)} disabled={shown >= preview.cards.length - 1} onClick={() => setShown(shown + 1)}><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
          </nav>
          {preview.cards[shown] && <div className="rounded-2xl border border-line p-4 sm:p-6"><CardView key={preview.cards[shown].id} lesson={preview} card={preview.cards[shown]} /></div>}
          {preview.quiz?.length ? <section className="space-y-3">
            <h3 className="font-serif text-xl">{t(S.lesson.quizTitle)}</h3>
            {preview.quiz.map((question) => <div key={question.id} className="rounded-xl border border-line p-4 text-sm">
              <p className="font-medium">{t(question.question)}</p>
              <ol className="mt-2 list-decimal space-y-1 ps-5">{question.options.map((option, index) => <li key={index} className={index === question.answer ? "font-medium text-brand-700" : "text-muted"}>{t(option)}</li>)}</ol>
              {question.explanation && <p className="mt-2 text-ink-soft">{t(question.explanation)}</p>}
            </div>)}
          </section> : null}
        </div>}
        {preview && <section aria-labelledby="studio-history-title" className="studio-history mx-6 mb-6 border-t border-line pt-6">
          <h3 id="studio-history-title" className="flex items-center gap-2 font-serif text-xl"><History className="h-5 w-5 text-brand-600" aria-hidden />{t(S.instructor.history)}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t(S.instructor.historyHint)}</p>
          <LessonHistory events={historyState === "ready" ? history : historyState} onRetry={() => void loadHistory(preview.id)} />
        </section>}
      </dialog>
      <section aria-label={t(S.instructor.overview)} className="studio-metrics">
        {(["all", ...STATUSES] as const).map((status) => {
          const Icon = status === "all" ? BookOpen : STATUS_ICONS[status];
          return <button key={status} className={`card studio-metric metric-${status}`} aria-pressed={statusFilter === status}
            onClick={() => changeFilters({ statusFilter: status })}>
            <span className="studio-metric-icon"><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="studio-metric-count">{status === "all" ? staff.length : staff.filter((lesson) => lesson.status === status).length}</span>
              <span className="studio-metric-label">{t(status === "all" ? S.instructor.totalLessons : S.instructor.status[status])}</span>
            </span>
          </button>;
        })}
      </section>
      <section className="card studio-lessons p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">{t(S.instructor.lessons)}</h2>
          <Link href="/studio/course/" className="btn btn-primary shrink-0 whitespace-nowrap text-sm"><Plus className="h-4 w-4" aria-hidden />{t(S.instructor.newLesson)}</Link>
        </div>
        <div className="studio-filters mt-5">
          <label className="studio-search">
            <span className="studio-field-label">{t(S.instructor.searchTitle)}</span>
            <span className="relative block">
              <Search className="studio-search-icon h-4 w-4 text-muted" aria-hidden />
              <input type="search" className="input" placeholder={t(S.instructor.searchPlaceholder)} value={search}
                onChange={(event) => changeFilters({ search: event.target.value })} />
              {search && <button type="button" className="studio-search-clear" aria-label={t(S.instructor.clearSearch)} onClick={() => changeFilters({ search: "" })}><X className="h-4 w-4" aria-hidden /></button>}
            </span>
          </label>
          <Select label={t(S.instructor.track)} value={trackFilter} options={[{ value: "all", label: t(S.library.all) }, ...trackOptions]}
            onChange={(value) => changeFilters({ trackFilter: value as Filters["trackFilter"], moduleFilter: "all" })} />
          <div className="tip min-w-0 studio-module-filter" data-tip={trackFilter === "all" ? t(S.instructor.moduleFilterHint) : undefined}
            tabIndex={trackFilter === "all" ? 0 : undefined} role={trackFilter === "all" ? "group" : undefined}
            aria-label={trackFilter === "all" ? `${t(S.dash.module)}: ${t(S.instructor.moduleFilterHint)}` : undefined}>
            <Select label={t(S.dash.module)} value={selectedModule?.id ?? "all"} disabled={trackFilter === "all"} options={[{ value: "all", label: t(S.library.allModules) }, ...moduleOptions.map((module) => ({ value: module.id, label: t(module.title) }))]} onChange={(value) => changeFilters({ moduleFilter: value })} />
          </div>
          <Select label={t(S.instructor.subject)} value={subjectFilter} options={[{ value: "all", label: t(S.library.allSubjects) }, ...subjects.map((subject) => ({ value: subject.id, label: t(subject.title) }))]} onChange={(value) => changeFilters({ subjectFilter: value })} />
          <Select label={t(S.instructor.level)} value={String(levelFilter)} options={[{ value: "all", label: t(S.instructor.allLevels) }, ...levelOptions]}
            onChange={(value) => changeFilters({ levelFilter: value === "all" ? "all" : Number(value) })} />
          <Select label={t(S.instructor.statusFilter)} value={statusFilter}
            options={[{ value: "all", label: t(S.instructor.allStatuses) }, ...STATUSES.map((status) => ({ value: status, label: t(S.instructor.status[status]) }))]}
            onChange={(value) => changeFilters({ statusFilter: value as Filters["statusFilter"] })} />
          <button type="button" className="btn btn-ghost studio-reset" aria-label={t(S.instructor.resetFilters)} title={t(S.instructor.resetFilters)} onClick={resetFilters}><RotateCcw className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted">{t(S.instructor.count)}: {visible.length ? first + 1 : 0}{visible.length > 1 && `–${first + visible.length}`} {t(S.instructor.pageOf)} {filtered.length}</p>
          <Select compact label={`${t(S.instructor.sortBy)}: ${t(S.instructor.sort[sort])}`} value={sort}
            options={SORTS.map((value) => ({ value, label: t(S.instructor.sort[value]) }))}
            onChange={(value) => { setSort(value as typeof sort); setPage(1); }} />
        </div>
        {!!visible.length && <table className="studio-table studio-courses mt-4">
          <thead><tr>
            <th scope="col">{t(S.instructor.colLesson)}</th>
            <th scope="col">{t(S.instructor.tracks)}</th>
            <th scope="col">{t(S.instructor.subject)} · {t(S.instructor.level)}</th>
            <th scope="col">{t(S.editor.questions)}</th>
            <th scope="col">{t(S.instructor.statusFilter)}</th>
            <th scope="col">{t(S.instructor.colActions)}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{visible.map((lesson, index) => {
          const owner = lesson.author_id === user.id;
          const manage = owner || canReview(role);
          const meta = TRACK_META[lesson.tracks[0]];
          const TrackIcon = meta?.icon ?? BookOpen;
          return <tr key={lesson.id} className="studio-lesson-row">
            <td><div className="flex items-center gap-3">
              <span className={`studio-lesson-thumb ${meta?.ring ?? "bg-brand-50 text-brand-700"}`} aria-hidden><TrackIcon className="h-5 w-5" /></span>
              <div className="min-w-0">
                {/* Staff who can edit open the course page, which asks what to edit; others get the read-only dialog. */}
                <div className="flex items-center gap-2"><div className="tip min-w-0">{manage
                  ? <Link href={editorLink(lesson.id)} className="studio-lesson-title line-clamp-2 max-w-full text-start" onMouseEnter={tip} onFocus={tip}>{t(lesson.title)}</Link>
                  : <button className="studio-lesson-title line-clamp-2 max-w-full text-start" onMouseEnter={tip} onFocus={tip} aria-haspopup="dialog" onClick={() => openLesson(lesson)}>{t(lesson.title)}</button>}</div>
                  {shownSoon(lesson) && <ComingSoonChip />}</div>
                {/* One line that stays inside the cell: short names here, the full list on hover. */}
                <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
                  <span className="flex shrink-0 gap-1">{(["en", "ar"] as const).filter((code) => lesson.title[code]).map((code) => <span key={code} className="studio-lang">{code}</span>)}</span>
                  {!!lesson.contributors?.length && <span className="min-w-0 truncate" title={lesson.contributors.join(lang === "ar" ? "، " : ", ")}>
                    {lesson.contributors.slice(0, 2).map((name) => name.split("@")[0]).join(lang === "ar" ? "، " : ", ")}</span>}
                  {(lesson.contributors?.length ?? 0) > 2 && <span className="shrink-0" dir="ltr">+{lesson.contributors!.length - 2}</span>}
                </p>
              </div>
            </div></td>
            <td>{lesson.tracks.map((id) => <span key={id} className="block whitespace-nowrap">{t(tracks.find((track) => track.id === id)?.title)}</span>)}</td>
            <td>
              <span className="block">{t(subjects.find((subject) => subject.id === lesson.subject)?.title)}</span>
              <span className="block text-xs text-muted">{t(levels.find((l) => l.id === lessonLevel(lesson.level))?.title)}</span>
            </td>
            <td>{lesson.quiz?.length ?? 0}</td>
            <td><span className={`chip studio-status status-${lesson.status}`}>{t(S.instructor.status[lesson.status])}</span></td>
            <td><div className="studio-row-actions flex justify-end gap-2">
              {manage && <Link href={editorLink(lesson.id)} className="btn btn-ghost"><FilePenLine className="h-4 w-4" aria-hidden />{t(lesson.status === "archived" ? S.instructor.editArchived : S.instructor.edit)}</Link>}
              {lesson.status === "draft" && manage && <button className="btn btn-primary" disabled={busy} onClick={() => void action(async () => {
                await submitDraft(lesson.id);
                if (canReview(role)) await reviewDecision(lesson.id, "approve", "");
              }, t(canReview(role) ? S.instructor.published : S.instructor.submitted))}><CheckCircle2 className="h-4 w-4" aria-hidden />{t(canReview(role) ? S.instructor.publishDirect : S.instructor.submit)}</button>}
              {lesson.status === "in_review" && canReview(role) && <button className="btn btn-primary" title={t(S.instructor.publish)} aria-label={t(S.instructor.publish)} disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "approve", ""), t(S.instructor.published))}><CheckCircle2 className="h-4 w-4" aria-hidden />{t(S.instructor.publishDirect)}</button>}
              {manage && <>
                <button type="button" className="btn btn-ghost" disabled={busy} popoverTarget={`studio-actions-${lesson.id}`}
                  style={{ anchorName: `--studio-actions-${index}` }} aria-label={`${t(S.instructor.moreActions)}: ${t(lesson.title)}`}><Ellipsis className="h-4 w-4" aria-hidden />{t(S.instructor.moreActions)}</button>
                <div id={`studio-actions-${lesson.id}`} popover="auto" role="group" aria-label={`${t(S.instructor.colActions)}: ${t(lesson.title)}`}
                  className="studio-action-menu" style={{ positionAnchor: `--studio-actions-${index}` }} onClick={(event) => event.currentTarget.hidePopover()}>
                  {canReview(role) && lesson.status === "in_review" && <button type="button" disabled={busy} onClick={() => void action(() => reviewDecision(lesson.id, "request_changes", ""), t(S.instructor.changesRequested))}><MessageSquare className="h-4 w-4" aria-hidden />{t(S.instructor.requestChanges)}</button>}
                  {lesson.status === "published" && <button type="button" disabled={busy} onClick={() => hide(lesson)}><EyeOff className="h-4 w-4" aria-hidden />{t(S.instructor.hide)}</button>}
                  {lesson.status !== "archived" && <button type="button" disabled={busy} onClick={() => confirm(lesson, t(S.instructor.archive), t(S.instructor.archiveConfirm), () => archiveLesson(lesson.id), t(S.instructor.archived))}><Archive className="h-4 w-4" aria-hidden />{t(S.instructor.archive)}</button>}
                  <button type="button" className="studio-action-danger" disabled={busy} onClick={() => confirm(lesson, t(S.instructor.delete), t(S.instructor.deleteConfirm), () => deleteLesson(lesson.id), t(S.instructor.deleted), true)}><Trash2 className="h-4 w-4" aria-hidden />{t(S.instructor.delete)}</button>
                </div>
              </>}
            </div></td>
          </tr>;
        })}</tbody>
        </table>}
        {!filtered.length && <div className="studio-empty">
          <Search className="mx-auto h-7 w-7 text-brand-400" aria-hidden />
          <p className="mt-3 font-medium">{t(S.instructor.noResults)}</p>
          <p className="mt-1 text-sm text-muted">{t(S.instructor.noResultsHint)}</p>
          <button className="btn btn-ghost mt-4 text-sm" onClick={resetFilters}>{t(S.instructor.resetFilters)}</button>
        </div>}
        <footer className="studio-pagination mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
          <Select label={t(S.instructor.perPage)} value={String(pageSize)} options={[5, 10, 20].map((size) => ({ value: String(size), label: String(size) }))}
            onChange={(value) => { setPageSize(Number(value)); setPage(1); }} />
          <nav aria-label={t(S.instructor.pagination)} className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t(S.instructor.previousPage)}</button>
          <span className="text-sm text-muted">{t(S.instructor.page)} {currentPage} {t(S.instructor.pageOf)} {totalPages}</span>
          <button className="btn btn-ghost" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>{t(S.instructor.nextPage)}</button>
          </nav>
        </footer>
      </section>
    </div>
  );
}
