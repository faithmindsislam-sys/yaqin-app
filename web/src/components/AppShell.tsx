"use client";

import Link from "@/components/RouteLink";
import { usePathname, useRouter } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Users, BookOpenText, ClipboardCheck, HeartHandshake, Home, LibraryBig, LogOut, MoonStar, Scale, Sparkles, Sprout } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { displayName, useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { Logo } from "@/components/Logo";
import { Skyline } from "@/components/Scenery";
import { TRACK_META } from "@/features/courses/track-meta";
import { Avatar, LangToggle } from "@/components/ui";
import { useContent } from "@/features/courses/ContentProvider";
import { canReview, isStaff } from "@/features/auth/roles";
import { K } from "@/features/studio/knowledge-base/strings";
import { currentSignInPath, isStudioRoute, routeUrl } from "@/lib/routes";
import { useBrowserValue } from "@/lib/store";

const NAV = [
  { href: "/learn/", icon: Home, label: S.nav.dashboard, short: S.nav.dashboardShort },
  { href: "/library/", icon: LibraryBig, label: S.nav.library },
  { href: "/quran/", icon: BookOpenText, label: S.nav.quran, short: S.nav.quranShort },
  { href: "/compare/", icon: Scale, label: S.nav.compare, short: S.nav.compareShort },
  { href: "/ask/", icon: Sparkles, label: S.nav.ask },
  { href: "/shahada/", icon: HeartHandshake, label: S.nav.shahada, short: S.nav.shahadaShort, explore: true },
  { href: "/studio/", icon: ClipboardCheck, label: S.nav.instructor, staff: true },
];

const STUDIO_NAV = [
  { href: "/studio/", icon: ClipboardCheck, label: S.instructor.lessons, superAdmin: false },
  { href: "/studio/curriculum/", icon: BookOpenText, label: S.curriculum.title, admin: true, superAdmin: false },
  { href: "/studio/users/", icon: Users, label: S.users.title, superAdmin: true },
  { href: "/studio/knowledge-base/", icon: LibraryBig, label: K.title, admin: true, superAdmin: false },
  { href: "/learn/", icon: ArrowLeft, label: S.instructor.backToApp, short: S.instructor.backToApp, superAdmin: false },
];

/** Signed-in application frame: sidebar on desktop, bottom bar on mobile.
 *  `title` and `sub` fill the desktop header; on mobile the page shows them in a `PageBanner`. */
export function AppShell({ children, title, sub, workspace = false, toolbar }: { children: React.ReactNode; title?: React.ReactNode; sub?: React.ReactNode; workspace?: boolean; toolbar?: React.ReactNode }) {
  const { t } = useI18n();
  const { ready, user, role, prefs, profileName, signOut, syncError, authError, retrySync } = useSession();
  const { getTrack } = useContent();
  const track = prefs.track ? getTrack(prefs.track) : undefined;
  const TrackIcon = prefs.track ? TRACK_META[prefs.track]?.icon : null;
  const pathname = usePathname();
  const router = useRouter();
  const host = useBrowserValue(() => window.location.hostname, "");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  async function leaveAccount() {
    if (signingOut) return;
    setSigningOut(true); setSignOutError(false);
    try { await signOut(); router.push("/"); }
    catch { setSignOutError(true); setSigningOut(false); }
  }

  useEffect(() => {
    if (ready && !user && !authError && !signingOut) router.replace(currentSignInPath());
  }, [ready, user, authError, signingOut, router]);


  const studio = isStudioRoute(pathname, host);
  const items = studio ? STUDIO_NAV.filter((n) => (!n.superAdmin || role === "super_admin") && (!n.admin || canReview(role))) : NAV
    .filter((n) => (!n.staff || isStaff(role)) && (!n.explore || !prefs.track || prefs.track === "explore"))
    .map((n) => n.href === "/compare/" && prefs.track === "first-steps"
      ? { ...n, href: "/first-steps/", icon: Sprout, label: S.nav.firstSteps, short: S.nav.firstSteps }
      : n.href === "/compare/" && prefs.track === "deepen"
        ? { ...n, href: "/worship/", icon: MoonStar, label: S.nav.worship, short: S.nav.worshipShort } : n);
  const isActive = (href: string) => {
    const target = new URL(routeUrl(href, host), "http://localhost").pathname;
    if (href === "/studio/") return ["/", "/courses", "/courses/", "/editor", "/editor/", "/studio", "/studio/", "/studio/course", "/studio/course/", "/studio/lesson/"].includes(pathname);
    return pathname.startsWith(target.replace(/\/$/, ""));
  };
  const name = profileName ?? displayName(user) ?? "";
  const onSettings = pathname.startsWith("/settings");

  if (!ready || !user) return <div className="p-8">{authError ? <div role="alert"><p>{authError}</p><button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>{t({ en: "Retry", ar: "إعادة المحاولة" })}</button></div> : <p role="status">{t({ en: "Loading your account…", ar: "جارٍ تحميل حسابك…" })}</p>}</div>;

  return (
    <div className={`${workspace ? "h-dvh overflow-hidden" : "min-h-screen"} lg:grid lg:grid-cols-[15.5rem_1fr]`}>
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line bg-sky-50 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo horizontal href="/learn/" />
          <p className="mt-2 text-xs text-brand-700">{t(S.motto)}</p>
          {track && TrackIcon && (
            <>
              <p id="current-journey" className="mt-4 text-xs text-muted">{t({ en: "Your journey", ar: "مسارك" })}</p>
              <Link href="/journey/" aria-describedby="current-journey" title={t({ en: "Change journey", ar: "غيّر مسارك" })} className="chip mt-1.5 inline-flex items-center gap-1.5 hover:bg-brand-100">
                <TrackIcon className="h-3.5 w-3.5" /> {t(track.title)}
              </Link>
            </>
          )}
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                aria-current={active ? "page" : undefined}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-brand-100 font-semibold text-brand-700" : "text-ink-soft hover:bg-white"
                }`}
              >
                <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                {t(label)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-6">
          <Link href="/settings/" aria-label={t(S.settings.title)} aria-current={onSettings ? "page" : undefined} title={t(S.settings.title)} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 ${onSettings ? "bg-brand-100" : "hover:bg-white"}`}>
            <Avatar name={name} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{name}</span>
              <span className="block text-xs text-muted">{t(S.users.roles[role])}</span>
            </span>
          </Link>
          <button onClick={() => void leaveAccount()} disabled={signingOut} aria-label={t(S.nav.signOut)} className="rounded-lg p-2 text-muted hover:bg-white hover:text-ink" title={t(S.nav.signOut)}>
            <LogOut className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </aside>

      <div className={`${workspace ? "flex h-full min-h-0 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]" : "min-h-screen pb-20"} min-w-0 bg-white lg:pb-0`}>
        <header className={`sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line bg-white/95 py-3 backdrop-blur sm:px-6 ${workspace ? "gap-2 px-3" : "gap-3 px-4"} ${title ? "lg:overflow-hidden lg:px-8" : ""}`}>
          <div className={workspace ? "hidden" : "lg:hidden"}>
            <Logo compact href="/learn/" />
          </div>
          {toolbar}
          {title && (
            <div className="hidden min-w-0 py-3 lg:block">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-white via-sky-50 to-brand-50">
                <Skyline className="absolute inset-y-0 end-44 h-full w-[26rem] opacity-70 [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]" />
              </div>
              <h1 className="truncate font-serif text-3xl text-ink">{title}</h1>
              {sub && <p className="mt-1 truncate text-base text-ink-soft">{sub}</p>}
            </div>
          )}
          <div className="flex items-center gap-2 lg:ms-auto">
            <LangToggle compact={workspace} />
            {workspace && <details className="relative lg:hidden">
              <summary aria-label={t(S.settings.title)} className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full [&::-webkit-details-marker]:hidden"><Avatar name={name} className="h-8 w-8 text-xs" /></summary>
              <div className="absolute end-0 top-full z-40 mt-2 w-44 rounded-xl border border-line bg-white p-2 text-sm shadow-lg">
                <Link href="/settings/" className="block rounded-lg px-3 py-2 hover:bg-sky-50">{t(S.settings.title)}</Link>
                <button disabled={signingOut} onClick={() => void leaveAccount()} className="block w-full rounded-lg px-3 py-2 text-start hover:bg-sky-50">{t(S.nav.signOut)}</button>
              </div>
            </details>}
            <button className={`rounded-lg p-2 text-muted hover:bg-sky-50 ${workspace ? "hidden" : "lg:hidden"}`} disabled={signingOut} onClick={() => void leaveAccount()} aria-label={t(S.nav.signOut)}>
              <LogOut className="h-5 w-5 rtl:rotate-180" aria-hidden />
            </button>
            <Link href="/settings/" aria-label={t(S.settings.title)} aria-current={onSettings ? "page" : undefined} className={`rounded-full ${workspace ? "hidden" : "lg:hidden"}`}>
              <Avatar name={name} />
            </Link>
          </div>
        </header>
        <main className={workspace ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"}>
          {signOutError && <p role="alert" className="mb-5 shrink-0 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t({ en: "Sign-out failed. Please try again.", ar: "تعذّر تسجيل الخروج. حاول مجددًا." })}</p>}
          {(syncError || authError) && <div role="alert" className="mb-5 shrink-0 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>{t({ en: "Your changes are saved on this device, but account sync needs attention.", ar: "حُفظت تغييراتك على هذا الجهاز، لكن مزامنة الحساب تحتاج إلى معالجة." })}</p>
            <p>{syncError ?? authError}</p>
            <button className="mt-2 underline" onClick={() => void retrySync()}>{t({ en: "Retry sync", ar: "إعادة المزامنة" })}</button>
          </div>}
          {children}
        </main>
      </div>

      <nav aria-label={t(studio ? S.instructor.navigation : { en: "Learning navigation", ar: "التنقل في التعلّم" })} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map(({ href, icon: Icon, label, short }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={`flex flex-col items-center gap-1 px-0.5 py-2.5 text-center text-[0.7rem] leading-tight ${isActive(href) ? "text-brand-700" : "text-muted"}`}>
            <Icon className="h-5 w-5" />
            {t(short ?? label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
