"use client";

import Image from "next/image";
import Link from "@/components/RouteLink";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SitePage } from "@/components/SiteChrome";
import { useI18n } from "@/lib/i18n";
import { ARTICLES } from "./data";
import { ArticleCards, LearningCTA } from "./Sections";

export default function Articles() {
  const { t } = useI18n();
  return <SitePage><section className="site-container site-page-intro"><p className="site-kicker">{t({ en: "The Yaqeen journal", ar: "مقالات يقين" })}</p><h1>{t({ en: "Small reads. Meaningful beginnings.", ar: "قراءات قصيرة. وبدايات ذات معنى." })}</h1><p>{t({ en: "Make a little space for understanding. Start with the foundations of everyday worship, with clear references to explore further.", ar: "امنح الفهم قليلًا من وقتك. ابدأ بأساسيات العبادة اليومية، مع مراجع واضحة للتوسّع في التعلّم." })}</p></section><section className="site-container site-article-list" aria-label={t({ en: "All articles", ar: "جميع المقالات" })}><ArticleCards /></section><LearningCTA /></SitePage>;
}

export function Article({ slug }: { slug: typeof ARTICLES[number]["slug"] }) {
  const { t } = useI18n();
  const article = ARTICLES.find((item) => item.slug === slug)!;
  const wudu = slug === "how-to-perform-wudu";
  return <SitePage>
    <header className="site-container site-page-intro site-article-header"><Link href="/articles/" className="site-article-breadcrumb"><ArrowLeft aria-hidden />{t({ en: "Back to articles", ar: "العودة إلى المقالات" })}</Link><p className="site-kicker">{t(article.category)} · {article.minutes} {t({ en: "min read", ar: "دقائق للقراءة" })}</p><h1>{t(article.title)}</h1><p>{t(article.description)}</p></header>
    <div className="site-article-cover"><Image src={article.image} alt={t(article.alt)} width={1536} height={1024} preload sizes="(max-width: 767px) 100vw, 1050px" /></div>
    <article className="site-article-body">{wudu ? <WuduArticle /> : <ZakatArticle />}
      <div className="site-article-next"><p className="site-kicker">{t({ en: "Keep the learning going", ar: "واصل التعلّم" })}</p><h3>{t({ en: "From reading to understanding.", ar: "من القراءة إلى الفهم." })}</h3><p>{t({ en: "Follow a guided journey, ask your AI companion, and practise what you learn.", ar: "اتبع رحلة موجّهة واسأل رفيقك الذكي وتدرّب على ما تتعلّمه." })}</p><Link href={wudu ? "/start/?track=first-steps" : "/start/?track=deepen"} className="site-button site-button-primary">{t({ en: "Explore your journey", ar: "استكشف رحلتك" })}<ArrowRight aria-hidden /></Link></div>
    </article>
  </SitePage>;
}

