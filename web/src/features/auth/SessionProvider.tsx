"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { readStored, useIsClient, useStored, writeStored } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { appAuthRequest, onStudioHost, syncStudioSession } from "@/features/auth/studio-session";
import { activateAccount, hydrateFromRemote, ACCOUNT_KEY, PROGRESS_ERROR } from "@/features/learning/progress";
import { isTrackId, type TrackId } from "@/lib/types";
import { normalizeRole, type Role } from "@/features/auth/roles";

export type { Role } from "@/features/auth/roles";
export type Prefs = { track: TrackId | null; minutes: number; onboarded: boolean; known: string[] };
export type ProfilePatch = { display_name: string };
type Session = {
  ready: boolean; user: User | null; role: Role; prefs: Prefs; authAvailable: boolean;
  /** From the profiles table. Google rewrites user_metadata on every sign-in, so these come first. */
  profileName: string | null;
  syncError: string | null; authError: string | null; retrySync: () => Promise<void>;
  /** Saves on this device at once; resolves to the account sync error, or null when it worked. */
  setPrefs: (p: Partial<Prefs>) => Promise<string | null>; signOut: () => Promise<void>;
  /** Writes the signed-in user's own profile row; throws when the save fails. */
  updateProfile: (patch: ProfilePatch) => Promise<void>;
};
const Ctx = createContext<Session | null>(null);
const PREFS_KEY = "yaqin.prefs";
const PROFILE_ERROR = "yaqin.sync.profile";
const DEFAULT_PREFS: Prefs = { track: null, minutes: 10, onboarded: false, known: [] };
const prefsKey = (uid: string | null) => uid ? `${PREFS_KEY}.${uid}` : PREFS_KEY;
const pendingKey = (uid: string) => `${PREFS_KEY}.${uid}.pending`;
function parsePrefs(raw: string | null): Prefs {
  try {
    const data = JSON.parse(raw ?? "null");
    if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_PREFS;
    return { track: isTrackId(data.track) ? data.track : null,
      minutes: Number.isFinite(data.minutes) && data.minutes > 0 && data.minutes <= 180 ? data.minutes : 10,
      onboarded: data.onboarded === true,
      known: Array.isArray(data.known) ? data.known.filter((id: unknown) => typeof id === "string") : [] };
  }
  catch { return DEFAULT_PREFS; }
}
export const errorText = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Your changes could not be synced.";

