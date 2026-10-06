"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { Suspense, useState } from "react";
import { MessageCircleQuestion, PartyPopper } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardView } from "@/features/learning/CardView";
import { Quiz } from "@/features/learning/Quiz";
import { Companion, Notes, Steps } from "@/features/learning/SidePanel";
import { useContent } from "@/features/courses/ContentProvider";
import { subjectTitle } from "@/features/courses/catalog";
import { useI18n } from "@/lib/i18n";
import { useLessonProgress } from "@/features/learning/progress";
import { useSession } from "@/features/auth/SessionProvider";
import { useProgress } from "@/features/learning/progress";
import { isTrackId, lessonLevel } from "@/lib/types";
import { S } from "@/lib/strings";

type Phase = "cards" | "quiz" | "done";

export default function LessonPage() {
  return (
    <AppShell>
      <Suspense>
        <PlayerBoundary />
      </Suspense>
    </AppShell>
  );
}

function PlayerBoundary() {
  const params = useSearchParams();
  const { user } = useSession();
  return <LessonPlayer key={`${user?.id}:${params.get("id")}`} />;
}

function LessonPlayer() {
  const { getLesson, getTrack, subjects, levels, nextLessonAfter, comingSoon } = useContent();
  const { t, lang } = useI18n();
  const { prefs, user } = useSession();
  const progress = useProgress();
  const params = useSearchParams();
  const router = useRouter();
  const lesson = getLesson(params.get("id"));
  const [p, update] = useLessonProgress(lesson?.id);
  const step = params.get("step");
  const [phase, setPhase] = useState<Phase>((step === "explain" || step === "quiz") && lesson?.quiz?.length ? "quiz" : "cards");
  const [index, setIndex] = useState(() => Math.max(0, Math.min(p.card, (lesson?.cards.length ?? 1) - 1)));
  const [question, setQuestion] = useState(0);
  const [seed, setSeed] = useState<{ q: string; n: number } | null>(null);
  const [shownId, setShownId] = useState(lesson?.id);

  // Moving to another lesson keeps this component mounted: resume that lesson instead.
  if (lesson && shownId !== lesson.id) {
    setShownId(lesson.id);
    setPhase((step === "explain" || step === "quiz") && lesson.quiz?.length ? "quiz" : "cards");
    setIndex(Math.max(0, Math.min(p.card, lesson.cards.length - 1)));
    setQuestion(0);
    setSeed(null);
  }

  if (!lesson) {
    const soon = comingSoon[params.get("id") ?? ""];
    return (
      <div className="card p-10 text-center">
        {soon && <h1 className="mb-2 font-serif text-2xl text-ink">{t(soon.title)}</h1>}
        <p className="text-ink-soft">{t(soon ? S.lesson.comingSoon : S.lesson.notFound)}</p>
        <Link href="/library/" className="btn btn-primary mt-4">{t(S.lesson.back)}</Link>
      </div>
    );
  }

  const cards = lesson.cards;
  const card = cards[index];
  const hasQuiz = !!lesson.quiz?.length;
  const urlTrack = params.get("track");
  const audience = isTrackId(urlTrack) ? urlTrack : isTrackId(prefs.track) ? prefs.track : null;
  const requestedTrack = lesson.tracks.find((id) => id === params.get("track"));
  const trackId = requestedTrack ?? (prefs.track && lesson.tracks.includes(prefs.track) ? prefs.track : lesson.tracks[0]);
  const track = getTrack(trackId);
  const next = nextLessonAfter(lesson.id, trackId)?.find((course) => !progress.lessons[course.id]?.completedAt);
  // Pages and questions are counted apart: "Page 3 of 6", then "Question 1 of 3".
  const inQuiz = phase === "quiz";
  const lastPage = index + 1 >= cards.length;
  const total = inQuiz ? lesson.quiz!.length : cards.length;
  const position = inQuiz ? question + 1 : phase === "cards" ? index + 1 : total;

  function goNextCard() {
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      update({ card: index + 1 });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    update({ cardsDone: true, card: index });
    setQuestion(0);
    setPhase(hasQuiz ? "quiz" : "done");
    if (!hasQuiz) update({ completedAt: new Date().toISOString() });
  }

  function askAbout(q: string) {
    setSeed({ q, n: Date.now() });
    document.getElementById("companion")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="card min-w-0 p-5 sm:p-8">
        <button onClick={() => router.push("/library/")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <span aria-hidden className="rtl:rotate-180">←</span> {t(S.lesson.back)}
        </button>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-700">
          {t(S.lesson.courseIn)}: {" "}
          {[track?.title, track?.modules.find((module) => module.lessons.includes(lesson.id))?.title].filter(Boolean).map((title) => t(title)).join(" › ")}
        </p>
        <h1 className="mt-1 font-serif text-2xl leading-snug text-ink">{t(lesson.title)}</h1>
        <p className="mt-1 text-sm text-muted">{t(subjectTitle(subjects.find((subject) => subject.id === lesson.subject), trackId))} · {t(levels.find((level) => level.id === lessonLevel(lesson.level))?.title)}</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-line">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500" style={{ width: `${(position / total) * 100}%` }} />
          </div>
          {phase !== "done" && <span className="shrink-0 text-sm tabular-nums text-muted">{t(inQuiz ? S.lesson.question : S.lesson.page)} {position} {t(S.lesson.of)} {total}</span>}
        </div>
        <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-900 xl:hidden"
          onClick={() => askAbout(t(phase === "cards" ? S.lesson.pageQuestion : S.lesson.courseQuestion))}>
          <MessageCircleQuestion className="h-4 w-4" aria-hidden />{t(S.lesson.ask)}
        </button>

        <div className="mt-8">
          {phase === "cards" && card && <CardView key={card.id} lesson={lesson} card={card} onAsk={askAbout} />}
          {phase === "quiz" && (
            <Quiz key={lesson.id}
              lesson={lesson}
              index={question}
              onIndex={setQuestion}
              onBack={() => setPhase("cards")}
              onFinish={(score) => {
                update({ quizScore: score, completedAt: new Date().toISOString() });
                setPhase("done");
              }}
            />
          )}
          {phase === "done" && (
            <section className="rise py-6 text-center">
              <PartyPopper className="mx-auto h-12 w-12 text-gold" />
              <h2 className="mt-4 font-serif text-4xl text-ink">{t(S.lesson.doneTitle)}</h2>
              <p className="mt-2 text-ink-soft">{t(S.lesson.doneSub)}</p>
              {p.quizScore != null && <p className="mt-2 text-sm text-muted">{Math.round(p.quizScore * 100)}%</p>}
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {next && (
                  <Link href={`/course/?id=${next.id}${audience ? `&track=${audience}` : ""}`} className="btn btn-primary">
                    {t(S.lesson.nextLesson)}: {t(next.title)} <span aria-hidden className="rtl:rotate-180">→</span>
                  </Link>
                )}
                <Link href="/learn/" className="btn btn-ghost">{t(S.lesson.toDashboard)}</Link>
              </div>
            </section>
          )}
        </div>

        {phase === "cards" && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}>
              <span aria-hidden className="rtl:rotate-180">←</span> {t(S.lesson.previous)}
            </button>
            <button className="btn btn-primary" onClick={goNextCard}>
              {t(lastPage && hasQuiz ? S.lesson.startQuiz : S.lesson.continue)} <span aria-hidden className="rtl:rotate-180">→</span>
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Companion key={`companion-${user?.id}-${lesson.id}-${audience ?? "unknown"}-${lang}`} lesson={lesson} card={phase === "cards" ? card ?? null : null} seed={seed} audience={audience} />
        <Steps p={p} hasQuiz={hasQuiz} />
        <Notes key={`notes-${lesson.id}`} lessonId={lesson.id} />
      </aside>
    </div>
  );
}
