"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, BookOpen, Info, Library, Mic, Plus, RotateCcw, ScrollText, Send, Sparkles, Square, UserCheck, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PersonaIdentity } from "@/components/PersonaIdentity";
import { AnswerView } from "@/features/ask/Answer";
import { AnswerListen } from "@/features/ask/AnswerListen";
import { SourceReference } from "@/features/courses/content";
import { ask, askStream } from "@/features/ask/api";
import { chatHistory, type ChatMessage } from "@/features/ask/history";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { isTrackId, type AskResponse, type Bi, type TrackId } from "@/lib/types";
import { useDictation } from "@/lib/voice";
import { journeyGuide } from "@/lib/personas";

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const EXAMPLES: Record<TrackId, Bi[]> = {
  explore: [
    { en: "What is Islam, and who is its message for?", ar: "ما الإسلام؟ ولمن جاءت رسالته؟" },
    { en: "What do Muslims mean by believing in one God?", ar: "ماذا يعني الإيمان بإله واحد عند المسلمين؟" },
    { en: "How does Islam view other religions?", ar: "كيف ينظر الإسلام إلى الأديان الأخرى؟" },
  ],
  "first-steps": [
    { en: "How can I begin learning to pray?", ar: "كيف أبدأ تعلّم الصلاة؟" },
    { en: "What is wudu, and how do I do it?", ar: "ما الوضوء؟ وكيف أتوضّأ؟" },
    { en: "I'm new to Islam. What should I learn first?", ar: "أنا مسلم جديد. ماذا أتعلم أولًا؟" },
  ],
  deepen: [
    { en: "What does “Master of the Day of Judgement” mean?", ar: "ما معنى «مالك يوم الدين»؟" },
    { en: "Why do Muslims face the qibla?", ar: "لماذا يستقبل المسلمون القبلة؟" },
    { en: "Give me a hadith proving this saying", ar: "أعطني حديثًا يثبت هذه المقولة" },
  ],
};

const TRUSTED = [
  { icon: BookOpen, title: S.trust.quran, sub: S.trust.quranSub },
  { icon: ScrollText, title: S.trust.hadith, sub: S.trust.hadithSub },
  { icon: Library, title: S.trust.tafsir, sub: S.trust.tafsirSub },
  { icon: UserCheck, title: S.trust.review, sub: S.trust.reviewSub },
];

export default function AskPage() {
  return (
    <Suspense><ChatBoundary /></Suspense>
  );
}

function ChatBoundary() {
  const { user, prefs } = useSession();
  const { lang } = useI18n();
  const requestedTrack = useSearchParams().get("track");
  const track = isTrackId(requestedTrack) ? requestedTrack : isTrackId(prefs.track) ? prefs.track : "explore";
  return <AskAndCheck key={`${user?.id}:${track}:${lang}`} track={track} />;
}

