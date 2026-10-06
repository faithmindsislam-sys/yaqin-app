"use client";

import { SitePage } from "@/components/SiteChrome";
import { useI18n } from "@/lib/i18n";

const POINTS = [
  {
    en: "We store your account email and learning progress (which courses you read, quiz results, notes).",
    ar: "نحفظ بريد حسابك وتقدّمك التعليمي (الدورات المقروءة، نتائج الاختبارات، الملاحظات).",
  },
  {
    en: "We never infer, label or store your religious beliefs or practice. Your chosen journey only decides which courses you see.",
    ar: "لا نستنتج قناعاتك أو ممارستك الدينية ولا نصنّفها ولا نخزّنها. المسار الذي تختاره يحدّد الدورات فقط.",
  },
  {
    en: "Questions to the tutor are processed to answer you. We log only the answer level, cited sources and response time — not your question text.",
    ar: "تُعالَج أسئلتك للمعلّم لإجابتك فقط. نسجّل مستوى الإجابة والمصادر المذكورة وزمن الاستجابة — لا نص سؤالك.",
  },
  {
    en: "Voice input is transcribed by your browser and sent only when you submit it.",
    ar: "يُحوَّل صوتك إلى نص في متصفحك، ولا يُرسل إلا عند إرسالك له.",
  },
  {
    en: "Yaqeen is an AI-assisted tool, not a scholar. It does not issue personal fatwas.",
    ar: "«يقين» أداة مدعومة بالذكاء الاصطناعي وليست عالمًا، ولا تصدر فتاوى شخصية.",
  },
];

export default function Privacy() {
  const { t } = useI18n();
  return (
    <SitePage>
      <section className="site-container site-page-intro">
        <p className="site-kicker">{t({ en: "Your learning. Your privacy.", ar: "تعلّمك. وخصوصيتك." })}</p>
        <h1>{t({ en: "Privacy, in plain language.", ar: "الخصوصية بلغة واضحة." })}</h1>
      </section>
      <section className="site-article-body">
        <ul className="space-y-6">
          {POINTS.map((p) => (
            <li key={p.en} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {t(p)}
            </li>
          ))}
        </ul>
      </section>
    </SitePage>
  );
}
