"use client";

import { useRouter } from "@/lib/navigation";
import { currentSignInPath } from "@/lib/routes";
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, HeartHandshake, Landmark, Sparkle, Sprout, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { ESSENTIALS, INTRODUCTION } from "@/features/onboarding/content";
import { useSession } from "@/features/auth/SessionProvider";
import { useContent } from "@/features/courses/ContentProvider";
import { useExploreIntroSeen } from "@/features/onboarding/explore-intro";

// Accent colors and icons for the four intro explainers; the wording lives in ESSENTIALS.
const ESSENTIAL_STYLE = {
  tawhid: { icon: Sparkle, bg: "bg-[var(--n-accent-soft)]", ink: "text-[var(--n-accent)]" },
  islam: { icon: Landmark, bg: "bg-salmon-50", ink: "text-salmon-600" },
  iman: { icon: Sprout, bg: "bg-[#fdf6e3]", ink: "text-[#8a6410]" },
  akhlaq: { icon: HeartHandshake, bg: "bg-[#e8f4ee]", ink: "text-[#1f6b55]" },
};

// Keep the original declaration intact, including punctuation and Arabic spelling.
const declaration = INTRODUCTION.shahada.declaration;
const arabicBreak = declaration.ar.indexOf(" وأشهد");
const englishBreak = declaration.en.indexOf(" and I bear witness");
const testimonies = [
  { ar: declaration.ar.slice(0, arabicBreak), en: declaration.en.slice(0, englishBreak) },
  { ar: declaration.ar.slice(arabicBreak), en: declaration.en.slice(englishBreak) },
];
export default function ExploreOnboarding() {
  const { t, lang } = useI18n();
  const { ready, user, setPrefs: setSessionPrefs } = useSession();
  const router = useRouter();
  const { trackLessons } = useContent();
  const lesson = trackLessons("explore")[0];
  const seen = useExploreIntroSeen();
  const starting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace(currentSignInPath());
    // Shown once: learners who already started Explore go straight to their dashboard.
    else if (ready && seen && !starting.current) router.replace("/learn/");
  }, [ready, user, seen, router]);

  function exploreBasics() {
    starting.current = true;
    setSessionPrefs({ track: "explore", onboarded: true });
    router.push(lesson ? "/learn/" : "/library/?track=explore");
  }

  if (!ready || !user || seen) return <p role="status" className="p-8">{t({ en: "Loading your account…", ar: "جارٍ تحميل حسابك…" })}</p>;

  return (
    <div className="onboarding onboarding-intro min-h-dvh bg-sky-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-1 sm:gap-3">
          <button type="button" className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-white text-sm font-medium text-ink-soft transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 sm:px-4" onClick={() => router.push("/journey/")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t({ en: "Back", ar: "رجوع" })}</span></button>
          <Logo />
        </div>
        <LangToggle />
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <section className="nutshell">
            <div className="nutshell-heading text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-medium text-[var(--n-accent)]"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{t({ en: "Islam 101", ar: "أساسيات الإسلام" })}</span>
              <h1 ref={heading} tabIndex={-1} className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">{t({ en: "Islam, in a nutshell", ar: "الإسلام باختصار" })}</h1>
              <p className="nutshell-summary">{t({ en: "Discover what Muslims believe, how they practise, and how faith shapes everyday life. Everyone is welcome to explore.", ar: "تعرّف على ما يؤمن به المسلمون، وكيف يمارسون شعائرهم، وأثر الإيمان في حياتهم اليومية. الاستكشاف متاح للجميع." })}</p>
            </div>

            <section aria-labelledby="essentials-title">
              <div className="mb-4 text-center">
                <h2 id="essentials-title" className="font-serif text-xl sm:text-2xl">{t({ en: "Explore the essentials", ar: "استكشف الأساسيات" })}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{t({ en: "Browse a topic for a quick preview, or start learning below.", ar: "تصفّح موضوعًا لإلقاء نظرة سريعة، أو ابدأ التعلّم من الأسفل." })}</p>
              </div>
              <nav aria-labelledby="essentials-title" className="nutshell-topics mx-auto grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
                {ESSENTIALS.map(({ id, title, label }) => {
                  const { icon: Icon, bg, ink } = ESSENTIAL_STYLE[id];
                  return <button key={id} type="button" aria-haspopup="dialog" aria-controls={`essential-${id}`} onClick={() => (document.getElementById(`essential-${id}`) as HTMLDialogElement).showModal()} className="group relative cursor-pointer rounded-[20px] border border-line bg-white p-3 text-start shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[var(--shadow-lift)] sm:p-5">
                    <span className={`grid h-9 w-9 place-items-center rounded-xl ${bg} ${ink}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" /></span>
                    <ChevronRight className="absolute end-3 top-3 h-4 w-4 text-muted transition group-hover:text-brand-700 rtl:rotate-180 sm:end-4 sm:top-4" aria-hidden="true" />
                    <span className="mt-3 block text-sm font-medium text-[var(--n-navy)] sm:text-base">{t(title)}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{t(label)}</span>
                  </button>;
                })}
              </nav>
            </section>

            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-[24px] border border-brand-200 bg-white p-5 text-start shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-7 sm:py-6">
              <div className="min-w-0">
                <h2 id="basics-title" className="font-serif text-xl leading-snug sm:text-2xl">{t({ en: "Start learning and discovering Islam", ar: "ابدأ التعلّم واكتشاف الإسلام" })}</h2>
                <p id="basics-description" className="mt-1.5 text-sm leading-6 text-ink-soft">{t({ en: "Follow short courses, step by step, at your own pace.", ar: "تعلّم من خلال دورات قصيرة، خطوة بخطوة، بالوتيرة التي تناسبك." })}</p>
              </div>
              <button type="button" className="btn btn-primary w-full shrink-0 rounded-full text-sm sm:w-auto" aria-describedby="basics-title basics-description" onClick={exploreBasics}>
                {t({ en: "Start with the basics", ar: "ابدأ بالأساسيات" })}
                <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
              </button>
            </div>

            {ESSENTIALS.map(({ id, title, label, intro, items }) => {
              const { icon: Icon, bg, ink } = ESSENTIAL_STYLE[id];
              return <dialog key={id} id={`essential-${id}`} aria-labelledby={`essential-${id}-title`} aria-describedby={`essential-${id}-intro`} className="nutshell-dialog" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
                <div className={`nutshell-dialog-header flex items-start gap-4 px-6 pb-5 pt-6 sm:px-8 ${bg}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 ${ink}`}><Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium ${ink}`}>{t(label)}</p>
                    <h2 id={`essential-${id}-title`} className="mt-0.5 font-serif text-2xl">{t(title)}</h2>
                  </div>
                  <form method="dialog"><button autoFocus aria-label={t({ en: "Close preview", ar: "إغلاق المعاينة" })} className="-me-2 -mt-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-ink-soft hover:bg-white/70"><X className="h-5 w-5" aria-hidden="true" /></button></form>
                </div>
                <div className="px-6 py-6 sm:px-8">
                  <p id={`essential-${id}-intro`} className="text-sm leading-7 text-ink-soft">{t(intro)}</p>
                  <ol className="mt-5 space-y-4">{items.map((item, index) => <li key={item.title.en} className="flex gap-3">
                    <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${bg} ${ink}`}>{index + 1}</span>
                    <div><p className="text-sm font-medium">{t(item.title)}</p><p className="mt-0.5 text-sm leading-6 text-ink-soft">{t(item.body)}</p></div>
                  </li>)}</ol>
                  {id === "tawhid" && <section aria-labelledby="shahada-title" className="shahada-card">
                    <h3 id="shahada-title" className="shahada-title">{t(INTRODUCTION.shahada.title)}</h3>
                    <p className="shahada-intro">{t(INTRODUCTION.shahada.meaning)}</p>
                    <div className="shahada-testimonies">
                      {testimonies.map((part, index) => (
                        <div className="shahada-testimony" key={index}>
                          <div className="shahada-ornament" aria-hidden="true"><span>✦</span></div>
                          <p className="shahada-label">{t(index === 0 ? { en: "First", ar: "الأولى" } : { en: "Second", ar: "الثانية" })}</p>
                          <p lang="ar" dir="rtl" className="shahada-arabic">{part.ar}</p>
                          {lang !== "ar" && <p lang="en" dir="ltr" className="shahada-translation">{part.en}</p>}
                        </div>
                      ))}
                    </div>
                  </section>}
                </div>
              </dialog>;
            })}

          </section>
      </main>
    </div>
  );
}
