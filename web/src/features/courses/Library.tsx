"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleDot, Clock, Layers, Lock, Search, Sparkles } from "lucide-react";
import { Select } from "@/components/Select";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { CardVisual } from "@/components/Visuals";
import { TRACK_META } from "@/features/courses/track-meta";
import { useContent } from "@/features/courses/ContentProvider";
import { COURSE_IMAGES_ENABLED, subjectTitle } from "@/features/courses/catalog";
import { useI18n } from "@/lib/i18n";
import { nextLesson, useProgress } from "@/features/learning/progress";
import { useSession } from "@/features/auth/SessionProvider";
import { useIsClient } from "@/lib/store";
import { S } from "@/lib/strings";
import { lessonLevel, type ComingSoon, type Lesson, type TrackId } from "@/lib/types";

type View = "learn" | "browse";

export default function LibraryPage() {
  return <Suspense><Library /></Suspense>;
}

function Library() {
  const { tracks } = useContent();
  const { t } = useI18n();
  // Session preferences live in the browser only: render the server defaults until this boundary has hydrated.
  const stored = useSession().prefs;
  const prefs = useIsClient() ? stored : { track: null, known: [] };
  const params = useSearchParams();
  const paramView = params.get("view");
  const paramTrack = tracks.find((tr) => tr.id === params.get("track"))?.id;
  // Every track offers the same guided journey and free subject browsing.
  const [pickedView, setView] = useState<View | null>(paramView === "learn" || paramView === "browse" ? paramView : null);
  const view = pickedView ?? "learn";
  const filter = paramTrack ?? prefs.track ?? "explore";
  const title = t(view === "learn" ? tracks.find((tr) => tr.id === filter)?.title : S.library.title);
  const sub = t(view === "learn" ? S.library.learnSub : S.library.sub);

  return (
    <AppShell title={title} sub={sub}>
      <div className="space-y-6">
        <div role="group" aria-label={t(S.library.views)} className="flex rounded-full border border-line bg-white p-1 text-sm sm:inline-flex">
          {(["learn", "browse"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-5 transition ${view === v ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-soft hover:bg-sky-50"}`}
            >
              {t(v === "learn" ? S.library.learnTab : S.library.browseTab)}
            </button>
          ))}
        </div>

        <PageBanner title={title} sub={sub} />
        {view === "learn" ? <GuidedJourney key={filter} trackId={filter} known={prefs.known} /> : <Browse key={filter} filter={filter} />}

      </div>
    </AppShell>
  );
}

/** Every track offers ordered modules and a suggested next course, with free choice. */
function GuidedJourney({ known, trackId }: { known: string[]; trackId: TrackId }) {
  const { getTrack, getLesson, trackLessons, subjects, levels, comingSoon } = useContent();
  const { t } = useI18n();
  const progress = useProgress();
  const lessons = trackLessons(trackId);
  const subjectName = (id: string) => t(subjectTitle(subjects.find((s) => s.id === id), trackId));
  const done = (l: Lesson) => !!progress.lessons[l.id]?.completedAt;
  const allDone = lessons.every(done);
  const next = nextLesson(lessons, known, progress.lessons);
  // `soon`: unpublished courses of the module that Studio shows to learners as Coming soon.
  const modules = (getTrack(trackId)?.modules ?? []).map((m) => ({
    ...m,
    items: m.lessons.map(getLesson).filter((l): l is Lesson => !!l && l.tracks.includes(trackId)),
    soon: m.lessons.map((id) => comingSoon[id]).filter((c): c is ComingSoon => !!c && c.tracks.includes(trackId)),
  })).map((m) => ({ ...m, subjectIds: [...new Set(m.items.map((l) => l.subject))] }));

  const openId = (modules.find((m) => m.items.some((l) => l.id === next?.id)) ?? modules[0])?.id;

  return (
    <>
      {modules.map((m, index) => (
        <section key={m.id} aria-labelledby={`module-${m.id}`} className="card p-5 sm:p-6">
          {/* Native dropdown: the module holding the next course starts open. */}
          <details className="group" open={m.id === openId}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <div><p className="eyebrow mb-1">{t(S.dash.module)} {index + 1}</p><h2 id={`module-${m.id}`} className={`font-serif text-xl ${m.items.length ? "text-ink" : "text-ink-soft"}`}>{t(m.title)}</h2></div>
            <span className="flex items-center gap-3 text-sm text-muted">
              {m.items.length ? `${m.items.filter(done).length}/${m.items.length} ${t(S.dash.completed)}` : <span className="chip"><Lock className="h-3.5 w-3.5" aria-hidden /> {t(S.dash.comingSoon)}</span>}
              <ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          {/* Plain text, not chips: these labels are not filters. */}
          {m.subjectIds.length > 0 && <p className="mt-2 text-sm text-ink-soft">{m.subjectIds.map(subjectName).join(" · ")}</p>}
          <ol className="mt-3 space-y-1">
            {m.items.map((l) => {
              const lp = progress.lessons[l.id];
              const isNext = !allDone && l.id === next?.id;
              const Icon = lp?.completedAt ? CheckCircle2 : lp ? CircleDot : Circle;
              return (
                <li key={l.id}>
                  <Link href={`/course/?id=${l.id}&track=${trackId}`} aria-current={isNext ? "step" : undefined} className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-sky-50 ${isNext ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${lp ? "text-brand-500" : "text-muted"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{t(l.title)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {l.minutes} {t(S.library.min)}</span>
                        {/* The module line already names a single subject; Explore has no level filter, so no level here. */}
                        {m.subjectIds.length > 1 && <span>{subjectName(l.subject)}</span>}
                        {trackId !== "explore" && <span>{t(levels.find((level) => level.id === lessonLevel(l.level))?.title)}</span>}
                        <span className={isNext ? "font-semibold text-brand-700" : ""}>{t(lp?.completedAt ? S.library.completed : lp ? S.dash.road.now : isNext ? S.dash.road.next : S.library.notStarted)}</span>
                      </span>
                    </span>
                    <span aria-hidden className="text-muted rtl:rotate-180">→</span>
                  </Link>
                </li>
              );
            })}
            {/* Coming soon courses have no content for learners yet: plain text, never a link. */}
            {m.soon.map((course) => (
              <li key={course.id} className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{t(course.title)}</span>
                <span className="text-xs">{t(S.dash.comingSoon)}</span>
              </li>
            ))}
          </ol>
          </details>
        </section>
      ))}

      <p className="text-sm text-ink-soft">{t(S.library.freedom)}</p>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-ink-soft">{t(S.library.askHint)}</p>
        <Link href={`/ask/?track=${trackId}`} className="btn btn-ghost w-full sm:w-auto">
          <Sparkles className="h-4 w-4" aria-hidden /> {t(S.nav.ask)}
        </Link>
      </section>
    </>
  );
}

function Browse({ filter }: { filter: TrackId }) {
  const { trackLessons, tracks, subjects, levels } = useContent();
  const { t } = useI18n();
  const progress = useProgress();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [level, setLevel] = useState("all");
  const [moduleId, setModuleId] = useState("all");
  const modules = tracks.find((track) => track.id === filter)?.modules ?? [];
  const selectedModule = modules.find((item) => item.id === moduleId);

  const q = query.trim().toLowerCase();
  const list = trackLessons(filter).filter((l) => {
      if (selectedModule && !selectedModule.lessons.includes(l.id)) return false;
      if (subject !== "all" && l.subject !== subject) return false;
      if (level !== "all" && lessonLevel(l.level) !== Number(level)) return false;
      if (!q) return true;
      const hay = [l.title.en, l.title.ar, l.summary.en, l.summary.ar, l.subject, ...Object.values(subjects.find((s) => s.id === l.subject)?.title ?? {}), ...l.cards.flatMap((c) => [c.title.en, c.title.ar])].join(" ").toLowerCase();
      return hay.includes(q);
  });

  return (
    <>

      <div className="relative">
        <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input !rounded-full ps-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(S.library.search)} aria-label={t(S.library.search)} />
      </div>

      <div className={`grid gap-3 ${filter === "explore" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <Select label={t(S.dash.module)} value={selectedModule?.id ?? "all"} onChange={setModuleId}
          options={[{ value: "all", label: t(S.library.allModules) }, ...modules.map((module) => ({ value: module.id, label: t(module.title) }))]} />
        <Select label={t(S.instructor.subject)} value={subject} onChange={setSubject}
          options={[{ value: "all", label: t(S.library.allSubjects) }, ...subjects.map((s) => ({ value: s.id, label: t(subjectTitle(s, filter)) }))]} />
        {filter !== "explore" && <Select label={t(S.instructor.level)} value={level} onChange={setLevel}
          options={[{ value: "all", label: t(S.instructor.allLevels) }, ...levels.map((l) => ({ value: String(l.id), label: t(l.title) }))]} />}
      </div>

      {list.length === 0 ? (
        <p className="card p-10 text-center text-ink-soft">{t(S.library.empty)}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((l) => {
            const lp = progress.lessons[l.id];
            const pct = lp?.completedAt ? 100 : lp ? Math.round(((lp.card + (lp.cardsDone ? 1 : 0)) / l.cards.length) * 100) : 0;
            const meta = TRACK_META[filter];
            const trackTitle = t(tracks.find((tr) => tr.id === filter)?.title);
            const firstVisual = l.cards.find((c) => c.visual && c.visual !== "none")?.visual;
            return (
              <Link key={l.id} href={`/course/?id=${l.id}&track=${filter}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                {COURSE_IMAGES_ENABLED && <div className="relative h-40 bg-white">
                  <CardVisual kind={firstVisual} className="!rounded-none" labels={l.explain_back?.key_ideas.map((k) => k.en)} />
                </div>}
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.ring}`}>{trackTitle}</span>
                    <span className="text-xs text-brand-700">{t(subjectTitle(subjects.find((subject) => subject.id === l.subject), filter))}</span>
                  </div>
                  <h3 className="font-semibold text-ink group-hover:text-brand-800">{t(l.title)}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{t(l.summary)}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {l.cards.length} {t(S.library.cards)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {l.minutes} {t(S.library.min)}</span>
                    <span>{t(levels.find((level) => level.id === lessonLevel(l.level))?.title)}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
