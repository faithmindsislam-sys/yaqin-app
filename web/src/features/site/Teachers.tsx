"use client";

import Image from "next/image";
import { ArrowUpRight, BookOpenCheck, FileCheck2, GraduationCap, Sparkles } from "lucide-react";
import { SitePage } from "@/components/SiteChrome";
import { useI18n } from "@/lib/i18n";
import { PERSONAS } from "@/lib/personas";
import { HASSAN_EDUCATOR_ROLE, SITE_LINKS } from "./data";

export default function Teachers() {
  const { t } = useI18n();
  const contact = `mailto:${SITE_LINKS.email}?subject=${encodeURIComponent("Contributing as a Yaqeen educator")}`;
  return <SitePage>
    <section className="site-container site-page-intro site-teacher-hero">
      <div><p className="site-kicker">{t({ en: "For educators & qualified reviewers", ar: "للمعلّمين والمراجعين المؤهّلين" })}</p>
        <h1>{t({ en: "Your knowledge.", ar: "علمك." })}<br /><em>{t({ en: "A wider impact.", ar: "وأثر أوسع." })}</em></h1>
        <p className="site-hero-description">{t({ en: "Help make Islamic learning clearer, more accessible, and more thoughtful. We’re inviting educators to contribute their expertise to Yaqeen’s courses and review process.", ar: "ساهم في جعل التعلّم الإسلامي أوضح وأسهل وصولًا وأعمق عناية. ندعو المعلّمين إلى توظيف خبرتهم في دورات يقين ومراجعة محتواه." })}</p>
        <a href={contact} className="site-button site-button-primary">{t({ en: "Let’s talk about contributing", ar: "لنتحدّث عن مساهمتك" })}<ArrowUpRight aria-hidden /></a>
      </div>
      <div className="site-educator-art" aria-label={t({ en: "Illustration of an AI-assisted course draft awaiting review", ar: "رسم لمسودة دورة بمساعدة الذكاء الاصطناعي تنتظر المراجعة" })}>
        <div className="site-educator-sheet"><span className="site-kicker">YAQEEN STUDIO</span><div className="site-mini-persona"><Image src={PERSONAS.hassan.avatar} alt="" width={48} height={48} /><div><b>{t(PERSONAS.hassan.name)} <span>AI</span></b><p>{t(HASSAN_EDUCATOR_ROLE)}</p></div></div><div className="site-draft-lines" aria-hidden><i /><i /><i /></div><span className="site-review-badge"><FileCheck2 aria-hidden />{t({ en: "Draft → Review → Publication", ar: "مسودة ← مراجعة ← نشر" })}</span></div><span className="site-educator-seal" aria-hidden><GraduationCap /></span>
      </div>
    </section>
    <section className="site-container site-section site-teacher-workflow"><div className="site-section-heading"><div><p className="site-kicker">{t({ en: "Technology supports. People decide.", ar: "التقنية تساعد. والإنسان يقرّر." })}</p><h2>{t({ en: "A better draft is only the beginning.", ar: "المسودة الجيدة ليست سوى البداية." })}</h2></div></div>
      <div className="site-feature-grid">{[
        { icon: Sparkles, title: { en: "Create with Hassan", ar: "أنشئ بمساعدة حسن" }, text: { en: "Choose an audience and a topic. Hassan, our AI educator assistant, helps prepare a structured draft for your chosen journey. Edit it in Studio and shape it with your expertise.", ar: "اختر الجمهور والموضوع. يساعد حسن، مساعد المعلّمين الذكي، على إعداد مسودة منظّمة للمسار الذي تختاره. حرّرها في الاستوديو وأضف إليها خبرتك." } },
        { icon: BookOpenCheck, title: { en: "Check the substance", ar: "راجع المضمون" }, text: { en: "Review the sources and the explanation separately. Help improve accuracy, context, language, and the questions that learners practise with. AI-generated content is a draft to assess.", ar: "راجع المصادر والشرح كلًّا على حدة. ساعد على تحسين الدقة والسياق واللغة وأسئلة التدريب. المحتوى المولّد بالذكاء الاصطناعي مسودة تحتاج إلى التقييم." } },
        { icon: FileCheck2, title: { en: "Help it become ready", ar: "ساعد على تجهيزه" }, text: { en: "Teachers refine the draft. Human reviewers check course content and sources, and administrators approve publication. Hassan helps prepare courses; he never publishes them himself.", ar: "يحسّن المعلّمون المسودة، ويراجع البشر محتوى الدورات والمصادر، ويعتمد المشرفون النشر. يساعد حسن في إعداد الدورات، ولا ينشرها بنفسه." } },
      ].map(({ icon: Icon, title, text }) => <article className="site-feature-card" key={title.en}><div className="site-feature-icon"><Icon aria-hidden /></div><h3>{t(title)}</h3><p>{t(text)}</p></article>)}</div>
    </section>
    <section className="site-container site-teacher-contact"><div><p className="site-kicker">{t({ en: "An invitation to contribute", ar: "دعوة إلى المساهمة" })}</p><h2>{t({ en: "Bring your expertise to the table.", ar: "شاركنا خبرتك." })}</h2><p>{t({ en: "If you teach Islamic studies, can review religious content, or have experience making learning accessible, we’d love to hear from you.", ar: "إذا كنت تدرّس العلوم الإسلامية أو تستطيع مراجعة المحتوى الشرعي أو لديك خبرة في تيسير التعلّم، يسعدنا أن نتواصل معك." })}</p><a href={contact} className="site-button site-button-primary">{t({ en: "Contact the Yaqeen team", ar: "تواصل مع فريق يقين" })}<ArrowUpRight aria-hidden /></a><a href={`mailto:${SITE_LINKS.email}`} className="site-email-label" dir="ltr">{SITE_LINKS.email}</a></div><div><p>{t({ en: "Tell us a little about:", ar: "أخبرنا بإيجاز عن:" })}</p><ul>{[{ en: "Your teaching background or relevant qualifications.", ar: "خبرتك في التعليم أو مؤهّلاتك ذات الصلة." }, { en: "The subjects and languages you work with.", ar: "المجالات واللغات التي تعمل بها." }, { en: "How you’d like to contribute: courses, explanations, or source review.", ar: "كيف تحبّ أن تساهم: دورات أو شروح أو مراجعة مصادر." }].map((item) => <li key={item.en}>{t(item)}</li>)}</ul><p>{t({ en: "Our team will discuss the contribution and the appropriate Studio access with you.", ar: "سيناقش فريقنا معك المساهمة وصلاحيات الاستوديو المناسبة لها." })}</p></div></section>
  </SitePage>;
}
