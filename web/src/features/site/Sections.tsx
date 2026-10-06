"use client";

import Image from "next/image";
import Link from "@/components/RouteLink";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ARTICLES } from "./data";

export function ArticleCards() {
  const { t } = useI18n();
  return <div className="site-article-grid">{ARTICLES.map((article) => <Link href={`/articles/${article.slug}/`} key={article.slug} className="site-article-card">
    <div className="site-article-image"><Image src={article.image} alt={t(article.alt)} width={1536} height={1024} sizes="(max-width: 767px) 100vw, 50vw" /><span><ArrowUpRight aria-hidden /></span></div>
    <div className="site-article-meta"><span>{t(article.category)}</span><span>{article.minutes} {t({ en: "min read", ar: "دقائق للقراءة" })}</span></div>
    <h3>{t(article.title)}</h3><p>{t(article.description)}</p>
    <span className="site-text-link">{t({ en: "Read the article", ar: "اقرأ المقال" })}<ArrowRight aria-hidden /></span>
  </Link>)}</div>;
}

export function LearningCTA() {
  const { t } = useI18n();
  return <section className="site-cta site-container">
    <div className="site-cta-star" aria-hidden>✦</div>
    <p className="site-kicker">{t({ en: "Your next chapter starts here", ar: "خطوتك القادمة تبدأ هنا" })}</p>
    <h2>{t({ en: "Make room for a little more meaning.", ar: "امنح المعنى مساحة أكبر في يومك." })}</h2>
    <p>{t({ en: "One question. One lesson. One step closer. Begin wherever you are.", ar: "سؤال واحد، ودرس واحد، وخطوة تقرّبك. ابدأ من حيث أنت." })}</p>
    <Link href="/start/" className="site-button site-button-primary">{t({ en: "Find my journey", ar: "اختر رحلتي" })}<ArrowRight aria-hidden /></Link>
    <span className="site-cta-note">{t({ en: "Arabic & English · Learn at your own pace", ar: "العربية والإنجليزية · تعلّم بالوتيرة التي تناسبك" })}</span>
  </section>;
}