function WuduArticle() {
  const { t } = useI18n();
  return <>
    <h2>{t({ en: "Preparing for prayer", ar: "التهيّؤ للصلاة" })}</h2><p>{t({ en: "Wudu is the washing and wiping used to prepare for prayer. Quran 5:6 names the face, arms, head, and feet.", ar: "الوضوء غسل ومسح للتهيّؤ للصلاة. تذكر آية المائدة: ٦ الوجه واليدين والرأس والرجلين." })} <a href="https://quranpedia.net/surah/1/5" target="_blank" rel="noreferrer">{t({ en: "Read Quran 5:6", ar: "اقرأ المائدة: ٦" })}</a>.</p>
    <h2>{t({ en: "A simple walkthrough", ar: "خطوات بسيطة" })}</h2><p>{t({ en: "This sequence follows the description narrated from Uthman ibn Affan of the Prophet’s ﷺ wudu.", ar: "تتبع هذه الخطوات وصف عثمان بن عفان رضي الله عنه لوضوء النبي ﷺ." })}</p>
    <ol>{[
      { title: { en: "Wash your hands.", ar: "اغسل كفّيك." }, text: { en: "Wash both hands three times.", ar: "اغسل الكفّين ثلاث مرات." } },
      { title: { en: "Rinse your mouth and nose.", ar: "تمضمض واستنشق." }, text: { en: "Rinse the mouth, gently draw water into the nose, and expel it.", ar: "اغسل فمك، وأدخل الماء إلى أنفك برفق ثم أخرجه." } },
      { title: { en: "Wash your face.", ar: "اغسل وجهك." }, text: { en: "Wash the whole face three times.", ar: "اغسل الوجه كله ثلاث مرات." } },
      { title: { en: "Wash your arms.", ar: "اغسل يديك إلى المرفقين." }, text: { en: "Wash each arm, including the elbow, three times.", ar: "اغسل كل يد مع المرفق ثلاث مرات." } },
      { title: { en: "Wipe your head.", ar: "امسح رأسك." }, text: { en: "Pass your wet hands over your head.", ar: "مرّر يديك المبلولتين على رأسك." } },
      { title: { en: "Wash your feet.", ar: "اغسل رجليك." }, text: { en: "Wash each foot, including the ankle, three times.", ar: "اغسل كل رجل مع الكعب ثلاث مرات." } },
    ].map(({ title, text }) => <li key={title.en}><b>{t(title)}</b> {t(text)}</li>)}</ol>
    <div className="site-article-note"><p>{t({ en: "This introduces one narrated way to perform wudu. Scholars differ on some detailed requirements. For illness, limited water, or a personal situation, ask a qualified teacher.", ar: "هذه مقدّمة لطريقة منقولة في الوضوء. يختلف العلماء في بعض التفاصيل. اسأل معلّمًا مؤهّلًا عند المرض أو قلّة الماء أو وجود حالة خاصة." })}</p></div>
  </>;
}

function ZakatArticle() {
  const { t } = useI18n();
  return <>
    <h2>{t({ en: "An act of worship and giving", ar: "عبادة وعطاء" })}</h2><p>{t({ en: "Zakat is one of Islam’s five pillars: an obligatory form of giving when its conditions are met. It differs from voluntary charity, known as sadaqah.", ar: "الزكاة ركن من أركان الإسلام الخمسة، وعطاء واجب عند تحقّق شروطه. وتختلف عن الصدقة التطوّعية." })}</p>
    <h2>{t({ en: "What does 2.5% mean?", ar: "ماذا تعني نسبة ٢٫٥٪؟" })}</h2><p>{t({ en: "For cash savings and many monetary assets, the familiar rate is 2.5% of zakatable wealth when the applicable nisab and lunar-year conditions are met. Nisab is the minimum wealth threshold. This rate does not apply to every type of asset.", ar: "في المدّخرات النقدية وكثير من الأموال، النسبة المعروفة هي ٢٫٥٪ من المال الزكوي عند تحقّق شروط النصاب والحول القمري المطبّقة. النصاب هو الحد الأدنى للمال، ولا تنطبق هذه النسبة على كل أنواع الأموال." })}</p>
    <h2>{t({ en: "A simple illustration", ar: "مثال توضيحي بسيط" })}</h2><div className="site-zakat-example" dir="ltr"><span>1,000</span><small>× 2.5%</small><span>= 25</span></div><p>{t({ en: "If your zakatable amount were 1,000 units and all relevant conditions were met, 2.5% would be 25 units. This example explains the percentage; it does not determine whether you owe zakat.", ar: "إذا كان المال الزكوي ١٠٠٠ وحدة وتحقّقت الشروط اللازمة، فإن ٢٫٥٪ تساوي ٢٥ وحدة. يوضّح هذا المثال النسبة ولا يحدّد وجوب الزكاة عليك." })}</p>
    <div className="site-article-note"><p>{t({ en: "Asset types, debts, thresholds, and personal circumstances can require further guidance. Ask a qualified scholar about your own calculation.", ar: "قد تحتاج أنواع الأموال والديون والأنصبة والظروف الشخصية إلى تفصيل. اسأل عالمًا مؤهّلًا عن حساب زكاتك." })}</p></div>
  </>;
}
