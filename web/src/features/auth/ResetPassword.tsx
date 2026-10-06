"use client";

import Link from "@/components/RouteLink";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/features/auth/SessionProvider";
import { useBrowserValue } from "@/lib/store";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const { ready, user, authAvailable } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkError = useBrowserValue(() => new URLSearchParams(location.hash.slice(1)).get("error_description") ?? new URLSearchParams(location.search).get("error_description"), null);
  const sessionError = !authAvailable ? t({ en: "Supabase login is not configured.", ar: "تسجيل الدخول غير مهيّأ." }) : ready && !user ? t({ en: "This reset link has expired. Request a new one from Sign in.", ar: "انتهت صلاحية الرابط. اطلب رابطًا جديدًا من صفحة الدخول." }) : null;
  const shownError = linkError ?? error ?? sessionError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError(t({ en: "The passwords do not match.", ar: "كلمتا المرور غير متطابقتين." }));
    setBusy(true); setError(null);
    try {
      const sb = supabase();
      if (!sb) throw new Error("Supabase login is not configured.");
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Password could not be changed."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-lg px-5 py-8">
    <header className="flex items-center justify-between"><Logo compact /><LangToggle /></header>
    <section className="card mt-12 p-6">
      <h1 className="font-serif text-3xl">{t({ en: "Set a new password", ar: "تعيين كلمة مرور جديدة" })}</h1>
      {shownError && <p role="alert" className="mt-4 text-sm text-red-700">{shownError}</p>}
      {done ? <div className="mt-5"><p>{t({ en: "Your password has been updated.", ar: "تم تحديث كلمة مرورك." })}</p><Link className="btn btn-primary mt-4" href="/learn/">{t({ en: "Continue", ar: "متابعة" })}</Link></div> : <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">{t({ en: "New password", ar: "كلمة المرور الجديدة" })}<input className="input mt-2" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="block">{t({ en: "Confirm password", ar: "تأكيد كلمة المرور" })}<input className="input mt-2" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={!ready || !user || !!linkError || busy}>{t({ en: busy ? "Updating…" : "Update password", ar: busy ? "جارٍ التحديث…" : "تحديث كلمة المرور" })}</button>
      </form>}
      <Link className="mt-5 block text-sm underline" href="/signin/">{t({ en: "Back to sign in", ar: "العودة إلى تسجيل الدخول" })}</Link>
    </section>
  </div>;
}
