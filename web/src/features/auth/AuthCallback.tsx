"use client";

import Link from "@/components/RouteLink";
import { useRouter } from "@/lib/navigation";
import { useEffect } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/ui";
import { homePath, useSession } from "@/features/auth/SessionProvider";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import { postLoginPath } from "@/lib/routes";
import { useBrowserValue, useIsClient } from "@/lib/store";

// Supabase sends the error in the URL hash, and sometimes in the query too.
const linkParam = (name: string) => new URLSearchParams(location.hash.slice(1)).get(name) ?? new URLSearchParams(location.search).get(name);

export default function AuthCallbackPage() {
  const { ready, user, prefs, authError } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const checked = useIsClient();
  const linkError = useBrowserValue(() => linkParam("error_description"), null);
  const banned = useBrowserValue(() => linkParam("error_code") === "user_banned", false);
  useEffect(() => {
    if (checked && ready && user && !linkError && !authError) router.replace(postLoginPath(homePath(prefs)));
  }, [checked, ready, user, prefs, linkError, authError, router]);
  // Same friendly text as the sign-in form, instead of Supabase's "User is banned".
  const error = banned ? t(S.auth.accountDisabled) : linkError ?? authError ?? (checked && ready && !user ? t({ en: "The login link is invalid or expired. Please sign in again.", ar: "رابط الدخول غير صالح أو منتهي. سجّل الدخول مجددًا." }) : null);
  return <div className="mx-auto max-w-lg px-5 py-8">
    <header className="flex items-center justify-between"><Logo compact /><LangToggle /></header>
    <main className="card mt-12 p-8 text-center">
      <span className={`studio-confirm-icon ${error ? "is-danger" : ""}`}>{error ? <CircleAlert className="h-6 w-6" aria-hidden /> : <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden />}</span>
      {error && <h1 className="mt-5 font-serif text-3xl">{t(banned ? { en: "Account disabled", ar: "الحساب معطّل" } : { en: "Sign-in failed", ar: "تعذّر تسجيل الدخول" })}</h1>}
      <p role={error ? "alert" : "status"} className={error ? "mt-2 text-ink-soft" : "mt-5 text-ink-soft"}>{error ?? t({ en: "Completing sign in…", ar: "جارٍ إكمال تسجيل الدخول…" })}</p>
      {error && <Link className="btn btn-primary mt-6" href="/signin/">{t({ en: "Back to sign in", ar: "العودة إلى تسجيل الدخول" })}</Link>}
    </main>
  </div>;
}