function AskAndCheck({ track }: { track: TrackId }) {
  const { t, lang } = useI18n();
  const { getTrack } = useContent();
  const persona = journeyGuide(track);
  const journey = getTrack(track);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia("(min-width: 1024px)").matches, () => false);
  const [sourcesOpen, setSourcesOpen] = useState<boolean | null>(null);
  const showSources = sourcesOpen ?? desktop;
  const sourcesButton = useRef<HTMLButtonElement>(null);
  const closeSources = () => { setSourcesOpen(false); sourcesButton.current?.focus({ preventScroll: true }); };
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    // Drop conversations saved by earlier versions.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("yaqin.ask.")) localStorage.removeItem(key);
      }
    } catch { /* Chat also works when browser storage is blocked. */ }
    const reset = () => {
      controller.current?.abort();
      setMsgs([]);
      setQ("");
      setBusy(false);
    };
    // Clear before the browser can preserve this document in its Back/Forward cache.
    window.addEventListener("pagehide", reset);
    return () => {
      active.current = false;
      reset();
      window.removeEventListener("pagehide", reset);
    };
  }, []);
  const log = useRef<HTMLDivElement>(null);
  const onText = useCallback((s: string) => setQ(s.slice(0, 1500)), [setQ]);
  const dictation = useDictation(lang, onText);
  const newestQuestion = msgs.findLast((m) => m.role === "user");
  const lastRole = msgs.at(-1)?.role;

  useEffect(() => {
    const container = log.current;
    const newest = container?.lastElementChild as HTMLElement | null;
    if (container && newest) container.scrollTo({ top: newest.offsetTop - parseFloat(getComputedStyle(container).paddingTop), behavior: "instant" });
    // Position a new turn once. Draft/final updates preserve the user's reading position.
  }, [newestQuestion, lastRole]);

  async function send(question: string, retry = false) {
    if (!question.trim() || question.length > 1500 || busy) return;
    dictation.stop();
    // A retry replaces the failed question and its error message.
    const prior = retry ? msgs.slice(0, -2) : msgs;
    const history = chatHistory(prior);
    setMsgs([...prior.slice(-29), { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    const requestController = new AbortController();
    controller.current = requestController;
    let drafted = false;
    // On `final` (or the fallback), replace the shown draft; otherwise append a fresh answer.
    const settle = (data: AskResponse) => setMsgs((m) =>
      drafted && m.at(-1)?.role === "assistant" ? [...m.slice(0, -1), { role: "assistant", data }]
        : [...m.slice(-29), { role: "assistant", data }]);
    try {
      await askStream({ question, lang, track, history }, {
        onDraft: (data) => {
          if (!active.current || requestController.signal.aborted) return;
          const first = !drafted;
          drafted = true;
          // Each update carries the whole answer so far: replace the bubble in place.
          setMsgs((m) => first || m.at(-1)?.role !== "assistant"
            ? [...m.slice(-29), { role: "assistant", data: { ...data, verifying: true } }]
            : [...m.slice(0, -1), { role: "assistant", data: { ...data, verifying: true } }]);
        },
        onFinal: (data) => { if (active.current && !requestController.signal.aborted) settle({ ...data, verifying: false }); },
      }, requestController.signal);
    } catch {
      if (!active.current || requestController.signal.aborted) return;
      // The stream failed: try the plain answer once before giving up.
      try {
        const data = await ask({ question, lang, track, history }, requestController.signal);
        if (active.current && !requestController.signal.aborted) settle({ ...data, verifying: false });
      } catch {
        if (active.current && !requestController.signal.aborted) setMsgs((m) => (drafted && m.at(-1)?.role === "assistant" ? m.slice(0, -1) : m).slice(-29).concat({ role: "error" }));
      }
    } finally {
      if (active.current && !requestController.signal.aborted) setBusy(false);
    }
  }

  const lastAnswer = msgs.findLast((m) => m.role === "assistant")?.data;
  const cited = lastAnswer ? Array.from(new Set(lastAnswer.answer.flatMap((block) =>
    block.type === "source" && lastAnswer.sources[block.id] ? [block.id] : []))) : [];
  return (
    <AppShell workspace toolbar={
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <PersonaIdentity persona={persona} heading="h2" inline detail={journey && t(journey.title)} />
          </div>
          <button ref={sourcesButton} type="button" aria-expanded={showSources} aria-controls="ask-sources" aria-label={t(cited.length ? S.ask.related : S.ask.trusted)}
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 text-xs transition hover:bg-brand-50 ${showSources ? "bg-brand-50 text-brand-700" : "text-ink-soft"}`}
            onClick={() => setSourcesOpen(!showSources)}><BookOpen className="h-4 w-4" aria-hidden /><span className="hidden xl:inline">{t(S.ask.sourcesLabel)}</span>{cited.length > 0 && <span>{cited.length}</span>}</button>
          {msgs.length > 0 && (
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-brand-50 disabled:opacity-40" disabled={busy} onClick={() => setMsgs([])} aria-label={t(S.ask.newChat)}>
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
    }>
    <h1 className="sr-only">{t(S.nav.ask)}</h1>
    <div dir="ltr" className="ask-workspace relative flex min-h-0 flex-1 overflow-hidden">
      <section dir={lang === "ar" ? "rtl" : "ltr"} aria-label={t(S.nav.ask)} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={log} role="log" aria-live="polite" className="chat-scroll relative min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain bg-white px-5 py-6 [overflow-anchor:none] sm:px-8 sm:py-8">
          {msgs.length === 0 && (
            <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-3 text-center">
              <h2 className="font-serif text-2xl text-ink sm:text-3xl">{t({ en: "What would you like to understand?", ar: "ما الذي ترغب في فهمه؟" })}</h2>
              <p className="pb-3 leading-relaxed text-ink-soft">{t(persona.welcome)}</p>
              {EXAMPLES[track].map((e) => (
                <button key={e.en} onClick={() => send(t(e))} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-start text-sm font-medium text-ink shadow-[0_1px_2px_rgb(16_43_78/0.05)] transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-sky-50 hover:shadow-md motion-reduce:hover:translate-y-0">
                  {t(e)}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                    <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="mx-auto flex max-w-[45rem] justify-end">
                <p className="max-w-[90%] break-words rounded-2xl rounded-ee-md bg-brand-50 px-4 py-2.5 text-sm text-ink">{m.text}</p>
              </div>
            ) : m.role === "assistant" ? (
              <div key={i} className="mx-auto min-w-0 max-w-[45rem]">
                  <AnswerView data={m.data} animate={i === msgs.length - 1} author={t(persona.name)} showSources={false} listen={<AnswerListen answer={m.data.answer} lang={lang} voice={persona.gender} />} onFollowUp={busy ? undefined : (f) => void send(f)} />
              </div>
            ) : (
              <div key={i} className="mx-auto flex max-w-[45rem] flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p>{t(S.ask.error)}</p>
                {i === msgs.length - 1 && msgs[i - 1]?.role === "user" && (
                  <button className="flex items-center gap-1.5 font-semibold underline" disabled={busy} onClick={() => void send((msgs[i - 1] as { text: string }).text, true)}>
                    <RotateCcw className="h-3.5 w-3.5" /> {t(S.ask.retry)}
                  </button>
                )}
              </div>
            ),
          )}
          {busy && lastRole !== "assistant" && (
            <div className="mx-auto max-w-[45rem]">
              <p className="flex w-fit items-center gap-2 py-2.5 text-sm text-muted">
                <Sparkles className="h-4 w-4 animate-pulse text-brand-500 motion-reduce:animate-none" aria-hidden /> {t(S.ask.thinking)}
              </p>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(q);
          }}
          className="shrink-0 bg-white px-4 pb-3 pt-2 sm:px-8"
        >
          <div className="relative mx-auto flex max-w-[45rem] items-center gap-2">
            <input className="input !rounded-full !py-3.5 pe-28 text-base shadow-[0_4px_20px_-15px_rgb(16_43_78/0.3)] transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100" maxLength={1500} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(S.ask.placeholder)} aria-label={t(S.ask.placeholder)} />
            <div className="absolute end-1.5 flex gap-1">
              {dictation.supported && (
                <button type="button" onClick={dictation.listening ? dictation.stop : dictation.start} className={`grid h-11 w-11 place-items-center rounded-full transition ${dictation.listening ? "bg-rose text-white" : "text-ink-soft hover:bg-sky-50"}`} aria-label={t(S.ask.voice)}>
                  {dictation.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button className="grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-brand-200" disabled={busy || !q.trim()} aria-label={t(S.ask.send)}>
                <Send className="h-4 w-4 rtl:-scale-x-100" />
              </button>
            </div>
          </div>
          <details className="mx-auto mt-1 max-w-[45rem] text-center text-xs leading-relaxed text-muted">
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md px-1 text-[0.7rem] [&::-webkit-details-marker]:hidden">{t(S.ask.shortDisclaimer)}<Info className="h-3 w-3 shrink-0" aria-hidden /></summary>
            <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2">{t(S.ask.disclaimer)}</p>
          </details>
        </form>
      </section>

      {showSources && <button type="button" aria-label={t(S.ask.closeSources)} onClick={closeSources} className="absolute inset-0 z-10 bg-ink/10 lg:hidden" />}
      <aside id="ask-sources" hidden={!showSources} dir={lang === "ar" ? "rtl" : "ltr"} aria-labelledby="ask-sources-title" onKeyDown={(e) => { if (e.key === "Escape") closeSources(); }}
        className="ask-sources chat-scroll absolute inset-y-0 right-0 z-20 w-[min(19rem,90%)] shrink-0 overflow-y-auto border-l border-line bg-sky-50 shadow-xl lg:static lg:w-56 lg:shadow-none">
          <header className="flex items-center justify-between gap-2 px-4 pt-3">
            <h2 id="ask-sources-title" className="text-sm font-semibold text-ink">{t(cited.length ? S.ask.related : S.ask.trusted)}</h2>
            <button type="button" onClick={closeSources} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-brand-50" aria-label={t(S.ask.closeSources)}><X className="h-4 w-4" aria-hidden /></button>
          </header>
          <div className="p-4">
            {cited.length ? (
              <div className="space-y-3">
                {cited.map((id) => <SourceReference key={id} id={id} source={lastAnswer!.sources[id]} />)}
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {TRUSTED.map(({ icon: Icon, title, sub }) => (
                    <li key={title.en} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{t(title)}</span>
                        <span className="block text-xs text-muted">{t(sub)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">{t(S.ask.sourcesEmpty)}</p>
              </>
            )}
          </div>
      </aside>
    </div>
    </AppShell>
  );
}
