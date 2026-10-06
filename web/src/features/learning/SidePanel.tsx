"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Circle, Eye, GraduationCap, Info, Lightbulb, ListChecks, Plus, Send, Sparkles, WholeWord, X } from "lucide-react";
import { ask } from "@/features/ask/api";
import { chatHistory } from "@/features/ask/history";
import { PersonaIdentity } from "@/components/PersonaIdentity";
import { AnswerListen } from "@/features/ask/AnswerListen";
import { PERSONAS } from "@/lib/personas";
import { useI18n } from "@/lib/i18n";
import { saveNote, useProgress, type LessonProgress } from "@/features/learning/progress";
import { S } from "@/lib/strings";
import type { AskResponse, Bi, Card, Lesson, QuizItem, TrackId } from "@/lib/types";
import { AnswerView } from "@/features/ask/Answer";

type Page = Pick<Card, "id" | "title">;
type Exchange = { id: string; question: string; answer: AskResponse; page: Page | null };
type PracticeCommand = { kind: "hint" | "reveal"; n: number };

function Asked({ question, page }: { question: string; page: Page | null }) {
  const { t } = useI18n();
  return (
    <div className="ms-auto w-fit max-w-[90%] rounded-2xl rounded-ee-md bg-brand-600 px-3.5 py-2.5 text-sm text-white">
      {page && <p className="mb-1 text-xs text-brand-100">{t(page.title)}</p>}
      <p className="whitespace-pre-wrap break-words">{question}</p>
    </div>
  );
}

/** Generated questions and scores live only in this chat's memory. */
function Practice({ items, page, onMore, command, busy }: {
  items: QuizItem[]; page: Page | null;
  onMore: () => void; command?: PracticeCommand; busy: boolean;
}) {
  const { t } = useI18n();
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [hint, setHint] = useState(false);
  const [seenCommand, setSeenCommand] = useState(command);
  if (command && command !== seenCommand) {
    setSeenCommand(command);
    if (command.kind === "hint") setHint(true);
    else if (picked === null) setPicked(-1);
  }
  const block = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (focusNext.current) {
      block.current?.querySelector<HTMLElement>("[data-practice-question]")?.focus({ preventScroll: true });
      focusNext.current = false;
    }
    const log = block.current?.closest<HTMLElement>('[role="log"]');
    if (log && block.current) log.scrollTo({ top: block.current.offsetTop - parseFloat(getComputedStyle(log).paddingTop), behavior: "instant" });
  }, [at]);
  const item = items[at];
  const answered = picked !== null;

  return (
    <div ref={block} data-chat-reply className="space-y-3">
      <div className="space-y-3 rounded-2xl rounded-ss-md bg-sky-50 p-4 text-base">
        {page && <p className="text-xs font-medium text-brand-700">{t(S.lesson.page)}: {t(page.title)}</p>}
        <p className="text-xs text-muted">{t(S.lesson.aiPractice)}</p>
        <p className="text-xs leading-relaxed text-muted">{t(S.lesson.practiceNoScore)}</p>
        {item ? <>
          <p className="text-xs font-medium text-muted">{t(S.lesson.question)} {at + 1} {t(S.lesson.of)} {items.length}</p>
          <h3 tabIndex={-1} data-practice-question className="font-medium leading-relaxed text-ink">{t(item.question)}</h3>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold text-ink-soft">{t(S.lesson.answerChoices)}</legend>
            {item.options.map((option, index) => {
              const state = !answered ? "idle" : index === item.answer ? "right" : index === picked ? "wrong" : "idle";
              return (
                <button key={index} type="button" disabled={answered} onClick={() => { setPicked(index); if (index === item.answer) setScore(score + 1); }}
                  className={`flex min-h-11 w-full items-start gap-3 rounded-xl border px-3 py-3 text-start transition ${
                    state === "right" ? "border-brand-400 bg-brand-50 font-medium text-brand-800" : state === "wrong" ? "border-rose/50 bg-rose/5 text-ink" : `border-line bg-white text-ink-soft ${answered ? "" : "hover:border-brand-300 hover:text-brand-800"}`
                  }`}>
                  {state === "right" ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    : state === "wrong" ? <X className="mt-0.5 h-5 w-5 shrink-0 text-rose" aria-hidden />
                    : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />}
                  <span className="min-w-0 leading-relaxed">{t(option)}</span>
                </button>
              );
            })}
          </fieldset>
          {!answered && <div role="group" aria-label={t(S.lesson.practiceHelp)} className="space-y-2 border-t border-brand-200 pt-3">
            <p className="text-xs font-medium text-muted">{t(S.lesson.practiceHelp)}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {item.hint && t(item.hint).trim() && <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50" aria-expanded={hint} onClick={() => setHint((shown) => !shown)}><Lightbulb className="h-4 w-4 shrink-0" aria-hidden />{t(hint ? S.lesson.hideHint : S.lesson.showHint)}</button>}
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => setPicked(-1)}><Eye className="h-4 w-4 shrink-0" aria-hidden />{t(S.lesson.showPracticeAnswer)}</button>
            </div>
            {hint && item.hint && <p className="rounded-lg border-s-2 border-brand-300 bg-white px-3 py-2 leading-relaxed text-ink-soft">{t(item.hint)}</p>}
          </div>}
          {answered && <>
            <p className={`font-semibold ${picked === -1 || picked === item.answer ? "text-brand-700" : "text-rose"}`}>{t(picked === -1 ? S.lesson.practiceAnswerShown : picked === item.answer ? S.lesson.correct : S.lesson.notQuite)}</p>
            {item.explanation && <p className="leading-relaxed text-ink-soft">{t(item.explanation)}</p>}
            <button type="button" className="btn btn-primary min-h-11 !py-2 !text-sm" onClick={() => { focusNext.current = true; setAt(at + 1); setPicked(null); setHint(false); }}>
              {t(at + 1 < items.length ? S.lesson.nextQuestion : S.lesson.seeScore)} <span aria-hidden className="rtl:rotate-180">→</span>
            </button>
          </>}
        </> : <>
          <h3 tabIndex={-1} data-practice-question className="font-medium text-ink">{t(S.lesson.practiceScore)} {score} {t(S.lesson.of)} {items.length}</h3>
          <button type="button" className="btn btn-ghost min-h-11 !py-2 !text-sm" onClick={() => { focusNext.current = true; setAt(0); setScore(0); setPicked(null); setHint(false); }}>{t(S.ask.retry)}</button>
        </>}
        <div className="border-t border-brand-200 pt-3">
          <button type="button" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 py-2 text-start text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40" onClick={onMore}><Plus className="h-4 w-4 shrink-0" aria-hidden />{t(S.lesson.morePractice)}</button>
        </div>
      </div>
    </div>
  );
}

