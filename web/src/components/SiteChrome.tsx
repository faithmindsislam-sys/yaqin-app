"use client";

import { useEffect, useState } from "react";
import Link from "@/components/RouteLink";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import { appAuthRequest, onSiteHost } from "@/features/auth/studio-session";
import { LangToggle } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { ArrowUpRight, Menu } from "lucide-react";
import { SITE_LINKS } from "@/features/site/data";

const NAV = [
  { href: "/#journeys", label: { en: "Your journey", ar: "رحلتك" } },
  { href: "/#experience", label: { en: "The experience", ar: "تجربة التعلّم" } },
  { href: "/articles/", label: { en: "Articles", ar: "مقالات" } },
  { href: SITE_LINKS.docs, label: { en: "For developers", ar: "للمطوّرين" } },
  { href: "/teachers/", label: { en: "For educators", ar: "للمعلّمين" } },
];

export function SiteHeader() {
  const { t } = useI18n();
  const { user } = useSession();
  const [appSignedIn, setAppSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!onSiteHost()) return;
    let active = true;
    const refresh = () => {
      void appAuthRequest("status").then((signedIn) => { if (active) setAppSignedIn(signedIn); })
        .catch(() => { if (active) setAppSignedIn(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, []);
  const signedIn = appSignedIn ?? !!user;
  return <header className="site-header">
    <a className="site-skip" href="#main-content">{t({ en: "Skip to content", ar: "انتقل إلى المحتوى" })}</a>
    <div className="site-header-inner">
      <Logo horizontal />
      <nav className="site-nav desktop-nav" aria-label={t({ en: "Main navigation", ar: "التنقل الرئيسي" })}>
        {NAV.map(({ href, label }) => <Link href={href} key={label.en}>{t(label)}</Link>)}
      </nav>
      <div className="site-header-actions">
        <LangToggle className="header-lang" />
        {!signedIn && <Link href="/signin/" className="header-signin">{t({ en: "Sign in", ar: "تسجيل الدخول" })}</Link>}
        <Link href={signedIn ? "/learn/" : "/start/"} className="site-button site-button-primary site-header-cta">
          {t(signedIn ? { en: "Dashboard", ar: "لوحتي" } : { en: "Start your journey", ar: "ابدأ رحلتك" })}<ArrowUpRight aria-hidden />
        </Link>
        <details className="mobile-menu">
          <summary aria-label={t({ en: "Navigation menu", ar: "قائمة التنقل" })}><Menu aria-hidden /></summary>
          <nav className="site-nav" aria-label={t({ en: "Mobile navigation", ar: "التنقل على الهاتف" })} onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
          }}>
            {NAV.map(({ href, label }) => <Link href={href} key={label.en}>{t(label)}</Link>)}
            {!signedIn && <Link href="/signin/">{t({ en: "Sign in", ar: "تسجيل الدخول" })}</Link>}
            <LangToggle />
          </nav>
        </details>
      </div>
    </div>
  </header>;
}

export function SiteFooter() {
  const { t } = useI18n();
  return <footer className="site-footer">
    <div className="site-container site-footer-grid">
      <div className="site-footer-brand">
        <Logo horizontal />
        <p>{t({ en: "A little learning. A deeper connection.", ar: "قليل من التعلّم، وصلة أعمق." })}</p>
        <p className="site-footer-description">{t({ en: "Islamic learning for your questions, your pace, and your next chapter.", ar: "تعلّم إسلامي يناسب أسئلتك ووتيرتك وخطوتك القادمة." })}</p>
        <div className="site-socials">
          <a href={SITE_LINKS.instagram} aria-label="Instagram" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" /></svg></a>
          <a href={SITE_LINKS.facebook} aria-label="Facebook" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M14 22v-9h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.4A23 23 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v9h4Z" /></svg></a>
          <a href={SITE_LINKS.youtube} aria-label="YouTube" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" /></svg></a>
          <a href={SITE_LINKS.x} aria-label="X" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.9-7.4L5.6 22H2.4l8.2-9.4L.8 2h6.4l4.4 6.7L18.9 2ZM17.8 20h1.7L6.1 3.9H4.3L17.8 20Z" /></svg></a>
        </div>
      </div>
      <div><p className="site-footer-label">{t({ en: "Discover", ar: "اكتشف" })}</p><nav aria-label={t({ en: "Discover Yaqeen", ar: "اكتشف يقين" })}>
        <Link href="/#journeys">{t({ en: "Learning journeys", ar: "مسارات التعلّم" })}</Link>
        <Link href="/#companions">{t({ en: "Meet your AI guides", ar: "تعرّف على مرشديك" })}</Link>
        <Link href="/articles/">{t({ en: "Articles", ar: "مقالات" })}</Link>
        <Link href="/#approach">{t({ en: "Our approach", ar: "منهجنا" })}</Link>
      </nav></div>
      <div><p className="site-footer-label">{t({ en: "Build with us", ar: "شاركنا البناء" })}</p><nav aria-label={t({ en: "Community and developers", ar: "المجتمع والمطوّرون" })}>
        <Link href="/teachers/">{t({ en: "For educators", ar: "للمعلّمين" })}</Link>
        <a href={SITE_LINKS.docs} target="_blank" rel="noreferrer">{t({ en: "API documentation", ar: "توثيق API" })}<ArrowUpRight aria-hidden /></a>
        <a href={SITE_LINKS.mcpGuide} target="_blank" rel="noreferrer">{t({ en: "Connect with MCP", ar: "اتصل عبر MCP" })}<ArrowUpRight aria-hidden /></a>
        <a href={`mailto:${SITE_LINKS.email}`}>{t({ en: "Contact us", ar: "تواصل معنا" })}</a>
      </nav></div>
      <div className="site-footer-contact"><p className="site-footer-label">{t({ en: "Let’s stay connected", ar: "لنبقَ على تواصل" })}</p>
        <p>{t({ en: "A question, an idea, or a contribution? We’d love to hear from you.", ar: "سؤال أو فكرة أو مساهمة؟ يسعدنا أن نسمع منك." })}</p>
        <a href={`mailto:${SITE_LINKS.email}`} dir="ltr">{SITE_LINKS.email}</a><LangToggle />
      </div>
    </div>
    <div className="site-container site-footer-bottom"><span>© {new Date().getFullYear()} {t({ en: "Yaqeen · Knowledge that brings you closer", ar: "يقين · علم يقرّبك" })}</span><Link href="/privacy/">{t({ en: "Privacy", ar: "الخصوصية" })}</Link><span>{t({ en: "Made for meaningful learning.", ar: "صُمّم لتعلّم ذي معنى." })}</span></div>
    <p className="site-container site-footer-ai">{t({ en: "Our companions are AI. They help you learn with referenced explanations; personal religious rulings belong with qualified scholars.", ar: "رفقاؤنا يعملون بالذكاء الاصطناعي، ويساعدونك بشروح موثّقة. أمّا الفتاوى الشخصية فمرجعها أهل العلم المؤهّلون." })}</p>
  </footer>;
}

export function SitePage({ children }: { children: React.ReactNode }) {
  return <div className="public-site"><SiteHeader /><main id="main-content">{children}</main><SiteFooter /></div>;
}
