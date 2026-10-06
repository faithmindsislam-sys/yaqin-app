import { AUTH_STRINGS } from "@/features/auth/strings";
import { COURSES_STRINGS } from "@/features/courses/strings";
import { LEARNING_STRINGS } from "@/features/learning/strings";
import { STUDIO_STRINGS } from "@/features/studio/strings";
import { QURAN_STRINGS } from "@/features/quran/strings";
import { ASK_STRINGS } from "@/features/ask/strings";
import { COMPARE_STRINGS } from "@/features/compare/strings";
import { ONBOARDING_STRINGS } from "@/features/onboarding/strings";

export const S = {
  ...AUTH_STRINGS,
  ...COURSES_STRINGS,
  ...LEARNING_STRINGS,
  ...STUDIO_STRINGS,
  ...QURAN_STRINGS,
  ...ASK_STRINGS,
  ...COMPARE_STRINGS,
  ...ONBOARDING_STRINGS,
brandTagline: { en: "Knowledge that brings you closer", ar: "علمٌ يقرّبك" },
motto: { en: "Learn · Reflect · Live it", ar: "علمٌ أعمق .. حياةٌ أقرب" },
nav: {
    home: { en: "Home", ar: "الرئيسية" },
    learn: { en: "Learn", ar: "تعلّم" },
    library: { en: "Courses", ar: "الدورات" },
    quran: { en: "Quran & Translations", ar: "القرآن والترجمات" },
    quranShort: { en: "Quran", ar: "القرآن" },
    ask: { en: "Ask Yaqeen", ar: "اسأل يقين" },
    shahada: { en: "Become a Muslim", ar: "الدخول في الإسلام" },
    shahadaShort: { en: "Shahada", ar: "الشهادة" },
    compare: { en: "Faith & Evidence", ar: "الإيمان والدليل" },
    compareShort: { en: "Faith", ar: "الإيمان" },
    firstSteps: { en: "First Steps", ar: "خطواتي الأولى" },
    worship: { en: "Plan Your Worship", ar: "خطّط لعبادتك" },
    worshipShort: { en: "Worship", ar: "عبادتي" },
    sources: { en: "Our sources", ar: "مصادرنا" },
    educators: { en: "For educators", ar: "للمعلّمين" },
    signIn: { en: "Sign in", ar: "تسجيل الدخول" },
    getStarted: { en: "Get started", ar: "ابدأ الآن" },
    dashboard: { en: "Dashboard", ar: "لوحتي" },
    dashboardShort: { en: "Home", ar: "لوحتي" },
    myLearning: { en: "My learning", ar: "تعلّمي" },
    instructor: { en: "Studio", ar: "الاستوديو" },
    signOut: { en: "Sign out", ar: "تسجيل الخروج" },
  },
hero: {
    eyebrow: { en: "Knowledge that brings you closer", ar: "علمٌ يقرّبك" },
    title1: { en: "Understand Islam,", ar: "افهم الإسلام" },
    title2: { en: "one clear step at a time", ar: "خطوةً واضحةً بعد خطوة" },
    sub: {
      en: "Short visual courses you can listen to and talk to, in Arabic and English, with every claim traceable to an approved source.",
      ar: "دورات بصرية قصيرة تستمع إليها وتحاورها، بالعربية والإنجليزية، وكل معلومة فيها مرتبطة بمصدرها المعتمد.",
    },
    cta: { en: "Start learning free", ar: "ابدأ التعلّم مجانًا" },
    cta2: { en: "Try the tutor", ar: "جرّب المعلّم" },
  },
pillars: {
    sources: { en: "Approved sources", ar: "مصادر معتمدة" },
    sourcesSub: { en: "Quran · Hadith · Scholarship", ar: "القرآن · الحديث · أهل العلم" },
    ai: { en: "Grounded AI", ar: "ذكاء اصطناعي منضبط" },
    aiSub: { en: "Answers only from sources", ar: "يجيب من المصادر فقط" },
    everyone: { en: "For every learner", ar: "لكل متعلّم" },
    everyoneSub: { en: "Curious · New · Deepening", ar: "باحث · مسلم جديد · متعمّق" },
    langs: { en: "Bilingual", ar: "ثنائي اللغة" },
    langsSub: { en: "العربية · English", ar: "العربية · English" },
  },
journey: {
    title: { en: "Begin your journey", ar: "ابدأ رحلتك" },
    sub: {
      en: "Three journeys, one scholarly reference. Pick the one that fits you today — you can switch any time.",
      ar: "ثلاثة مسارات ومرجعية علمية واحدة. اختر ما يناسبك اليوم، ويمكنك التبديل متى شئت.",
    },
    open: { en: "Open journey", ar: "افتح المسار" },
  },
trust: {
    title: { en: "Built on approved, traceable sources", ar: "مبنيّ على مصادر معتمدة يمكن تتبّعها" },
    sub: {
      en: "We follow the challenge's scholarly reference. Revealed text is shown verbatim — never generated.",
      ar: "نلتزم بالمرجعية العلمية للتحدي. يُعرض النص الشرعي بنصّه، ولا يُولَّد أبدًا.",
    },
    quran: { en: "Quran", ar: "القرآن الكريم" },
    quranSub: { en: "Verified Uthmani text", ar: "النص العثماني الموثّق" },
    hadith: { en: "Sahih hadith", ar: "الحديث الصحيح" },
    hadithSub: { en: "With collection and grading", ar: "مع المصدر والحكم" },
    tafsir: { en: "Tafsir", ar: "التفسير" },
    tafsirSub: { en: "Classical explanation", ar: "شروح أهل العلم" },
    review: { en: "Human review", ar: "مراجعة علمية" },
    reviewSub: { en: "Every course approved", ar: "كل دورة معتمدة" },
    levels: { en: "Four answer levels", ar: "أربعة مستويات للإجابة" },
    levelsSub: { en: "Cite · explain · note differences · refer", ar: "توثيق · شرح · بيان الخلاف · إحالة" },
  },
features: {
    title: { en: "A clearer way to learn", ar: "طريقة أوضح للتعلّم" },
    sub: { en: "Modern tools, faithful to the sources.", ar: "أدوات حديثة، أمينة على المصادر." },
    lessons: { en: "Visual courses", ar: "دورات بصرية قصيرة" },
    lessonsSub: {
      en: "One idea per card, an illustration, a takeaway — read or listen.",
      ar: "فكرة واحدة في كل بطاقة، مع صورة وخلاصة — اقرأ أو استمع.",
    },
    tutor: { en: "Ask Yaqeen, the AI tutor", ar: "«اسأل يقين»، المعلّم الذكي" },
    tutorSub: {
      en: "Ask by voice or text. It cites its sources, or says it can't.",
      ar: "اسأل بالصوت أو النص. يذكر مصادره، أو يخبرك أنه لا يملك مصدرًا.",
    },
    progress: { en: "Steady progress", ar: "تقدّم ثابت" },
    progressSub: {
      en: "Today's plan, reviews and streaks — tracking learning, never faith.",
      ar: "خطة اليوم والمراجعة والاستمرارية — نتابع التعلّم، لا الإيمان.",
    },
  },
promise: {
    title: { en: "Our promise to learners", ar: "عهدنا مع المتعلّمين" },
    p1: { en: "No answer without a source — or an honest “I don't know”.", ar: "لا إجابة بلا مصدر — أو «لا أعلم» بصدق." },
    p2: { en: "No personal fatwa. Personal cases go to a qualified scholar.", ar: "لا فتوى شخصية. تُحال الحالات الخاصة إلى عالم مؤهّل." },
    p3: { en: "We never infer or store your beliefs.", ar: "لا نستنتج قناعاتك ولا نخزّنها." },
    p4: { en: "Every course is reviewed by a person before it is published.", ar: "كل دورة يراجعها إنسان قبل نشرها." },
  },
footer: {
    line: { en: "One platform. A clearer path.", ar: "منصة واحدة. طريق أوضح." },
    about: { en: "About", ar: "عن يقين" },
    privacy: { en: "Privacy", ar: "الخصوصية" },
    method: { en: "Our method", ar: "منهجنا" },
    ai: {
      en: "Yaqeen uses AI. Explanations are AI-assisted and reviewed; revealed text is shown verbatim from approved sources.",
      ar: "يستخدم «يقين» الذكاء الاصطناعي. الشروح مدعومة به ومراجَعة، والنص الشرعي يُعرض بنصّه من المصادر المعتمدة.",
    },
  },
common: {
    loading: { en: "Loading…", ar: "جارٍ التحميل…" },
    aiLabel: { en: "AI", ar: "ذكاء اصطناعي" },
    close: { en: "Close", ar: "إغلاق" },
    lang: { en: "العربية", ar: "English" },
  }
} as const;
