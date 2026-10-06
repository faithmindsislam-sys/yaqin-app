import type { SupabaseClient } from "@supabase/supabase-js";
import { ORIGINS } from "@/lib/routes";

const CHANNEL = "yaqeen-studio-auth-v1";
type Tokens = { access_token: string; refresh_token: string };
type Reply = { channel: string; id: string; session?: Tokens | null; signedIn?: boolean; error?: string };
let frame: HTMLIFrameElement | null = null;
let loaded: Promise<void> | null = null;

export const onStudioHost = () => typeof window !== "undefined" && window.location.origin === ORIGINS.studio;
export const onSiteHost = () => typeof window !== "undefined" && [ORIGINS.site, "https://yaqeenguide.com"].includes(window.location.origin);

/** Only Studio can exchange tokens; the public site receives a signed-in boolean. */
export function appAuthRequest(action: "status"): Promise<boolean>;
export function appAuthRequest(action: "session" | "signout"): Promise<Tokens | null>;
export function appAuthRequest(action: "session" | "signout" | "status"): Promise<Tokens | null | boolean> {
  if (!loaded) {
    loaded = new Promise<void>((resolve, reject) => {
      frame = document.createElement("iframe");
      frame.hidden = true;
      frame.title = "Yaqeen account session";
      frame.src = ORIGINS.app + "/auth/bridge/";
      const ready = (event: MessageEvent) => {
        if (event.origin !== ORIGINS.app || event.source !== frame?.contentWindow || event.data?.channel !== CHANNEL || event.data.action !== "ready") return;
        window.clearTimeout(timer); window.removeEventListener("message", ready); resolve();
      };
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", ready);
        reject(new Error("Account connection timed out. Please retry."));
      }, 15000);
      window.addEventListener("message", ready);
      document.body.appendChild(frame);
    }).catch((error) => { frame?.remove(); frame = null; loaded = null; throw error; });
  }
  return loaded.then(() => new Promise<Tokens | null | boolean>((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => finish(new Error("Account connection timed out. Please retry.")), 15000);
    function finish(error: Error | null, value: Tokens | null | boolean = null) {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (error) reject(error); else resolve(value);
    }
    function receive(event: MessageEvent<Reply>) {
      if (event.origin !== ORIGINS.app || event.source !== frame?.contentWindow || event.data?.channel !== CHANNEL || event.data.id !== id) return;
      if (event.data.error) finish(new Error(event.data.error));
      else finish(null, action === "status" ? event.data.signedIn === true : event.data.session ?? null);
    }
    window.addEventListener("message", receive);
    frame!.contentWindow!.postMessage({ channel: CHANNEL, id, action }, ORIGINS.app);
  }));
}

export async function syncStudioSession(sb: SupabaseClient): Promise<void> {
  if (!onStudioHost()) return;
  const tokens = await appAuthRequest("session");
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (tokens && data.session?.access_token !== tokens.access_token) {
    const saved = await sb.auth.setSession(tokens);
    if (saved.error) throw saved.error;
  } else if (!tokens && data.session) {
    const cleared = await sb.auth.signOut({ scope: "local" });
    if (cleared.error) throw cleared.error;
  }
}

export function trustedBridgeMessage(event: MessageEvent): boolean {
  return window.location.origin === ORIGINS.app && window.parent !== window &&
    event.source === window.parent &&
    event.data?.channel === CHANNEL && typeof event.data.id === "string" &&
    (event.origin === ORIGINS.studio && ["session", "signout", "status"].includes(event.data.action) ||
      [ORIGINS.site, "https://yaqeenguide.com"].includes(event.origin) && event.data.action === "status");
}

export function serveStudioSession(sb: SupabaseClient): () => void {
  const receive = async (event: MessageEvent) => {
    if (!trustedBridgeMessage(event)) return;
    try {
      if (event.data.action === "signout") {
        const previous = await sb.auth.getSession();
        const { error } = await sb.auth.signOut();
        if (error) {
          // auth-js clears local storage even if the remote logout fails.
          const session = previous.data.session;
          if (session) await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
          throw error;
        }
      }
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      if (event.data.action === "status") {
        window.parent.postMessage({ channel: CHANNEL, id: event.data.id, signedIn: !!data.session && !data.session.user.is_anonymous }, event.origin);
        return;
      }
      const session = data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null;
      window.parent.postMessage({ channel: CHANNEL, id: event.data.id, session }, event.origin);
    } catch {
      window.parent.postMessage({ channel: CHANNEL, id: event.data.id, error: "Account connection failed. Please retry." }, event.origin);
    }
  };
  window.addEventListener("message", receive);
  if (window.location.origin === ORIGINS.app && window.parent !== window) {
    for (const origin of [ORIGINS.studio, ORIGINS.site, "https://yaqeenguide.com"]) {
      window.parent.postMessage({ channel: CHANNEL, action: "ready" }, origin);
    }
  }
  return () => window.removeEventListener("message", receive);
}
