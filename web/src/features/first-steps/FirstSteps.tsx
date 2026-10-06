"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Droplets, ExternalLink, Heart, MessageCircle, Pause, PersonStanding, Play, RotateCcw, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { ARABIC, EDITIONS, RECITATION, audioUrl, loadIndex, loadSurah, type QuranIndex, type Verse } from "@/features/quran/data";
import { useRecitation } from "@/features/quran/useRecitation";
import { useI18n } from "@/lib/i18n";
import type { Bi } from "@/lib/types";
import { FIRST_STEPS as F, PRACTICE_STAGES, DAILY_PRAYERS, dailyPrayerSteps, firstStepsHref, type Activity, type DailyPrayer, type PracticeStage } from "./data";
import "./first-steps.css";

const ICONS = [Heart, Droplets, PersonStanding, BookOpen, MessageCircle, Users];

export default function FirstStepsPage() {
  const { t } = useI18n();
  return <AppShell title={t(F.title)} sub={t(F.sub)}>
    <Suspense><Journey /></Suspense>
  </AppShell>;
}

function Journey() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const found = PRACTICE_STAGES.findIndex((stage) => stage.id === params.get("step"));
  const at = found < 0 ? 0 : found;
  const stage = PRACTICE_STAGES[at];
  return <div className="first-steps space-y-6">
    <PageBanner title={t(F.title)} sub={t(F.sub)} />
    <h2 className="text-sm font-medium text-ink">{t(F.path)}</h2>
    <nav aria-label={t(F.path)} className="first-path"><ol>
      {PRACTICE_STAGES.map((s, i) => <li key={s.id}><Link href={firstStepsHref(s.id)} scroll={false} aria-current={at === i ? "step" : undefined}>
        <span className="first-number" aria-hidden>{(i + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")}</span>{t(s.title)}
      </Link></li>)}
    </ol></nav>
    <Stage key={stage.id} stage={stage} Icon={ICONS[at]} />
  </div>;
}

function Stage({ stage, Icon }: { stage: PracticeStage; Icon: typeof Heart }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const activity = stage.activities[selected];
  return <section className="first-stage" aria-labelledby="first-stage-title">
    <header className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
      <div><h2 id="first-stage-title" className="font-serif text-2xl text-ink sm:text-3xl">{t(stage.title)}</h2><p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(stage.intro)}</p></div>
      <div className="first-ask"><p>{t(F.askHelp)}</p><Link href="/ask/?track=first-steps"><span className="first-ai-badge" aria-hidden>AI</span>{t(F.askKhaled)}</Link></div>
    </header>
    <div className="first-workspace">
      <div><h3 className="eyebrow mb-3">{t(F.activities)}</h3><div className="first-activity-list">
        {stage.activities.map((a, i) => <button type="button" key={a.id} aria-pressed={i === selected} aria-controls="first-practice-detail" onClick={() => setSelected(i)} className="first-activity">
          <span className="min-w-0 flex-1"><span className="block font-medium">{t(a.title)}</span><span className="mt-1 block text-xs text-muted">{t(a.kind === "guide" || a.kind === "community" || a.kind === "shahada" ? F.quick : F.practice)}</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
        </button>)}
      </div></div>
      <article id="first-practice-detail" className="first-practice" aria-labelledby="first-activity-title">
        <p className="first-kind"><Icon className="h-4 w-4" aria-hidden />{t(activity.kind === "guide" || activity.kind === "community" || activity.kind === "shahada" ? F.quick : F.practice)}</p>
        <h3 id="first-activity-title" className="mt-3 font-serif text-2xl text-ink">{t(activity.title)}</h3>
        <div className="mt-5"><Practice key={activity.id} activity={activity} /></div>
      </article>
    </div>
  </section>;
}

