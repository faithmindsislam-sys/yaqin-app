"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, CheckCircle2, CircleAlert, Eye, ListChecks, Settings2, PenLine, Send, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { PersonaIdentity } from "@/components/PersonaIdentity";
import { Select } from "@/components/Select";
import { PERSONAS } from "@/lib/personas";
import { LessonHistory } from "./LessonHistory";
import { CourseActivities } from "./CourseActivities";
import { SourcePicker } from "./SourcePicker";
import { CourseContent } from "./CourseContent";
import { CourseDetails } from "./CourseDetails";
import { useCourseDocument } from "./useCourseDocument";
import { cardHtml, filled, plain } from "./model";
import { apiEnabled } from "@/lib/http";
import { draftJob, startDraft, waitForDraft, type DraftJob } from "@/features/studio/api";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { canReview, isStaff } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import type { Card, Lang, Lesson, Source, TrackId } from "@/lib/types";

const E = S.editor;
const LANGS: { id: Lang; name: string }[] = [{ id: "en", name: "English" }, { id: "ar", name: "العربية" }];

export default function LessonEditorPage() {
  return (
    <Suspense>
      <EditorBoundary />
    </Suspense>
  );
}

function EditorBoundary() {
  const id = useSearchParams().get("id");
  const { user } = useSession();
  const { t } = useI18n();
  const title = t(id ? E.editCourse : S.instructor.newLesson);
  const sub = id ? t(E.partsTitle) : `${t(E.startTitle)} ${t(E.startSub)}`;
  return <AppShell title={title} sub={sub}>
    <div className="space-y-6">
      <PageBanner title={title} sub={sub} />
      <Editor key={`${user?.id}:${id ?? "new"}`} />
    </div>
  </AppShell>;
}

