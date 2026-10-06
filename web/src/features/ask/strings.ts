export const ASK_STRINGS = {
ask: {
    title: { en: "Journey Guide", ar: "مرشد الرحلة" },
    sub: { en: "Explore your questions with clear explanations and approved sources.", ar: "اكتشف أجوبة أسئلتك بشرح واضح ومصادر معتمدة." },
    placeholder: { en: "Ask a question…", ar: "اكتب سؤالك…" },
    send: { en: "Send", ar: "أرسل" },
    voice: { en: "Voice input", ar: "إدخال صوتي" },
    newChat: { en: "New chat", ar: "محادثة جديدة" },
    trusted: { en: "Approved sources", ar: "المصادر المعتمدة" },
    related: { en: "Sources in this answer", ar: "مصادر هذه الإجابة" },
    sourcesLabel: { en: "Sources", ar: "المصادر" },
    closeSources: { en: "Close sources", ar: "إغلاق المصادر" },
    shortDisclaimer: { en: "AI can make mistakes · Check important information", ar: "قد يخطئ الذكاء الاصطناعي · تحقّق من المعلومات المهمة" },
    sourcesEmpty: { en: "Sources used in each answer will show here.", ar: "ستظهر هنا المصادر المستخدمة في كل إجابة." },
    thinking: { en: "Let me think and check my sources…", ar: "دعني أفكّر وأراجع مصادري…" },
    verifying: { en: "Writing…", ar: "أكتب…" },
    unavailable: { en: "Tutor temporarily unavailable", ar: "المعلّم غير متاح مؤقتًا" },
    safetyBlocked: { en: "Unable to answer this request", ar: "تعذّر الإجابة عن هذا الطلب" },
    disclaimer: {
      en: "AI-generated. It draws on approved sources and general knowledge and can make mistakes — for personal rulings, ask a qualified scholar.",
      ar: "إجابة مولَّدة بالذكاء الاصطناعي. تستند إلى مصادر معتمدة ومعرفة عامة وقد تخطئ — وللأحكام الشخصية اسأل عالمًا مؤهّلًا.",
    },
    error: {
      en: "The tutor is unavailable right now. Please try again in a moment.",
      ar: "المعلّم غير متاح الآن. حاول مجددًا بعد قليل.",
    },
    tier: {
      A: { en: "Settled, cited", ar: "ثابت وموثّق" },
      B: { en: "Explained from sources", ar: "شرح من المصادر" },
      C: { en: "Scholars differ", ar: "مسألة خلافية" },
      D: { en: "Personal case — referred", ar: "حالة شخصية — إحالة" },
      OUT: { en: "Outside scope", ar: "خارج النطاق" },
      NONE: { en: "No approved source found", ar: "لا يوجد مصدر معتمد" },
    },
    // Shown instead of a tier's usual label when that specific answer cited no source.
    uncited: { en: "AI explanation, no source cited", ar: "شرح بالذكاء الاصطناعي، دون مصدر مُستشهَد به" },
    retry: { en: "Try again", ar: "حاول مجددًا" },
    referralTitle: { en: "Speak to a qualified scholar", ar: "استشر عالمًا مؤهّلًا" },
    followUps: { en: "You could also ask", ar: "يمكنك أن تسأل أيضًا" },
  }
} as const;
