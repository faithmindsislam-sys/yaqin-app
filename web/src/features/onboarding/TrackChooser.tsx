"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/navigation";
import { currentSignInPath } from "@/lib/routes";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { TRACK_META } from "@/features/courses/track-meta";
import { LangToggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import { FIRST_STEPS_TITLE } from "@/features/courses/catalog";
import { useExploreIntroSeen } from "@/features/onboarding/explore-intro";
import type { Bi, TrackId } from "@/lib/types";

const TRACKS: { id: TrackId; title: Bi; audience: Bi; description: Bi; topics: Bi[] }[] = [
  {
    id: "explore",
    title: { en: "Explore Islam", ar: "اكتشف الإسلام" },
    audience: { en: "For non-Muslims and curious minds", ar: "لغير المسلمين وكل من يريد التعرّف على الإسلام" },
    description: { en: "Get to know Islam, explore its beliefs, and find thoughtful answers to your questions. Learn through respectful dialogue, religious comparisons, and discussions of common objections.", ar: "تعرّف على الإسلام وعقيدته، واعثر على أجوبة موثّقة لأسئلتك من خلال الحوار باحترام، ومقارنة الأديان ومناقشة الشبهات." },
    topics: [
      { en: "Qur’an: 7 translations", ar: "القرآن: ٧ ترجمات" },
      { en: "Islam courses", ar: "دورات عن الإسلام" },
      { en: "Religions & monotheism", ar: "الأديان والتوحيد" },
      { en: "Faith & evidence", ar: "الإيمان والدليل" },
      { en: "AI Islam guide", ar: "مرشد إسلامي ذكي" },
      { en: "Tafsir & recitation", ar: "التفسير والتلاوة" },
    ],
  },
  {
    id: "first-steps",
    title: FIRST_STEPS_TITLE,
    audience: { en: "For those beginning their life in Islam", ar: "لمن بدأ رحلته في الإسلام حديثًا" },
    description: { en: "Take your first steps with a gentle, practical guide. Build a foundation in faith, learn purification and prayer, and bring Islam into your daily life, one step at a time.", ar: "ابدأ خطواتك الأولى بدليل عملي وميسّر. ابنِ أساسك في الإيمان، وتعلّم الطهارة والصلاة، وعِش الإسلام في حياتك اليومية خطوةً خطوة." },
    topics: [{ en: "Foundations of faith", ar: "أسس الإيمان" }, { en: "Purification & prayer", ar: "الطهارة والصلاة" }, { en: "Daily Muslim life", ar: "حياة المسلم اليومية" }, { en: "Qur’an & recitation", ar: "القرآن والتلاوة" }, { en: "First Steps guide", ar: "دليل خطواتي الأولى" }, { en: "AI Islam guide", ar: "مرشد إسلامي ذكي" }],
  },
  {
    id: "deepen",
    title: { en: "Deepen My Knowledge", ar: "أعمّق معرفتي" },
    audience: { en: "For Muslims pursuing deeper understanding", ar: "للمسلمين الراغبين في التعمّق وطلب العلم الشرعي" },
    description: { en: "Strengthen your grasp of fiqh and seek Islamic knowledge. Follow a structured path through Qur’an, hadith, and the Islamic sciences, and ground your understanding in trusted sources.", ar: "عزّز معرفتك بالفقه وانطلق في طلب العلم الشرعي. اتبع مسارًا منظّمًا في القرآن والحديث والعلوم الشرعية، وابنِ فهمك على مصادر موثوقة." },
    topics: [{ en: "Aqidah", ar: "العقيدة" }, { en: "Fiqh", ar: "الفقه" }, { en: "Qur’an & hadith", ar: "القرآن والحديث" }, { en: "Seerah", ar: "السيرة" }, { en: "Tafsir", ar: "التفسير" }, { en: "Tajwid", ar: "التجويد" }, { en: "Daily worship routine", ar: "برنامج العبادة اليومي" }, { en: "AI Islam guide", ar: "مرشد إسلامي ذكي" }],
  },
];

/** `firstVisit` is the landing page's entry: learners who already have a track go to their dashboard. */
export function TrackChooser({ firstVisit = false }: { firstVisit?: boolean }) {
  const { t } = useI18n();
  const { ready, user, prefs, setPrefs } = useSession();
  const router = useRouter();
  const introSeen = useExploreIntroSeen();
  const skip = firstVisit && prefs.onboarded;

  useEffect(() => {
    if (ready && !user) router.replace(currentSignInPath());
    else if (ready && skip) router.replace("/learn/");
  }, [ready, user, skip, router]);

  function choose(track: TrackId) {
    if (track === "explore" && !introSeen) {
      router.push("/start/explore/");
      return;
    }
    setPrefs({ track, onboarded: true });
    router.push("/learn/");
  }

  return (
    <div className="min-h-dvh bg-sky-50 bg-[radial-gradient(ellipse_80%_34rem_at_50%_0,var(--color-brand-100),transparent)] bg-no-repeat">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-7xl px-5 pt-4 pb-12 sm:px-8 sm:pt-2 sm:pb-16">
        {!ready || !user || skip ? (
          <p role="status">{t({ en: "Loading your account…", ar: "جارٍ تحميل حسابك…" })}</p>
        ) : (
          <>
            <div className="rise mx-auto mb-8 max-w-2xl text-center">
              <h1 className="font-serif text-4xl text-balance text-ink ltr:tracking-tight sm:text-5xl">{t({ en: "Choose your journey", ar: "اختر مسارك" })}</h1>
              <p className="mx-auto mt-4 max-w-xl leading-relaxed text-pretty text-ink-soft sm:text-lg">{t({ en: "Start where you are. Choose the learning journey that fits your goals, and move at your own pace.", ar: "ابدأ من حيث أنت. اختر رحلة التعلّم التي تناسب أهدافك، وتقدّم بالوتيرة التي تلائمك." })}</p>
            </div>
            {/* The entrance animation sits on the grid, not the cards: its end state would cancel the cards' hover lift. */}
            <div className="rise grid gap-5 lg:grid-cols-3" style={{ animationDelay: "90ms" }}>
              {TRACKS.map((track) => {
                const meta = TRACK_META[track.id];
                const Icon = meta.icon;
                return (
                  <button key={track.id} onClick={() => choose(track.id)} className={`group flex flex-col rounded-[2rem] bg-gradient-to-b ${meta.tint} p-6 text-start shadow-[var(--shadow-card)] ring-1 ring-line transition duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)] hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 sm:p-7`}>
                    <span className="flex items-center gap-4 lg:min-h-[3.75rem]">
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition duration-300 group-hover:scale-110 ${meta.ring}`}><Icon className="h-6 w-6" aria-hidden /></span>
                      <span className="font-serif text-2xl leading-tight text-ink">{t(track.title)}</span>
                    </span>
                    <span className="mt-4 block text-sm font-medium text-brand-700">{t(track.audience)}</span>
                    <span className="mt-2 block text-[0.95rem] leading-relaxed text-ink-soft">{t(track.description)}</span>
                    <span className="mt-4 mb-5 flex flex-wrap gap-2">{track.topics.map((topic) => <span key={topic.en} className="chip !text-xs">{t(topic)}</span>)}</span>
                    <span className="mt-auto flex w-full items-center justify-between rounded-full bg-white py-2 ps-5 pe-2 font-medium text-brand-700 ring-1 ring-line transition duration-300 group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600">
                      {t({ en: "Choose this journey", ar: "اختر هذا المسار" })}
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white transition duration-300 group-hover:bg-white group-hover:text-brand-700"><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-8 text-center text-sm text-muted">{t({ en: "You can change your journey at any time.", ar: "يمكنك تغيير مسارك في أي وقت." })}</p>
          </>
        )}
      </main>
    </div>
  );
}
