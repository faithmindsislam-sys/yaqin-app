"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "@/components/RouteLink";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ListChecks, MessageCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PERSONAS } from "@/lib/personas";

export function ExperiencePreview() {
  const { t } = useI18n();
  const [mode, setMode] = useState("learn");
  const [answer, setAnswer] = useState<number | null>(null);
  const choices = [{ en: "The face", ar: "الوجه" }, { en: "The head", ar: "الرأس" }, { en: "The arms", ar: "اليدان" }];
  return <div className="site-preview-scene">
    <div className="site-preview-orbit" aria-hidden />
    <div className="site-preview-label"><span />{t({ en: "A glimpse of your learning space", ar: "لمحة عن مساحة تعلّمك" })}</div>
    <div className="site-preview-window">
      <div className="site-preview-toolbar"><span className="site-window-dots" aria-hidden><i /><i /><i /></span><span>yaqeenguide.com</span><span>{t({ en: "Product preview", ar: "معاينة المنتج" })}</span></div>
      <div className="site-preview-heading"><span className="site-preview-mark" aria-hidden>✦</span><span>{t({ en: "Your learning journey", ar: "رحلتك التعليمية" })}</span><span className="site-preview-language">EN / ع</span></div>
      <div className="site-preview-body">
        <p className="site-kicker">{t({ en: "First Steps as a Muslim", ar: "خطواتي الأولى كمسلم" })}</p>
        <h2>{t({ en: "A little progress, every day.", ar: "خطوة صغيرة، كل يوم." })}</h2>
        <div className="site-preview-modes" aria-label={t({ en: "Explore the product preview", ar: "استكشف معاينة المنتج" })}>
          {[{ id: "learn", label: { en: "Learn", ar: "تعلّم" }, icon: BookOpen }, { id: "ask", label: { en: "Ask", ar: "اسأل" }, icon: MessageCircle }, { id: "practice", label: { en: "Practise", ar: "تدرّب" }, icon: ListChecks }].map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setAnswer(null); }}><Icon aria-hidden />{t(label)}</button>)}
        </div>
        <div className="site-preview-content">
          {mode === "learn" && <>
            <div className="site-preview-course-art" aria-hidden><span className="site-arch arch-one" /><span className="site-arch arch-two" /><span className="site-arch arch-three" /><span className="site-arch-light" /><BookOpen /></div>
            <div className="site-preview-course-meta"><span>{t({ en: "Purification", ar: "الطهارة" })}</span><span>5 {t({ en: "min", ar: "دقائق" })}</span></div>
            <h3>{t({ en: "Understanding wudu", ar: "فهم الوضوء" })}</h3><p>{t({ en: "One idea at a time. Read, reflect, then check your understanding.", ar: "فكرة واحدة في كل مرة. اقرأ وتأمّل ثم اختبر فهمك." })}</p>
            <div className="site-preview-progress"><span /><span /><span /><span /><span /></div>
            <Link href="/start/?track=first-steps" className="site-preview-continue">{t({ en: "Begin your first step", ar: "ابدأ خطوتك الأولى" })}<ArrowRight aria-hidden /></Link>
          </>}
          {mode === "ask" && <div className="site-preview-chat">
            <div className="site-mini-persona"><Image src={PERSONAS.mariam.avatar} alt="" width={42} height={42} /><div><b>{t(PERSONAS.mariam.name)} <span>AI</span></b><p>{t(PERSONAS.mariam.role)}</p></div></div>
            <p className="site-chat-question">{t({ en: "Can you help me understand this course?", ar: "هل تساعدينني على فهم هذه الدورة؟" })}</p>
            <p className="site-chat-answer">{t({ en: "Let’s work through it together. We can explore a key idea, explain an unfamiliar word, or practise with a question.", ar: "لنفهمها معًا. يمكننا استكشاف فكرة رئيسية أو شرح كلمة جديدة أو التدرّب بسؤال." })}</p>
            <span className="site-preview-source"><BookOpen aria-hidden />{t({ en: "Learning support, in the context of your course", ar: "مساعدة تعليمية في سياق دورتك" })}</span>
            <Link href="/start/" className="site-preview-continue">{t({ en: "Learn with Mariam", ar: "تعلّم مع مريم" })}<ArrowRight aria-hidden /></Link>
          </div>}
          {mode === "practice" && <div className="site-preview-quiz">
            <span className="site-preview-source"><Sparkles aria-hidden />{t({ en: "Try a sample question", ar: "جرّب سؤالًا" })}</span>
            <h3>{t({ en: "Which part is wiped during wudu?", ar: "أي عضو يُمسح في الوضوء؟" })}</h3>
            <div className="site-preview-options">{choices.map((choice, i) => <button key={choice.en} aria-pressed={answer === i} onClick={() => setAnswer(i)} className={answer === i ? "is-picked" : ""}><span>{i + 1}</span>{t(choice)}{answer === i && <Check aria-hidden />}</button>)}</div>
            <p aria-live="polite" className="site-preview-feedback">{answer === null ? t({ en: "Choose an answer. Understanding grows with practice.", ar: "اختر إجابة. يتعمّق الفهم بالتدريب." }) : t(answer === 1 ? { en: "That’s right. The head is wiped with wet hands. See Quran 5:6.", ar: "صحيح. يُمسح الرأس باليدين المبلولتين. انظر المائدة: ٦." } : { en: "Try again: Quran 5:6 names the head as the part to wipe.", ar: "حاول مجددًا: تذكر المائدة: ٦ الرأس بوصفه العضو الذي يُمسح." })}</p>
            <a href="https://quran.com/5/6" target="_blank" rel="noreferrer" className="site-preview-source">{t({ en: "Read the source · Quran 5:6", ar: "اقرأ المصدر · المائدة: ٦" })}<ArrowUpRight aria-hidden /></a>
          </div>}
        </div>
      </div>
    </div>
    <div className="site-preview-float"><Image src={PERSONAS.mariam.avatar} alt="" width={48} height={48} /><div><b>{t({ en: "Meet Mariam", ar: "تعرّف على مريم" })} <span>AI</span></b><p>{t({ en: "Your course, a conversation away.", ar: "افهم دورتك من خلال الحوار." })}</p></div><Sparkles aria-hidden /></div>
    <span className="site-preview-caption">{t({ en: "Learn. Ask. Understand.", ar: "تعلّم. اسأل. افهم." })}</span>
  </div>;
}