export function Companion({ lesson, card, seed, audience }: { lesson: Lesson; card: Pick<Card, "id" | "title"> | null; seed: { q: string; n: number } | null; audience: TrackId | null }) {
  const { t, lang } = useI18n();
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState<{ question: string; page: Page | null } | null>(null);
  const [error, setError] = useState<{ message: string; question: string; page: Page | null; practice: boolean } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(seed);
  const [practiceCommand, setPracticeCommand] = useState<PracticeCommand | undefined>();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const practiceQuestions = useRef<string[]>([]);

  if (seed !== seen) {
    setSeen(seed);
    if (seed) setQ(seed.q.slice(0, 1500));
  }

  useEffect(() => {
    if (seed) input.current?.focus({ preventScroll: true });
  }, [seed]);

  useEffect(() => {
    const container = log.current;
    const newest = pending || error ? container?.lastElementChild as HTMLElement | null : container?.lastElementChild?.querySelector<HTMLElement>("[data-chat-reply]");
    if (container) container.scrollTo({ top: newest ? newest.offsetTop - parseFloat(getComputedStyle(container).paddingTop) : 0, behavior: "instant" });
  }, [pending, exchanges, error]);

  async function submit(e?: React.FormEvent, question = q, page: Page | null = card, generate = false) {
    e?.preventDefault();
    if (!question.trim() || question.trim() === t(S.lesson.wordPrefix).trim() || question.length > 1500 || controller.current) return;
    const last = exchanges.at(-1);
    if (card && last?.page?.id === card.id && last.answer.practice?.length) {
      const hint = /\b(?:hint|clue)\b|تلميح|لمحة/i.test(question);
      const reveal = /^(?:show|give|reveal|tell|what(?:'s| is)).*(?:answer|solution)|^(?:اعرض|أظهر|اظهر|أعطني|اعطني|أخبرني|اخبرني).*?(?:(?:ال)?[إاأ]جابة|الحل)/i.test(question.trim());
      if (!generate && (hint || reveal)) { setPracticeCommand((previous) => ({ kind: hint ? "hint" : "reveal", n: (previous?.n ?? 0) + 1 })); if (question === q) setQ(""); return; }
    }
    const history = chatHistory(exchanges.flatMap((exchange) => [
      { role: "user" as const, text: exchange.question }, { role: "assistant" as const, data: exchange.answer },
    ]));
    controller.current = new AbortController();
    setBusy(true);
    setPending({ question, page });
    if (question === q) setQ("");
    setError(null);
    try {
      const data = await ask({ question, lang, lesson_id: lesson.id, card_id: page?.id ?? null, practice: generate,
        practice_avoid: practiceQuestions.current, track: audience, history }, controller.current.signal);
      if (active.current) {
        // ponytail: keep the latest 1,000 bilingual prompts if a chat exceeds 160 practice batches.
        practiceQuestions.current = [...practiceQuestions.current, ...(data.practice ?? []).flatMap((item) => [item.question.en, item.question.ar])].slice(-1000);
        const exchange = { id: crypto.randomUUID(), question, answer: data, page };
        setExchanges((previous) => [...previous, exchange].slice(-8));
      }
    } catch {
      if (active.current) setError({ message: t(S.ask.error), question, page, practice: generate });
    } finally {
      if (active.current) { setBusy(false); setPending(null); controller.current = null; }
    }
  }

  const suggestions: { label: Bi; question: Bi; icon: typeof Sparkles; kind: "ask" | "word" | "test" }[] = card ? [
    { label: S.lesson.explainAction, question: S.lesson.pageQuestion, icon: Sparkles, kind: "ask" },
    { label: S.lesson.keyPointsAction, question: S.lesson.pageKeyPoints, icon: ListChecks, kind: "ask" },
    { label: S.lesson.wordAction, question: S.lesson.pageWord, icon: WholeWord, kind: "word" },
    { label: S.lesson.testMe, question: S.lesson.testMe, icon: GraduationCap, kind: "test" },
  ] : [{ label: S.lesson.keyPointsAction, question: S.lesson.courseQuestion, icon: Sparkles, kind: "ask" }];

  function pick(kind: "ask" | "word" | "test", label: Bi) {
    if (kind === "test") {
      void submit(undefined, t(S.lesson.testMe), card, true);
    }
    // The learner still has to type the word: fill the box and wait.
    else if (kind === "word") { setQ(t(S.lesson.wordPrefix)); input.current?.focus(); }
    else void submit(undefined, t(label));
  }

  return (
    <section className="card flex h-[min(38rem,calc(100dvh-11rem))] min-h-96 flex-col overflow-hidden lg:h-[min(42rem,calc(100dvh-8rem))]" id="companion" aria-label={t(S.lesson.companion)}>
      <header className="flex min-h-15 shrink-0 items-center gap-2 border-b border-line bg-brand-50/50 px-4 py-2">
          <PersonaIdentity persona={PERSONAS.mariam} heading="h2" inline showRole={false} />
          {(exchanges.length > 0 || error) && <button type="button" className="ms-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-white disabled:opacity-40" disabled={busy}
            aria-label={t(S.ask.newChat)} title={t(S.ask.newChat)} onClick={() => { setExchanges([]); setError(null); setQ(""); practiceQuestions.current = []; setPracticeCommand(undefined); }}><Plus className="h-4 w-4" /></button>}
      </header>
      <div ref={log} role="log" aria-live="polite" className="chat-scroll relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-sky-50/20 p-4 [overflow-anchor:none]">
        {exchanges.length === 0 && !pending && !error && <div className="mx-auto flex min-h-full max-w-xs flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Sparkles className="h-5 w-5" aria-hidden /></span>
          <h3 className="font-serif text-xl leading-snug text-ink">{t(S.lesson.companionWelcomeTitle)}</h3>
          <p className="text-sm leading-relaxed text-ink-soft">{t(card ? S.lesson.companionWelcome : S.lesson.companionSub)}</p>
          <p className="text-xs leading-relaxed text-muted">{t(S.lesson.companionWelcomeHint)}</p>
        </div>}
        {exchanges.map((exchange, index) => <div key={exchange.id} hidden={!card && !!exchange.answer.practice?.length} className="space-y-3">
          <Asked question={exchange.question} page={exchange.page} />
          {exchange.answer.practice?.length ? <Practice items={exchange.answer.practice} page={exchange.page} busy={busy}
            command={index === exchanges.length - 1 ? practiceCommand : undefined}
            onMore={() => void submit(undefined, t(S.lesson.morePractice), exchange.page, true)} /> : <div data-chat-reply className="min-w-0 rounded-2xl rounded-ss-md bg-sky-50/60 p-4">
            <AnswerView data={exchange.answer} animate={index === exchanges.length - 1} showSources={false} listen={<AnswerListen answer={exchange.answer.answer} lang={lang} voice={PERSONAS.mariam.gender} />} onFollowUp={busy ? undefined : (followUp) => void submit(undefined, followUp, exchange.page)} />
          </div>}
        </div>)}
        {pending && <div className="space-y-3">
          <Asked question={pending.question} page={pending.page} />
          <p className="flex items-center gap-2 text-sm text-muted"><Sparkles className="h-4 w-4 animate-pulse text-brand-500 motion-reduce:animate-none" aria-hidden />{t(S.ask.thinking)}</p>
        </div>}
        {error && <div className="space-y-3">
          <Asked question={error.question} page={error.page} />
          <div role="alert" className="space-y-2 text-sm text-red-700">
            <p>{error.message}</p>
            <button type="button" disabled={busy} className="btn btn-ghost min-h-11 !text-sm" onClick={() => void submit(undefined, error.question, error.page, error.practice)}>{t(S.ask.retry)}</button>
          </div>
        </div>}
      </div>
      <div className="shrink-0 border-t border-line bg-white p-3">
      {exchanges.length === 0 && <div className="mb-3 grid grid-cols-2 gap-2" aria-label={t(S.lesson.tryAsking)}>
        {suggestions.map(({ label, question, icon: Icon, kind }) => <button key={question.en} type="button" disabled={busy} title={t(question)}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-start text-sm text-ink-soft transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-40"
          onClick={() => pick(kind, question)}><Icon className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />{t(label)}</button>)}
      </div>}
      <form onSubmit={(event) => void submit(event)} className="relative">
        <textarea ref={input} rows={1} className="input block min-h-14 resize-none rounded-2xl py-3 ps-3 pe-16 text-base" maxLength={1500} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
          aria-label={t(S.lesson.companionPlaceholder)} placeholder={t(S.lesson.companionPlaceholder)} />
        <button className="absolute bottom-1.5 end-1.5 grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-sky-200 disabled:text-muted" disabled={busy || !q.trim() || q.trim() === t(S.lesson.wordPrefix).trim()} aria-label={t(S.ask.send)}>
          <Send className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </form>
      {q.trim() === t(S.lesson.wordPrefix).trim() && <p className="mt-2 text-xs text-muted">{t(S.lesson.wordHint)}</p>}
      <div className="group relative mx-auto mt-1 w-fit text-center text-[0.7rem] leading-relaxed text-muted">
        <span tabIndex={0} aria-describedby="companion-ai-notice" onPointerEnter={() => setNoticeDismissed(false)} onFocus={() => setNoticeDismissed(false)} onKeyDown={(e) => { if (e.key === "Escape") setNoticeDismissed(true); }}
          className="inline-flex min-h-6 items-center gap-1.5 rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"><Info className="h-3 w-3" aria-hidden />{t(S.lesson.aiNotice)}</span>
        <span id="companion-ai-notice" role="tooltip" hidden={noticeDismissed} className="invisible absolute start-1/2 bottom-[calc(100%+4rem)] z-10 mb-2 w-[min(18rem,calc(100vw-4rem))] -translate-x-1/2 rounded-xl bg-ink px-3 py-2.5 text-start text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 rtl:translate-x-1/2">
          {t(S.ask.disclaimer)}<span aria-hidden className="absolute start-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink" />
        </span>
      </div>
      </div>
    </section>
  );
}

export function Notes({ lessonId }: { lessonId: string }) {
  const { t } = useI18n();
  const progress = useProgress();
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState<{ id: string; note: string | undefined }>({ id: lessonId, note: undefined });
  const saved = progress.notes[lessonId];
  if (loaded.id !== lessonId || loaded.note !== saved) {
    setLoaded({ id: lessonId, note: saved });
    setText(saved ?? "");
  }

  return (
    <section className="card p-5">
      <p className="font-semibold text-ink">{t(S.lesson.notes)}</p>
      <textarea
        className="input mt-3 min-h-24 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => saveNote(lessonId, text)}
        aria-label={t(S.lesson.notes)}
        placeholder={t(S.lesson.notesPlaceholder)}
      />
    </section>
  );
}

export function Steps({ p, hasQuiz }: { p: LessonProgress; hasQuiz: boolean }) {
  const { t } = useI18n();
  const items = [
    { label: S.lesson.stepCards, done: p.cardsDone },
    ...(hasQuiz ? [{ label: S.lesson.stepQuiz, done: p.quizScore != null }] : []),
    { label: S.lesson.stepDone, done: !!p.completedAt },
  ];
  return (
    <section className="card p-5">
      <p className="font-semibold text-ink">{t(S.lesson.progress)}</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.label.en} className="flex items-center gap-2.5 text-sm">
            {it.done ? <CheckCircle2 className="h-4.5 w-4.5 text-brand-500" /> : <Circle className="h-4.5 w-4.5 text-line" />}
            <span className={it.done ? "text-ink" : "text-muted"}>{t(it.label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
