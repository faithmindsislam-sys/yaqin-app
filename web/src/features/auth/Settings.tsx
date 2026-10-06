"use client";

import { useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { TRACK_META } from "@/features/courses/track-meta";
import { Avatar, Section } from "@/components/ui";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { displayName, errorText, useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { supabase } from "@/lib/supabase";
import type { Bi, TrackId } from "@/lib/types";

const T = S.settings;
const TRACK_IDS = Object.keys(TRACK_META) as TrackId[];
export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t(T.title)} sub={t(T.subtitle)}>
      <SettingsBody />
    </AppShell>
  );
}

function SettingsBody() {
  const { t } = useI18n();
  const { user } = useSession();
  const providers = [user?.app_metadata?.provider, ...(user?.app_metadata?.providers ?? []), ...(user?.identities?.map((identity) => identity.provider) ?? [])];
  const hasPassword = providers.includes("email") && !providers.includes("google");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageBanner title={t(T.title)} sub={t(T.subtitle)} />
      <ProfileSection />
      <TrackSection />
      {hasPassword && <PasswordSection />}
    </div>
  );
}

type Status = { busy: boolean; ok?: Bi; error?: string };
/** One save at a time per section: `run` shows the returned text on success, the thrown error otherwise.
 *  `clear` removes the message when the field is edited again, so "Saved" never sits next to an unsaved value. */
function useStatus() {
  const [status, setStatus] = useState<Status>({ busy: false });
  const run = async (save: () => Promise<Bi>) => {
    setStatus({ busy: true });
    try { setStatus({ busy: false, ok: await save() }); }
    catch (e) { setStatus({ busy: false, error: errorText(e) }); }
  };
  return [status, run, () => setStatus({ busy: false })] as const;
}

function Feedback({ status }: { status: Status }) {
  const { t } = useI18n();
  if (status.error) return <p role="alert" className="text-sm text-red-700">{status.error}</p>;
  if (!status.ok) return null;
  return <p role="status" className="text-sm text-brand-700">{t(status.ok)}</p>;
}

function SaveRow({ status, disabled = false, label = T.save }: { status: Status; disabled?: boolean; label?: Bi }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
      <button type="submit" className="btn btn-primary" disabled={disabled || status.busy}>{t(status.busy ? T.saving : label)}</button>
      <Feedback status={status} />
    </div>
  );
}

/** setPrefs always saves on this device; for an account it also reports whether the sync worked. */
function usePrefsSaver() {
  const { t } = useI18n();
  const { user, setPrefs } = useSession();
  return async (patch: Parameters<typeof setPrefs>[0]) => {
    const syncError = await setPrefs(patch);
    if (syncError) throw new Error(`${t(T.syncFailed)} ${syncError}`);
    return user ? T.saved : T.savedDevice;
  };
}

function ProfileSection() {
  const { t } = useI18n();
  const { user, profileName, updateProfile } = useSession();
  const [draft, setDraft] = useState<string | null>(null);
  const [status, run, clear] = useStatus();
  const savedName = profileName ?? displayName(user) ?? "";
  const name = draft ?? savedName;
  const changed = name.trim() !== savedName.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status.busy || !changed) return;
    void run(async () => {
      const display_name = name.trim();
      if (!display_name || display_name.length > 60) throw new Error(t(T.nameRule));
      await updateProfile({ display_name });
      setDraft(null);
      return T.saved;
    });
  };

  return (
    <Section title={t(T.profile)} sub={t(T.profileNote)} className="shadow-none"
      action={<Avatar name={savedName} className="h-12 w-12 text-xl" />}>
      <form onSubmit={submit}>
        <fieldset disabled={status.busy}>
          <label className="block text-sm font-medium text-ink">{t(T.name)}
            <input className="input mt-2 font-normal" aria-describedby="settings-name-note" required maxLength={60} autoComplete="name" value={name} onChange={(e) => { setDraft(e.target.value); clear(); }} />
          </label>
          <p id="settings-name-note" className="mt-1.5 text-xs text-muted">{t(T.nameNote)}</p>
          <label className="mt-5 block text-sm font-medium text-ink"><span className="flex items-center gap-2">{t(T.email)} <LockKeyhole className="h-3.5 w-3.5 text-muted" aria-hidden /></span>
            <input className="input mt-2 cursor-not-allowed bg-sky-50 font-normal text-ink-soft disabled:opacity-100" type="email" dir="ltr" disabled value={user?.email ?? ""} aria-describedby="settings-email-note" />
          </label>
          <p id="settings-email-note" className="mt-1.5 text-xs text-muted">{t(T.emailNote)}</p>
        </fieldset>
        <SaveRow status={status} disabled={!changed || !name.trim()} label={T.saveName} />
      </form>
    </Section>
  );
}

