"use client";

import Link from "@/components/RouteLink";
import { useRouter } from "@/lib/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Lock, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { CardVisual } from "@/components/Visuals";
import { LearnStats } from "@/features/learning/LearnStats";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { nextLesson, useProgress } from "@/features/learning/progress";
import { displayName, useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { COURSE_IMAGES_ENABLED, subjectTitle } from "@/features/courses/catalog";
import { lessonLevel, type ComingSoon, type Lesson } from "@/lib/types";

export default function Dashboard() {
  const { ready, user, prefs } = useSession();
  const router = useRouter();
  // No track yet (new account): choose one first.
  const needsTrack = ready && !!user && !prefs.onboarded;
  useEffect(() => {
    if (needsTrack) router.replace("/journey/");
  }, [needsTrack, router]);
  const greeting = useGreeting();
  return (
    <AppShell {...(needsTrack ? {} : greeting)}>
      {!needsTrack && <DashboardBody />}
    </AppShell>
  );
}

/** Greeting for the learner's journey: in the header on desktop, in the page banner on mobile. */
function useGreeting() {
  const { t } = useI18n();
  const { user, prefs, profileName } = useSession();
  const trackId = prefs.track ?? "first-steps";
  const name = profileName ?? displayName(user);
  return {
    title: <>{t(S.dash.greeting[trackId].hello)}{name ? `، ${name}`.replace("، ", t({ en: ", ", ar: "، " })) : ""}</>,
    sub: t(S.dash.greeting[trackId].sub),
  };
}

function DashboardBody() {
  const { getTrack, getLesson, trackLessons, comingSoon, status } = useContent();
  const { t } = useI18n();
  const { prefs } = useSession();
  const progress = useProgress();
  const greeting = useGreeting();
  const trackId = prefs.track ?? "first-steps";
  const lessons = trackLessons(trackId);
  // Modules guide the journey independently of subjects and course difficulty.
  // `steps` follows the module order set in Studio: published courses, plus unpublished ones shown as Coming soon.
  const modules = (getTrack(trackId)?.modules ?? []).map((m) => {
    const steps = m.lessons.map((id) => getLesson(id) ?? comingSoon[id]).filter((c): c is Lesson | ComingSoon => !!c && c.tracks.includes(trackId));
    return { ...m, steps, items: steps.filter(isCourse) };
  });

  const current = useMemo(() => nextLesson(lessons, prefs.known, progress.lessons), [lessons, prefs.known, progress.lessons]);

  const cp = current ? progress.lessons[current.id] : undefined;
  // Every course finished: `current` is then the first course again, offered for review.
  const allDone = lessons.length > 0 && lessons.every((l) => progress.lessons[l.id]?.completedAt);
  const quizLeft = !!current?.quiz?.length && !!cp?.cardsDone && !cp.completedAt;
  const plan = current && !allDone
    ? [
        { label: `${t(S.dash.planRead)}: ${t(current.title)} · ${current.minutes} ${t(S.library.min)}`, done: !!cp?.cardsDone, href: `/course/?id=${current.id}` },
        ...(current.quiz?.length ? [{ label: t(S.dash.planQuiz), done: cp?.quizScore != null, href: `/course/?id=${current.id}&step=quiz` }] : []),
      ]
    : [];
  const doneCount = plan.filter((p) => p.done).length;

  const moduleIdx = Math.max(0, current ? modules.findIndex((lv) => lv.items.some((course) => course.id === current.id)) : 0);
  // Module shown in the journey card.
  const [picked, setPicked] = useState<number | null>(null);
  const viewIdx = Math.min(picked ?? moduleIdx, modules.length - 1);
  const view = modules[viewIdx];
  const viewLocked = !modules[viewIdx]?.items.length;
  const viewDone = view ? view.items.filter((l) => progress.lessons[l.id]?.completedAt).length : 0;
  const modulesDone = modules.length ? { done: modules.filter((m) => m.items.length > 0 && m.items.every((l) => progress.lessons[l.id]?.completedAt)).length, total: modules.length } : undefined;

  if (status === "loading" && !lessons.length) return <p role="status" className="text-sm text-muted">{t({ en: "Loading your learning journey…", ar: "جارٍ تحميل مسارك التعليمي…" })}</p>;

  return (
    <div className="space-y-6">
      {/* Mobile only: desktop shows the greeting in the header and the numbers as cards. */}
      <PageBanner {...greeting}>
        <LearnStats modules={modulesDone} className="mt-4 flex flex-wrap" />
      </PageBanner>
      <LearnStats big modules={modulesDone} className="hidden gap-6 lg:grid lg:grid-cols-3" />

      {trackId === "deepen" && <Link href="/worship/" className="card group flex flex-wrap items-center justify-between gap-4 border-brand-100 bg-gradient-to-r from-brand-50 to-white p-6">
        <div><p className="text-xs font-medium uppercase tracking-wide text-brand-700">{t({ en: "Make space for what matters", ar: "فسحة لما يقرّبك" })}</p>
          <h2 className="mt-2 font-serif text-2xl text-ink">{t(S.nav.worship)}</h2>
          <p className="mt-2 text-sm text-ink-soft">{t({ en: "Daily adhkar, Quran, and a moment of gratitude. Build your day, one small step at a time.", ar: "أذكار يومية وقرآن ولحظة امتنان. ابنِ يومك بخطوات صغيرة." })}</p>
        </div>
        <span className="btn btn-primary shrink-0">{t({ en: "Open my daily plan", ar: "افتح خطتي اليومية" })}<span aria-hidden className="rtl:rotate-180">→</span></span>
      </Link>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
        {/* Next step: the recommended course, as a short checklist */}
        <section className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-ink">{t(S.dash.today)}</h2>
            {plan.length > 0 && (
              <span className="text-sm text-muted">
                {t({ en: `Step ${Math.min(doneCount + 1, plan.length)} of ${plan.length}`, ar: `الخطوة ${Math.min(doneCount + 1, plan.length)} من ${plan.length}` })}
              </span>
            )}
          </div>
          {plan.length > 0 && (
            <div className="mt-3 h-2 rounded-full bg-line">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all" style={{ width: `${(doneCount / plan.length) * 100}%` }} />
            </div>
          )}
          {!plan.length && <p className="mt-3 text-ink-soft">{t(allDone ? S.library.allDone : S.dash.comingSoon)}</p>}
          {plan.length > 0 && (
            <ul className="mt-5 space-y-1">
              {plan.map((p) => (
                <li key={p.label}>
                  <Link href={p.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-sky-50">
                    {p.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-500" /> : <Circle className="h-5 w-5 shrink-0 text-line" />}
                    <span className={p.done ? "text-muted line-through" : "text-ink"}>{p.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {current && (
            <Link href={`/course/?id=${current.id}${quizLeft ? "&step=quiz" : ""}`} className="btn btn-primary mt-5 w-full">
              {t(allDone ? S.dash.review : quizLeft ? S.dash.takeQuiz : cp ? S.dash.continue : S.dash.start)} <span aria-hidden className="rtl:rotate-180">→</span>
            </Link>
          )}
          {current && <p className="mt-3 flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{t({ en: "or", ar: "أو" })}</p>}
          <Link href={`/ask/?track=${trackId}`} className="btn btn-tint-brand mt-3 w-full text-sm"><Sparkles className="h-4 w-4 shrink-0" aria-hidden />{t(S.dash.planAsk)}</Link>
        </section>


        {/* Journey: one module at a time, drawn as a winding road */}
        <section className="card overflow-hidden p-6">
          <h2 className="font-serif text-2xl text-ink">{t(S.dash.journey)}</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />{t(S.dash.road.done)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white" />{t(S.dash.road.now)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-line" />{t(S.dash.road.planned)}</span>
          </div>
          {view && (
            <>
              <div className={`mt-5 flex items-center gap-2 rounded-xl px-2 py-2 ${viewLocked ? "bg-sky-50/60" : "bg-brand-50"}`}>
                <button type="button" onClick={() => setPicked(viewIdx - 1)} disabled={viewIdx === 0} aria-label={t(S.dash.prevModule)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <div className={`min-w-0 flex-1 text-center text-sm ${viewLocked ? "text-muted" : "text-ink"}`}>
                  <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    {viewLocked && <Lock className="h-3 w-3" />}
                    {t(S.dash.module)} {viewIdx + 1} / {modules.length}
                  </p>
                  <p className="font-semibold">{t(view.title)}</p>
                  <p className="text-xs text-muted">
                    {viewLocked ? (view.items.length ? t(S.dash.locked) : t(S.dash.comingSoon)) : `${viewDone}/${view.items.length} ${t(S.dash.completed)}`}
                  </p>
                </div>
                <button type="button" onClick={() => setPicked(viewIdx + 1)} disabled={viewIdx === modules.length - 1} aria-label={t(S.dash.nextModule)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronRight className="h-5 w-5 rtl:rotate-180" />
                </button>
              </div>
              <div className="mt-1 flex justify-center">
                {modules.map((lv, i) => (
                  <button key={lv.id} type="button" onClick={() => setPicked(i)} aria-label={t(lv.title)} aria-current={i === viewIdx} className="grid h-6 min-w-6 place-items-center">
                    <span className={`h-1.5 rounded-full transition-all ${i === viewIdx ? "w-5 bg-brand-500" : i <= moduleIdx ? "w-1.5 bg-brand-200" : "w-1.5 bg-line"}`} />
                  </button>
                ))}
              </div>
              <Road key={view.id} steps={view.steps} locked={viewLocked} currentId={current?.id} />
            </>
          )}
        </section>
      </div>

      {COURSE_IMAGES_ENABLED && current && (
        <Link href={`/course/?id=${current.id}`} className="card group block overflow-hidden md:hidden">
          <div className="h-40">
            <CardVisual kind={current.cards[0]?.visual} />
          </div>
        </Link>
      )}
    </div>
  );
}

const ROW = 120; // px per lesson on the road
const ROAD_LIMIT = 4; // courses shown before "Show more"
const xAt = (i: number) => (i % 2 === 0 ? 28 : 72); // % from the start edge, zig-zag

/** A Coming soon entry has no pages; a course always has some. */
const isCourse = (step: Lesson | ComingSoon): step is Lesson => "cards" in step;

/** Courses drawn as nodes on a winding road. Road is coloured up to the current course.
 *  Coming soon courses and every node of a `locked` module are grey and not clickable. */
function Road({ steps, locked, currentId }: { steps: (Lesson | ComingSoon)[]; locked: boolean; currentId?: string }) {
  const { t } = useI18n();
  const progress = useProgress();
  const { subjects, levels } = useContent();
  const { prefs } = useSession();
  const [showAll, setShowAll] = useState(false);
  const lessons = steps.filter(isCourse);
  const reached = steps.findIndex((step) => step.id === currentId);
  // ponytail: a current course past the limit is hidden too; the "Your next step" card still links to it.
  const count = showAll ? steps.length : Math.min(steps.length, ROAD_LIMIT);
  const h = count * ROW;
  const pathTo = (n: number) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const y = ROW / 2 + i * ROW;
      if (i === 0) return `M ${xAt(0)} ${y}`;
      // S-curve: drops straight out of a node, crosses flat between two rows, so it stays clear of the labels.
      return `C ${xAt(i - 1)} ${y} ${xAt(i)} ${y - ROW} ${xAt(i)} ${y}`;
    }).join(" ");
  const allDone = lessons.length > 0 && lessons.every((l) => progress.lessons[l.id]?.completedAt);
  const coloredTo = Math.min(count - 1, locked ? -1 : allDone ? steps.lastIndexOf(lessons[lessons.length - 1]) : reached);
  const items = steps.slice(0, count).map((step) => ({ key: step.id, title: step.title, lesson: isCourse(step) ? step : undefined }));

  // A module with no course yet: its header already says "Coming soon".
  if (!count) return null;
  return (
    <>
    <ol className={`relative mt-4 ${locked ? "opacity-60" : ""}`} style={{ height: h }}>
      <svg className="absolute inset-0 h-full w-full rtl:-scale-x-100" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden>
        <path d={pathTo(count - 1)} fill="none" className="stroke-line" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {coloredTo >= 0 && <path d={pathTo(coloredTo)} fill="none" className="stroke-brand-400" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <path d={pathTo(count - 1)} fill="none" stroke="white" strokeWidth={2} strokeDasharray="6 8" vectorEffect="non-scaling-stroke" />
      </svg>
      {items.map(({ key, title, lesson }, i) => {
        const open = !!lesson && !locked;
        const state = !open ? "locked" : progress.lessons[lesson.id]?.completedAt ? "done" : lesson.id === currentId ? "now" : "planned";
        // The recommended course is "Up next" until the learner has opened it.
        const stateLabel = state === "locked" ? undefined : t(state === "now" && !progress.lessons[lesson?.id ?? ""] ? S.dash.road.next : S.dash.road[state]);
        const x = xAt(i);
        const labelOnEnd = x < 50;
        const body = (
          <>
            <span
              className={`absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 text-sm font-bold shadow-sm transition rtl:translate-x-1/2 ${open ? "group-hover:scale-110" : ""} ${
                state === "done" ? "border-white bg-brand-500 text-white" : state === "now" ? "border-brand-500 bg-white text-brand-700 ring-4 ring-brand-100" : "border-white bg-line text-muted"
              }`}
              style={{ insetInlineStart: `${x}%` }}
            >
              {state === "done" ? <Check className="h-5 w-5" /> : state === "locked" ? <Lock className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={`absolute top-1/2 -translate-y-1/2 ${labelOnEnd ? "text-start" : "text-end"}`}
              style={labelOnEnd ? { insetInlineStart: `calc(${x}% + 36px)`, insetInlineEnd: 0 } : { insetInlineStart: 0, insetInlineEnd: `calc(${100 - x}% + 36px)` }}
            >
              <span className={`block text-sm font-medium leading-snug line-clamp-2 ${state === "locked" ? "text-muted" : state === "planned" ? "text-ink-soft" : "text-ink"}`}>{t(title)}</span>
              <span className={`text-xs ${state === "now" ? "font-medium text-brand-700" : "text-muted"}`}>
                {state === "now" ? stateLabel : !lesson ? t(S.dash.comingSoon) : `${lesson.minutes} ${t(S.library.min)}`}
              </span>
              {lesson && <span className="block text-xs text-muted">{t(subjectTitle(subjects.find((s) => s.id === lesson.subject), prefs.track ?? "first-steps"))} · {t(levels.find((level) => level.id === lessonLevel(lesson.level))?.title)}</span>}
            </span>
          </>
        );
        return (
          <li key={key} className="absolute inset-x-0" style={{ top: i * ROW, height: ROW }}>
            {open ? (
              <Link href={`/course/?id=${lesson.id}`} className="group block h-full" aria-label={`${t(title)} · ${stateLabel}`}>
                {body}
              </Link>
            ) : (
              <div className="block h-full cursor-not-allowed" aria-disabled>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
    {steps.length > ROAD_LIMIT && (showAll || count < steps.length) && (
      <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="btn btn-tint-brand mt-2 w-full text-sm">
        {showAll ? t(S.dash.showLess) : `${t(S.dash.showMore)} (${steps.length - count})`}
      </button>
    )}
    </>
  );
}
