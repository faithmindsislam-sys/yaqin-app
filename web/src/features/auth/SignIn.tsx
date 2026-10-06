"use client";

import Image from "next/image";
import Link from "@/components/RouteLink";
import { useRouter } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { homePath, useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { supabase } from "@/lib/supabase";
import { authCallbackUrl, postLoginPath, routeUrl } from "@/lib/routes";

export default function SignIn() {
  const { t, lang, setLang } = useI18n();
  const { ready, user, prefs, authAvailable } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(postLoginPath(homePath(prefs)));
  }, [ready, user, prefs, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return setError(t(S.auth.unavailable));
    setBusy(true);
    setError(null);
    setMessage(null);
    setUnconfirmed(false);
    try {
      const res = mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { full_name: name, lang }, emailRedirectTo: authCallbackUrl() } });
      if (res.error) {
        setError(res.error.code === "user_banned" ? t(S.auth.accountDisabled) : res.error.message);
        setUnconfirmed(res.error.code === "email_not_confirmed");
      } else if (mode === "up" && !res.data.session) {
        setMessage(t(S.auth.checkEmail));
        setUnconfirmed(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  async function google() {
    const sb = supabase();
    if (!sb) return setError(t(S.auth.unavailable));
    setBusy(true); setError(null);
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authCallbackUrl() } });
      if (error) setError(error.message);
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  async function forgot() {
    const sb = supabase();
    if (!sb) return setError(t(S.auth.unavailable));
    if (!email) return setError(t({ en: "Enter your email address first.", ar: "أدخل بريدك الإلكتروني أولًا." }));
    setError(null); setBusy(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL(routeUrl("/reset-password/", location.hostname), location.origin).href });
      if (error) setError(error.message);
      else setMessage(t(S.auth.resetSent));
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  async function resendConfirmation() {
    const sb = supabase();
    if (!sb || !email) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: authCallbackUrl() } });
      if (error) throw error;
      setMessage(t(S.auth.checkEmail));
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-7xl overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-lift)] sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[0.8fr_1fr]">
        {/* Story side */}
        <div className="relative hidden items-center justify-center overflow-hidden bg-brand-800 p-12 lg:flex">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-brand-500 via-brand-800 to-ink" />
          <Image src="/yaqeen-logo.png" alt="" width={1254} height={1254} className="relative w-full max-w-[22rem] brightness-0 invert" preload />
        </div>

        {/* Form side */}
        <div className="flex flex-col px-5 py-5 sm:px-10 sm:py-6">
          <div className="signin-header mx-auto flex w-full max-w-md items-center justify-between gap-3 lg:justify-end">
            <div className="lg:hidden"><Logo /></div>
            <LangToggle />
          </div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-4">
            <h2 className="font-serif text-3xl text-ink">{t(mode === "in" ? S.auth.welcome : S.auth.create)}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t(mode === "in" ? S.auth.welcomeSub : S.auth.createSub)}</p>

            {!authAvailable && <p className="mt-4 rounded-xl bg-sky-100 px-3 py-2 text-sm text-ink-soft">{t(S.auth.unavailable)}</p>}

            <form onSubmit={submit} className="mt-4 space-y-3">
              {mode === "up" && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t(S.auth.name)}</span>
                  <div className="relative">
                    <UserRound className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input className="input ps-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </div>
                </label>
              )}
              {mode === "up" && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t({ en: "Account email language", ar: "لغة رسائل الحساب" })}</span>
                  <select className="input" value={lang} onChange={(e) => setLang(e.target.value === "ar" ? "ar" : "en")}>
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t(S.auth.email)}</span>
                <div className="relative">
                  <Mail className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className="input ps-10" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setUnconfirmed(false); }} placeholder="you@example.com" autoComplete="email" dir="ltr" />
                </div>
              </label>
              {/* "Forgot password?" sits on the label row but comes after the input in tab order. */}
              <div className="relative">
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium">{t(S.auth.password)}</label>
                <div className="relative">
                  <Lock className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="password"
                    className="input pe-11 ps-10"
                    type={show ? "text" : "password"}
                    required
                    minLength={mode === "up" ? 8 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label={t({ en: "Toggle password visibility", ar: "إظهار كلمة المرور أو إخفاؤها" })}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "in" && (
                  <button type="button" onClick={forgot} disabled={busy || !authAvailable} className="absolute end-0 top-0 text-sm text-brand-700 hover:underline">{t(S.auth.forgot)}</button>
                )}
              </div>
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
              {message && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800" role="status">{message}</p>}
              {unconfirmed && <button type="button" onClick={resendConfirmation} disabled={busy} className="text-sm text-brand-700 hover:underline">{t({ en: "Resend confirmation email", ar: "إعادة إرسال رسالة التأكيد" })}</button>}
              <button className="btn btn-primary w-full" disabled={busy || !authAvailable}>
                {t(mode === "in" ? S.auth.signIn : S.auth.signUp)} <span aria-hidden className="rtl:rotate-180">→</span>
              </button>
            </form>

            <div className="my-3 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              {t(S.auth.or)}
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <button onClick={google} disabled={busy || !authAvailable} className="btn btn-ghost flex-1 whitespace-nowrap !px-3">
                <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                {t(S.auth.google)}
              </button>
            </div>

            <p className="mt-4 text-center text-sm text-ink-soft">
              {t(mode === "in" ? S.auth.noAccount : S.auth.haveAccount)}{" "}
              <button disabled={busy} onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setMessage(null); setUnconfirmed(false); }} className="font-medium text-brand-700 hover:underline">
                {t(mode === "in" ? S.auth.signUp : S.auth.signIn)}
              </button>
            </p>
          </div>
          <nav className="flex justify-center gap-6 text-xs text-muted">
            <Link href="/">{t(S.nav.home)}</Link>
            <Link href="/privacy/">{t(S.footer.privacy)}</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