function Editor() {
  const { t, lang } = useI18n();
  const { role, user } = useSession();
  const { sources, tracks } = useContent();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const generatedJobId = params.get("generation");
  const userId = user?.id;
  // Each editor tab has its own URL, so Back and Forward move between tabs.
  // A new course starts with its content.
  const requested = params.get("part");
  const part = requested === "course" || requested === "questions" || requested === "details" ? requested : id ? "menu" : "course";
  const go = (next: "course" | "questions" | "details") => router.push(`/studio/course/?${id ? `id=${encodeURIComponent(id)}&` : ""}part=${next}`);
  const [step, setStep] = useState<"choose" | "ai" | "edit">(id ? "edit" : generatedJobId ? "ai" : "choose");
  const [writing, setWriting] = useState<Lang>(lang);
  const generation = useRef(0);
  const [picker, setPicker] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState<TrackId | "">("");
  const [fromAi, setFromAi] = useState<"draft" | "empty" | null>(null);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState(false);
  const [job, setJob] = useState<DraftJob | null>(null);
  const [pollRetry, setPollRetry] = useState(0);
  const [jobStarted, setJobStarted] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { lesson, edit, change, changeCard, start: startDocument, dirty, busy, setBusy, notice, setNotice, tried,
    moduleChoices, chooseModule, loadFailed, retryLoad, recovered, history, retryHistory, todo, save, fail, alive } = useCourseDocument(id);
  useEffect(() => {
    if (jobStarted === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [jobStarted]);

  useEffect(() => {
    if (!id || !generatedJobId || !userId || !isStaff(role)) return;
    let active = true;
    draftJob(generatedJobId).then((current) => {
      if (active && current.lesson_id === id) {
        setFromAi("draft");
      }
    }).catch(() => { /* The saved course remains editable if its generation report is unavailable. */ });
    return () => { active = false; };
  }, [id, generatedJobId, userId, role]);

  useEffect(() => {
    if (id || !generatedJobId || !userId || !isStaff(role) || !apiEnabled) return;
    const request = ++generation.current;
    let mounted = true;
    const active = () => mounted && alive.current && generation.current === request;
    async function follow() {
      // Let the effect subscribe before setting the visible polling state.
      await Promise.resolve();
      if (!active()) return;
      setStep("ai"); setBusy(true); setNotice(null); setJobStarted(Date.now()); setNow(Date.now());
      try {
        const current = await waitForDraft(generatedJobId!, active, (progress) => {
          if (!active()) return;
          setJob(progress);
          const started = Date.parse(progress.created_at);
          if (Number.isFinite(started)) setJobStarted(started);
        });
        if (!current || !active()) return;
        if (current.status === "done" && current.lesson_id) {
          router.replace(`/studio/course/?id=${encodeURIComponent(current.lesson_id)}&generation=${encodeURIComponent(current.job_id)}`);
        } else {
          setNotice({ ok: false, text: current.reason || t(E.aiStage[current.stage] ?? E.aiStage.failed) });
        }
      } catch (error) {
        if (active()) setNotice({ ok: false, text: error instanceof Error ? error.message : t(S.ask.error) });
      } finally {
        if (active()) { setBusy(false); setJobStarted(null); }
      }
    }
    void follow();
    return () => { mounted = false; };
  }, [id, generatedJobId, userId, role, pollRetry, alive, router, setBusy, setNotice, t]);

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.instructor.unavailable)}</p>;

  function start(draft: Lesson | null) {
    generation.current++; setBusy(false); setJobStarted(null); setJob(null);
    if (generatedJobId && !id) router.replace("/studio/course/");
    startDocument(draft); setStep("edit");
  }

  async function generate() {
    if (!audience || generatedJobId || busy) return;
    const request = ++generation.current;
    const active = () => alive.current && generation.current === request;
    setBusy(true); setNotice(null); setJob(null);
    try {
      const started = await startDraft(prompt.trim(), lang, audience);
      if (!active()) return;
      // Persist the pending ID before polling. Refresh only reads this existing job;
      // an ambiguous status/continuation failure must never start another generation.
      router.replace(`/studio/course/?generation=${encodeURIComponent(started.job_id)}`);
    } catch (e) { if (active()) { fail(e); setBusy(false); setJobStarted(null); } }
  }

  const back = (
    <Link href="/studio/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-700"
      onClick={(event) => { if (dirty && !window.confirm(t(E.leave))) event.preventDefault(); }}>
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(E.back)}
    </Link>
  );

  if (!lesson && step === "choose") return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" className="card editor-choice" onClick={() => start(null)}>
          <span className="editor-choice-icon"><PenLine className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.manual)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.manualSub)}</span>
        </button>
        <button type="button" className="card editor-choice" onClick={() => setStep("ai")}>
          <span className="font-serif text-2xl text-ink">{t(E.ai)}</span>
          <PersonaIdentity persona={PERSONAS.hassan} />
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.aiSub)}</span>
        </button>
      </div>
    </div>
  );

  if ((!lesson || (generatedJobId && !id)) && step === "ai") return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-700" onClick={() => { generation.current++; setBusy(false); setJobStarted(null); setStep("choose"); if (generatedJobId) router.replace("/studio/course/"); }}>
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(S.lesson.previous)}
      </button>
      <form className="card space-y-5 p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <PersonaIdentity persona={PERSONAS.hassan} />
        <div>
          <h2 className="font-serif text-3xl text-ink">{t(E.aiTitle)}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(PERSONAS.hassan.welcome)} {t(E.aiHint)}</p>
        </div>
        <div>
          <Select label={t(E.aiAudience)} value={audience} disabled={busy} placeholder={t(E.aiAudienceChoose)}
            options={tracks.map((track) => ({ value: track.id, label: t(track.title) }))}
            onChange={(value) => setAudience(value as TrackId)} />
          <span className="mt-1 block text-xs text-muted">{t(E.aiAudienceHint)}</span>
        </div>
        <textarea className="input min-h-40" autoFocus required maxLength={4000} aria-label={t(E.aiTitle)} placeholder={t(E.aiPlaceholder)}
          value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          {E.aiExamples.map((example) => <button key={example.en} type="button" className="chip hover:border-brand-300 hover:text-brand-800" onClick={() => setPrompt(t(example))}>{t(example)}</button>)}
        </div>
        {busy && <section role="status" aria-live="polite" className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Sparkles className="h-4 w-4 animate-pulse text-brand-600" aria-hidden />{t(E.aiStatusTitle)}
          </p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {(["sources", "writing", "saving"] as const).map((stage) => {
              const order = ["queued", "sources", "writing", "saving", "done"];
              const at = order.indexOf(job?.stage ?? "queued");
              const mine = order.indexOf(stage);
              const state = at > mine ? "done" : at === mine ? "active" : "todo";
              return <li key={stage} className={`flex items-center gap-2 ${state === "todo" ? "text-muted" : "text-ink"}`}>
                {state === "done" ? <Check className="h-4 w-4 text-brand-700" aria-hidden />
                  : <span className={`inline-block h-2.5 w-2.5 rounded-full ${state === "active" ? "animate-pulse bg-brand-600" : "bg-line"}`} aria-hidden />}
                <span className={state === "active" ? "font-medium" : ""}>{t(E.aiStage[stage])}</span>
                {state === "active" && stage === "writing" && !!job?.attempt &&
                  <span className="text-xs text-muted">· {t(E.aiAttempt)} {job.attempt} {t(E.aiOf)} {job.max_attempts}</span>}
              </li>;
            })}
          </ol>
          {jobStarted !== null && <p className="mt-3 text-xs text-muted">
            {t(E.aiElapsed)}: {Math.floor((now - jobStarted) / 60000)}:{String(Math.floor(((now - jobStarted) / 1000) % 60)).padStart(2, "0")} · {t(E.aiWaitHint)}
          </p>}
        </section>}
        {notice && <div className="editor-notice is-error">
          <p role="alert">{notice.text}</p>
          {generatedJobId && <button type="button" className="btn btn-ghost mt-2" disabled={busy}
            onClick={() => setPollRetry((attempt) => attempt + 1)}>{t(S.ask.retry)}</button>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => start(null)}><PenLine className="h-4 w-4" aria-hidden />{t(E.manual)}</button>
          <button className="btn btn-primary" disabled={busy || !!generatedJobId || !prompt.trim() || !audience}><Sparkles className="h-4 w-4" aria-hidden />{t(busy ? E.generating : E.generate)}</button>
        </div>
      </form>
    </div>
  );

  if (loadFailed) return <div className="card space-y-4 p-8 text-center"><p role="alert" className="text-ink-soft">{t(E.loadError)}</p><button className="btn btn-primary" onClick={retryLoad}>{t(S.ask.retry)}</button>{back}</div>;
  if (!lesson) return <p role="status" className="p-8 text-center text-muted">{t(S.common.loading)}</p>;

  const live = lesson.status === "published";
  // The "Coming soon" setting is on: learners see the title locked (an archived course is hidden anyway).
  const soon = !!lesson.coming_soon && lesson.status !== "archived";
  // A button is greyed out when clicking it would change nothing: the course is saved and was not edited.
  const unchanged = !dirty && !!lesson.id;
  const inReview = lesson.status === "in_review";
  // Review is always on: a teacher's lesson goes to an admin, an admin publishes directly.
  const direct = canReview(role);
  const canPublish = canReview(role) || (lesson.author_id ? lesson.author_id === user.id : !id);
  const locked = live && !canPublish;
  const complete = (language: Lang) => !!lesson.title[language]?.trim() && !!lesson.summary[language]?.trim() && lesson.cards.length > 0
    && lesson.cards.every((card) => card.title[language]?.trim() && (card.kind === "quote" || plain(cardHtml(card)[language])));
  // Who saved the lesson text last, and when: the newest "created" or "updated" entry of its history.
  const lastEdit = typeof history === "string" ? null : history.find((event) => event.kind === "updated" || event.kind === "created") ?? null;
  const pickerCard = lesson.cards.find((card) => card.id === picker);
  // After a first save attempt the list of missing parts stays live, and shrinks as they are filled.

  function pickSource(card: Card, sourceId: string, picked?: Source) {
    const source = picked ?? sources[sourceId];
    const previous = sources[card.sources?.[0] ?? ""];
    // The quote takes its source's reference as title, unless the author wrote another one.
    const auto = !filled(card.title) || (!!previous && card.title.en === previous.ref_en && card.title.ar === previous.ref_ar);
    changeCard(card.id, (current) => ({ ...current, sources: [sourceId], title: auto && source ? { en: source.ref_en, ar: source.ref_ar } : current.title }));
  }

  if (part === "menu") return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <button type="button" className="btn btn-ghost" onClick={() => { setPreview(true); go("course"); }}><Eye className="h-4 w-4" aria-hidden />{t(E.view)}</button>
      </div>
      <header>
        <span className={`chip studio-status status-${lesson.status}`}>{t(S.instructor.status[lesson.status])}</span>
        <h2 className="mt-3 font-serif text-4xl text-ink">{t(lesson.title)}</h2>
        <p className="mt-2 text-ink-soft">{t(E.partsTitle)}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <button type="button" className="card editor-choice" onClick={() => go("course")}>
          <span className="editor-choice-icon"><BookOpen className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.partCourse)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.partCourseSub)}</span>
          <span className="chip mt-auto">{t(E.pages)}: {lesson.cards.length}</span>
        </button>
        <button type="button" className="card editor-choice" onClick={() => go("questions")}>
          <span className="editor-choice-icon"><ListChecks className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.questions)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.partQuestionsSub)}</span>
          <span className="chip mt-auto">{t(E.questions)}: {lesson.quiz?.length ?? 0}</span>
        </button>
        <button type="button" className="card editor-choice" onClick={() => go("details")}>
          <span className="editor-choice-icon"><Settings2 className="h-6 w-6" aria-hidden /></span>
          <span className="font-serif text-2xl text-ink">{t(E.details)}</span>
          <span className="text-sm leading-relaxed text-ink-soft">{t(E.partDetailsSub)}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="lesson-editor">
      {recovered && <p role="status" className="editor-notice is-success">{t({ en: "Recovered your unsaved draft from this browser session.", ar: "استُعيدت مسودّتك غير المحفوظة من جلسة المتصفح." })}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div role="group" aria-label={t(E.contentLang)} title={t(E.langHint)} className="editor-langs">
          <span>{t(E.contentLang)}</span>
          {LANGS.map(({ id: language, name }) => <button key={language} type="button" aria-pressed={writing === language} onClick={() => setWriting(language)}>
            {name}{complete(language) && <Check className="h-3.5 w-3.5" aria-label={t(E.langComplete)} />}
          </button>)}
        </div>
      </div>

      {fromAi && <div className="editor-ai-note">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>{t(fromAi === "draft" ? E.aiSaved : E.aiPending)}</p>
          {fromAi === "empty" && <p className="mt-1 break-words italic">“{prompt}”</p>}
        </div>
        <button type="button" className="rich-tool" aria-label={t(S.common.close)} onClick={() => setFromAi(null)}><X className="h-4 w-4" aria-hidden /></button>
      </div>}

      <div className="editor-grid">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label={t(E.partsLabel)} className="editor-langs flex-wrap">
              <button type="button" aria-pressed={part === "course"} onClick={() => { if (part !== "course") go("course"); }}><BookOpen className="h-3.5 w-3.5" aria-hidden />{t(E.partCourse)}</button>
              <button type="button" aria-pressed={part === "questions"} onClick={() => { setPreview(false); if (part !== "questions") go("questions"); }}><ListChecks className="h-3.5 w-3.5" aria-hidden />{t(E.questions)} · {lesson.quiz?.length ?? 0}</button>
              <button type="button" aria-pressed={part === "details"} onClick={() => { setPreview(false); if (part !== "details") go("details"); }}><Settings2 className="h-3.5 w-3.5" aria-hidden />{t(E.details)}</button>
            </div>
          </div>
          {part === "details" ? <CourseDetails lesson={lesson} locked={locked} busy={busy} direct={direct} moduleChoices={moduleChoices} chooseModule={chooseModule} change={change} /> : part === "questions" ? <CourseActivities course={lesson} writing={writing} disabled={locked} change={change} /> : <>
          <CourseContent lesson={lesson} writing={writing} locked={locked} preview={preview} page={page} setPage={setPage}
            tried={tried} edit={edit} change={change} changeCard={changeCard} setPicker={setPicker} />
          </>}
        </div>

        <aside className="space-y-4">
          <div className="card editor-bar">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip studio-status status-${lesson.status}`}>{t(S.instructor.status[lesson.status])}</span>
              <span role="status" aria-live="polite" className={`editor-state ${busy || dirty || !lesson.id ? "is-dirty" : ""}`}>
                {t(busy ? E.working : live && !dirty ? (soon ? E.liveLocked : E.live) : !lesson.id ? E.notSaved : dirty ? E.unsaved : E.saved)}</span>
            </div>
            {canPublish && <button type="button" className="btn btn-primary" disabled={busy || (live && !dirty) || (!direct && inReview && unchanged)} title={direct ? undefined : t(S.instructor.reviewMode)}
              onClick={() => void save("publish")}>{t(!direct ? S.instructor.submit : live ? E.update : S.instructor.publishDirect)}</button>}
            {/* An account that may publish can still ask for a second look first. */}
            {!live && direct && canPublish && <button type="button" className="btn btn-ghost" disabled={busy || (inReview && unchanged)} onClick={() => void save("review")}><Send className="h-4 w-4" aria-hidden />{t(S.instructor.submit)}</button>}
            {!live && <button type="button" className="btn btn-ghost" disabled={busy || (lesson.status === "draft" && unchanged)} onClick={() => void save("draft")}>{t(S.instructor.saveDraft)}</button>}
            <button type="button" className="btn btn-ghost" aria-pressed={preview} onClick={() => { setPreview(!preview); if (part !== "course") go("course"); }}>
              {preview ? <PenLine className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{t(preview ? E.keepEditing : E.view)}
            </button>
            {!canPublish && <p className="text-xs text-muted">{t(E.authorPublishes)}</p>}
            {!!todo.length && <div role="alert" className="editor-notice is-error">
              <p className="font-semibold">{t(E.fixFirst)}</p>
              <ul>{todo.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>}
            {notice && <p role={notice.ok ? "status" : "alert"} className={`editor-notice flex items-start gap-2 ${notice.ok ? "is-success" : "is-error"}`}>
              {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{notice.text}
            </p>}
          </div>

          <section className="card space-y-3 p-5">
            <h2 className="font-serif text-xl text-ink">{t(E.activity)}</h2>
            <dl className="editor-facts">
              <dt>{t(E.lastUpdated)}</dt>
              <dd>{lastEdit ? <time dateTime={lastEdit.created_at}>{new Date(lastEdit.created_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time>
                : t(lesson.id ? E.notRecorded : E.notSaved)}</dd>
              <dt>{t(E.lastUpdatedBy)}</dt>
              <dd className="truncate" title={lastEdit?.actor_email ?? undefined}>{lastEdit ? lastEdit.actor_email || lastEdit.actor_name || t(S.instructor.unknownActor) : "—"}</dd>
            </dl>
            <h3 className="studio-field-label !mb-0 border-t border-line pt-3">{t(E.contributors)}</h3>
            {lesson.contributors?.length ? <div className="editor-chips">
              {lesson.contributors.map((name) => <span key={name} className="chip max-w-full" title={name}>
                <span className="editor-avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 truncate">{name}</span>
              </span>)}
            </div> : <p className="text-xs leading-relaxed text-muted">{t(E.contributorsHint)}</p>}
            {lesson.id && <>
              <h3 className="studio-field-label !mb-0 border-t border-line pt-3">{t(S.instructor.history)}</h3>
              <LessonHistory events={history} onRetry={retryHistory} />
            </>}
          </section>
        </aside>
      </div>

      {pickerCard && <SourcePicker exclude={pickerCard.kind === "quote" ? [] : pickerCard.sources ?? []}
        onPick={(sourceId, picked) => pickSource(pickerCard, sourceId, picked)} onClose={() => setPicker(null)} />}
    </div>
  );
}