function TrackSection() {
  const { t } = useI18n();
  const { prefs } = useSession();
  const { getTrack } = useContent();
  const save = usePrefsSaver();
  const [picked, setPicked] = useState<TrackId | null>(null);
  const [status, run, clear] = useStatus();
  const track = picked ?? prefs.track;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Same write as the track chooser, so the account also counts as onboarded.
    if (track && !status.busy && (track !== prefs.track || status.error)) void run(() => save({ track, onboarded: true }));
  };

  return (
    <Section title={t(T.track)} sub={t(T.trackNote)} className="shadow-none">
      <form onSubmit={submit}>
        <fieldset disabled={status.busy}>
          <div role="radiogroup" aria-label={t(T.track)} className="grid gap-3">
            {TRACK_IDS.map((id) => {
              const { icon: Icon, ring, tags } = TRACK_META[id];
              return (
                <label key={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-4 text-sm text-ink transition hover:border-brand-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 has-[:disabled]:cursor-wait has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-400">
                  <input type="radio" name="track" value={id} aria-label={t(getTrack(id)?.title)} className="sr-only" checked={track === id} onChange={() => { setPicked(id); clear(); }} />
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ring}`}><Icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t(getTrack(id)?.title)}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{tags.filter((tag) => t(tag) !== t(getTrack(id)?.title)).map((tag) => t(tag)).join(" · ")}</span>
                  </span>
                  <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${track === id ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}>
                    {track === id && <Check className="h-3.5 w-3.5" />}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <SaveRow status={status} disabled={!track || (track === prefs.track && !status.error)} label={T.saveTrack} />
      </form>
    </Section>
  );
}

function PasswordSection() {
  const { t } = useI18n();
  const { user } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, run, clear] = useStatus();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status.busy) return;
    void run(async () => {
      if (next !== confirm) throw new Error(t(T.passwordMismatch));
      const sb = supabase();
      if (!sb || !user?.email) throw new Error(t(S.auth.unavailable));
      const check = await sb.auth.signInWithPassword({ email: user.email, password: current });
      if (check.error) throw check.error.code === "invalid_credentials" ? new Error(t(T.wrongPassword)) : check.error;
      const { error } = await sb.auth.updateUser({ password: next, current_password: current });
      if (error) throw error;
      setCurrent(""); setNext(""); setConfirm("");
      return T.passwordSaved;
    });
  };

  const field = (label: Bi, value: string, set: (v: string) => void, isNew: boolean) => (
    <label className="block text-sm font-medium text-ink">{t(label)}
      <input className="input mt-2 font-normal" type="password" required minLength={isNew ? 8 : undefined}
        autoComplete={isNew ? "new-password" : "current-password"} value={value} onChange={(e) => { set(e.target.value); clear(); }} />
    </label>
  );

  return (
    <Section title={t(T.password)} sub={t(T.passwordRule)} className="shadow-none">
      <form onSubmit={submit}>
        <fieldset disabled={status.busy} className="space-y-4">
          {field(T.currentPassword, current, setCurrent, false)}
          {field(T.newPassword, next, setNext, true)}
          {field(T.confirmPassword, confirm, setConfirm, true)}
        </fieldset>
        <SaveRow status={status} disabled={!current || next.length < 8 || !confirm} label={T.updatePassword} />
      </form>
    </Section>
  );
}