let profileWrites: Promise<void> = Promise.resolve();
function saveProfile(uid: string) {
  profileWrites = profileWrites.catch(() => {}).then(async () => {
    const sb = supabase();
    if (!sb || readStored(ACCOUNT_KEY) !== uid) return;
    const raw = readStored(prefsKey(uid));
    const p = parsePrefs(raw);
    const lang = readStored("yaqin.lang") ?? "en";
    const { error } = await sb.from("profiles").update({ preferred_track: p.track,
      daily_minutes: p.minutes, onboarded: p.onboarded, known_lessons: p.known, lang }).eq("id", uid).select("id").single();
    if (error) throw error;
    if (readStored(ACCOUNT_KEY) !== uid) return;
    if (readStored(prefsKey(uid)) === raw && (readStored("yaqin.lang") ?? "en") === lang) writeStored(pendingKey(uid), null);
    writeStored(PROFILE_ERROR, null);
  }).catch((e: unknown) => {
    if (readStored(ACCOUNT_KEY) === uid) writeStored(PROFILE_ERROR, errorText(e));
  });
  return profileWrites;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isClient = useIsClient();
  const sb = isClient ? supabase() : null;
  const signingOut = useRef(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ uid: string; role: Role; name: string | null } | null>(null);
  const [profileLoaded, setProfileLoaded] = useState<string | null>(null);
  const rawPrefs = useStored(prefsKey(user?.id ?? null));
  const prefs = useMemo(() => parsePrefs(rawPrefs), [rawPrefs]);
  const progressError = useStored(PROGRESS_ERROR);
  const profileError = useStored(PROFILE_ERROR);

  useEffect(() => {
    if (!sb) return;
    let active = true;
    let initialized = !onStudioHost();
    const apply = (next: User | null) => {
      if (next?.is_anonymous) next = null;
      activateAccount(next?.id ?? null);
      setUser(next);
      setAuthLoaded(true);
    };
    syncStudioSession(sb).then(() => { initialized = true; return sb.auth.getSession(); }).then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      apply(data.session?.user ?? null);
    }).catch((e: unknown) => { if (active) { setAuthError(errorText(e)); setAuthLoaded(true); } });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // Keep Supabase calls out of the auth callback (the auth client holds a lock).
      // Current auth-js clears its local session even when the sign-out request fails.
      // Keep the current screen until that explicit operation has a confirmed result.
      if (active && initialized && !(_event === "SIGNED_OUT" && signingOut.current)) apply(session?.user ?? null);
    });
    const onFocus = () => { if (onStudioHost()) void syncStudioSession(sb).catch((e: unknown) => { if (active) setAuthError(errorText(e)); }); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; sub.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, [sb]);

  const retrySync = useCallback(async () => {
    if (!sb || !user) return;
    const uid = user.id;
    await profileWrites;
    try {
      const { data, error } = await sb.from("profiles").select("*").eq("id", uid).single();
      if (readStored(ACCOUNT_KEY) !== uid) return;
      if (error) throw error;
      const local = parsePrefs(readStored(prefsKey(uid)));
      const guestPrefs = parsePrefs(readStored(PREFS_KEY));
      const pending = readStored(pendingKey(uid)) === "1";
      const remote = parsePrefs(JSON.stringify({ track: data.preferred_track, minutes: data.daily_minutes,
        onboarded: data.onboarded || isTrackId(data.preferred_track), known: data.known_lessons }));
      const next = pending ? local : remote.onboarded ? remote : guestPrefs.onboarded ? guestPrefs : remote;
      writeStored(prefsKey(uid), JSON.stringify(next));
      // Honor the signup email language before importing guest preferences.
      const accountLanguage = user.user_metadata?.lang;
      if (!pending && (remote.onboarded || accountLanguage === "en" || accountLanguage === "ar")) writeStored("yaqin.lang", data.lang);
      setProfile({ uid, role: normalizeRole(data.role), name: data.display_name || null });
      writeStored(PROFILE_ERROR, null);
      if (pending || (!remote.onboarded && guestPrefs.onboarded)) {
        writeStored(pendingKey(uid), "1");
        await saveProfile(uid);
      }
      // Guest preferences have now been copied into the account cache.
      writeStored(PREFS_KEY, null);
    } catch (e) {
      if (readStored(ACCOUNT_KEY) === uid) writeStored(PROFILE_ERROR, errorText(e));
    } finally {
      if (readStored(ACCOUNT_KEY) === uid) setProfileLoaded(uid);
    }
    try { await hydrateFromRemote(uid); }
    catch (e) { if (readStored(ACCOUNT_KEY) === uid) writeStored(PROGRESS_ERROR, errorText(e)); }
  }, [sb, user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrates the signed-in account from Supabase asynchronously.
  useEffect(() => { if (user) void retrySync(); }, [user, retrySync]);

  // Language changes use the same profile save queue as onboarding preferences.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const syncLanguage = () => {
      writeStored(pendingKey(uid), "1");
      void saveProfile(uid);
    };
    window.addEventListener("yaqin:language", syncLanguage);
    return () => window.removeEventListener("yaqin:language", syncLanguage);
  }, [user]);

  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    if (!user) return "Sign in to continue.";
    const uid = user.id;
    writeStored(prefsKey(uid), JSON.stringify(parsePrefs(JSON.stringify({ ...parsePrefs(readStored(prefsKey(uid))), ...patch }))));
    writeStored(pendingKey(uid), "1");
    await saveProfile(uid);
    return readStored(PROFILE_ERROR);
  }, [user]);

  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    if (!sb || !user) throw new Error("Sign in to change your profile.");
    const uid = user.id;
    const { data, error } = await sb.from("profiles").update(patch).eq("id", uid).select("display_name").single();
    if (error) throw error;
    setProfile((p) => p?.uid === uid ? { ...p, name: data.display_name } : p);
  }, [sb, user]);

  const signOut = useCallback(async () => {
    const previous = await sb?.auth.getSession();
    signingOut.current = true;
    try {
      if (onStudioHost()) await appAuthRequest("signout");
      const res = await sb?.auth.signOut(onStudioHost() ? { scope: "local" } : undefined);
      if (res?.error) throw res.error;
      setAuthError(null);
      activateAccount(null);
      writeStored(PROFILE_ERROR, null);
      setUser(null);
      setProfile(null);
    } catch (e) {
      const session = previous?.data.session;
      if (session) await sb?.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).catch(() => {});
      setAuthError(errorText(e));
      throw e;
    } finally { signingOut.current = false; }
  }, [sb]);

  const mine = user && profile?.uid === user.id ? profile : null;
  const role = mine?.role ?? "learner";
  const profileName = mine?.name ?? null;
  const ready = isClient && (!sb || (authLoaded && (!user || profileLoaded === user.id)));
  const value = useMemo<Session>(() => ({ ready, user, role, prefs, profileName,
    authAvailable: !!sb || !isClient, syncError: profileError ?? progressError, authError,
    retrySync, setPrefs, signOut, updateProfile }),
    [ready, user, role, prefs, profileName, sb, isClient, profileError, progressError, authError, retrySync, setPrefs, signOut, updateProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
/** Where a signed-in learner lands: the dashboard, or the track chooser until a track is picked. */
export const homePath = (prefs: Prefs) => prefs.onboarded ? "/learn/" : "/journey/";

export function displayName(user: User | null): string | null {
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name ?? meta?.name ?? user?.email?.split("@")[0] ?? null;
}