function Practice({ activity }: { activity: Activity }) {
  const { t, lang } = useI18n();
  const [at, setAt] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const num = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en");
  if (activity.kind === "recitation") return <Recitation />;
  if (activity.kind === "daily-prayers") return <DailyPrayers body={activity.body} />;
  if (activity.kind === "guide") return <p className="text-sm leading-relaxed text-ink-soft">{t(activity.body)}</p>;
  if (activity.kind === "shahada") return <>
    <div className="space-y-3">{activity.cards.map((card) => <div key={card.title.en} className="first-meaning">
      <h4 className="text-base font-medium text-ink">{t(card.title)}</h4>
      <p className="quran mt-4 text-2xl leading-loose text-ink" lang="ar" dir="rtl">{card.words}</p>
      <dl className="mt-4 space-y-4 text-sm text-ink-soft"><div><dt className="text-xs font-medium text-brand-700">{t(F.pronunciation)}</dt><dd className="mt-1 leading-relaxed" lang="en" dir="ltr">{card.pronunciation}</dd></div><div><dt className="text-xs font-medium text-brand-700">{t(F.meaning)}</dt><dd className="mt-1 leading-relaxed">{t(card.meaning)}</dd></div></dl>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t(card.body)}</p>
    </div>)}</div>
  </>;
  if (activity.kind === "walkthrough") {
    const step = activity.steps[at];
    return <>
      <p className="text-xs text-brand-700">{num(at + 1)} {t(F.of)} {num(activity.steps.length)}</p>
      <nav aria-label={t(activity.title)} className="first-walkthrough mt-3">{activity.steps.map((s, i) => <button type="button" key={s.title.en} aria-label={`${num(i + 1)} · ${t(s.title)}`} aria-current={i === at ? "step" : undefined} onClick={() => setAt(i)}>{num(i + 1)}</button>)}</nav>
      <div className="first-instruction mt-5" aria-live="polite" aria-atomic="true"><h4 className="font-serif text-2xl text-ink">{t(step.title)}</h4><p className="mt-3 text-sm leading-relaxed text-ink-soft">{t(step.body)}</p></div>
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn btn-ghost" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(F.back)}</button>{at < activity.steps.length - 1 && <button type="button" className="btn btn-primary" onClick={() => setAt(at + 1)}>{t(F.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>}</div>
    </>;
  }
  if (activity.kind === "scenario") return <>
    <h4 className="font-serif text-2xl leading-snug text-ink">{t(activity.question)}</h4>
    <p className="mt-3 text-sm text-ink-soft">{t({ en: "What could your next step look like?", ar: "كيف يمكن أن تكون خطوتك التالية؟" })}</p>
    <div className="mt-4 space-y-2">{activity.options.map((option, i) => <button type="button" key={option.title.en} className="first-choice" aria-pressed={choice === i} onClick={() => setChoice(i)}>{t(option.title)}</button>)}</div>
    {choice !== null && <div className="first-instruction mt-4" role="status"><p className="text-sm leading-relaxed text-ink-soft">{t(activity.options[choice].feedback)}</p></div>}
  </>;
  return <>
    <p className="text-sm leading-relaxed text-ink-soft">{t(activity.body)}</p>
    <ul className="mt-4 space-y-3">{activity.items.map((item) => <li key={item.en} className="first-meaning text-sm text-ink-soft">{t(item)}</li>)}</ul>
    <a href={`https://dawa.center/islamic_centers?lang=${lang}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5">{t({ en: "Find a center near me", ar: "ابحث عن مركز قريب مني" })}<ExternalLink className="h-4 w-4" aria-hidden /></a>
  </>;
}

function DailyPrayers({ body }: { body: Bi }) {
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState(0);
  const prayer = DAILY_PRAYERS[selected];
  return <>
    <p className="text-sm leading-relaxed text-ink-soft">{t(body)}</p>
    <div aria-label={t({ en: "Choose a prayer", ar: "اختر صلاة" })} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {DAILY_PRAYERS.map((p, i) => <button type="button" className="first-choice" key={p.id} aria-pressed={selected === i} aria-controls="daily-prayer-walkthrough" onClick={() => setSelected(i)}><span className="block font-medium">{t(p.title)}</span><span className="mt-1 block text-xs">{p.rakahs.toLocaleString(lang === "ar" ? "ar-EG" : "en")} {t({ en: "obligatory rak’ahs", ar: "ركعات فرض" })}</span></button>)}
    </div>
    <PrayerWalkthrough key={prayer.id} prayer={prayer} />
  </>;
}

function PrayerWalkthrough({ prayer }: { prayer: DailyPrayer }) {
  const { t, lang } = useI18n();
  const [at, setAt] = useState(0);
  const steps = dailyPrayerSteps(prayer);
  const current = steps[at];
  const num = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en");
  const phases = steps.map((s, i) => ({ phase: s.phase, start: i })).filter((s, i) => i === 0 || s.phase.en !== steps[i - 1].phase.en);
  return <div id="daily-prayer-walkthrough" className="mt-5">
    <div className="space-y-2 text-sm text-ink-soft"><h4 className="font-serif text-2xl text-ink">{t(prayer.title)}</h4><p>{t(prayer.time)}</p><p className="text-xs text-muted">{t(prayer.recitation)}</p></div>
    <nav aria-label={t({ en: "Prayer sequence", ar: "تسلسل الصلاة" })} className="first-prayer-phases mt-4">{phases.map(({ phase, start }) => <button type="button" key={phase.en} onClick={() => setAt(start)} aria-current={phase.en === current.phase.en ? "step" : undefined}>{t(phase)}</button>)}</nav>
    <p className="mt-4 text-xs text-brand-700">{num(at + 1)} {t(F.of)} {num(steps.length)}</p>
    <div className="first-instruction mt-3" aria-live="polite" aria-atomic="true"><p className="text-xs font-medium text-brand-700">{t(current.phase)}</p><h5 className="mt-2 font-serif text-2xl text-ink">{t(current.title)}</h5><p className="mt-3 text-sm leading-relaxed text-ink-soft">{t(current.body)}</p></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-ghost" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(F.back)}</button><button type="button" className="btn btn-primary" disabled={at === steps.length - 1} onClick={() => setAt(at + 1)}>{t(F.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button></div>
  </div>;
}

function Recitation() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ index: QuranIndex; ar: Verse[]; en: Verse[] } | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([loadIndex(), loadSurah(ARABIC, 1), loadSurah(EDITIONS[0].key, 1)]).then(([index, ar, en]) => {
      if (!index.editions[ARABIC] || ![ar, en].every((rows) => Array.isArray(rows) && rows.length === 7 && rows.every((v, i) => v.surah_number === 1 && v.ayah_number === i + 1 && typeof v.text === "string" && v.text.trim()))) throw new Error("Invalid Al-Fatihah data");
      if (active) setData({ index, ar, en });
    }).catch(() => { if (active) setData("error"); });
    return () => { active = false; };
  }, [attempt]);
  const credit = data && data !== "error" ? data.index.recitations?.[RECITATION] : null;
  const { audio: audioRef, ...recitation } = useRecitation(1, !!credit?.surahs.includes(1), 7);
  const change = (next: number) => { recitation.stop(); setAt(next); };
  if (data === "error") return <div role="status"><p className="text-sm text-ink-soft">{t({ en: "Al-Fatihah could not be loaded. Please try again.", ar: "تعذّر تحميل الفاتحة. حاول مجددًا." })}</p><button type="button" className="btn btn-ghost mt-3" onClick={() => { setData(null); setAttempt(attempt + 1); }}>{t(F.retry)}</button></div>;
  if (!data) return <p role="status" className="text-sm text-muted">{t({ en: "Loading Al-Fatihah…", ar: "جارٍ تحميل الفاتحة…" })}</p>;
  return <>
    <p className="text-xs text-brand-700">{t({ en: "Verse", ar: "الآية" })} {(at + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")} {t(F.of)} {(7).toLocaleString(lang === "ar" ? "ar-EG" : "en")}</p>
    <div className="first-verse mt-4" aria-live="polite"><p className="quran text-center text-3xl leading-loose text-ink sm:text-4xl" lang="ar" dir="rtl">{data.ar[at].text}</p>
      <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft" lang="en" dir="ltr">{data.en[at].text}</p>
    </div>
    <audio ref={audioRef} src={audioUrl(1)} preload="none" {...recitation.events} />
    <div className="mt-4 flex flex-wrap gap-2">
      {credit?.surahs.includes(1) && <button type="button" className="btn btn-primary" disabled={recitation.buffering} onClick={() => void recitation.start(at + 1, at + 1)}>{recitation.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{t(recitation.buffering ? { en: "Loading audio…", ar: "جارٍ تحميل الصوت…" } : recitation.playing ? { en: "Pause", ar: "إيقاف مؤقت" } : { en: "Listen to this verse", ar: "استمع إلى الآية" })}</button>}
      <Link href={`/quran/?s=1&v=${at + 1}`} className="btn btn-ghost"><BookOpen className="h-4 w-4" aria-hidden />{t({ en: "Go to Quran & practise", ar: "انتقل إلى القرآن وتدرّب" })}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
    </div>
    {recitation.error && <div role="alert" className="mt-3 text-sm text-ink-soft"><p>{t({ en: "Audio could not be played. Please try again.", ar: "تعذّر تشغيل الصوت. حاول مجددًا." })}</p><button type="button" className="btn btn-ghost mt-2" onClick={() => recitation.retry(at + 1)}><RotateCcw className="h-4 w-4" aria-hidden />{t(F.retry)}</button></div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-ghost" disabled={at === 0} onClick={() => change(at - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t({ en: "Previous verse", ar: "الآية السابقة" })}</button><button type="button" className="btn btn-ghost" disabled={at === 6} onClick={() => change(at + 1)}>{t({ en: "Next verse", ar: "الآية التالية" })}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button></div>
    <div className="mt-4 space-y-1 text-xs text-muted"><p>{data.index.editions[EDITIONS[0].key]?.title ?? EDITIONS[0].label}</p>{credit && <p>{lang === "ar" ? credit.reciter_ar : credit.reciter} · {credit.provider}</p>}</div>
  </>;
}
