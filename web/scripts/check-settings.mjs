import assert from "node:assert/strict";
import * as jsx from "react/jsx-runtime";
import { loadSource } from "./load-source.mjs";

const { AUTH_STRINGS: S } = loadSource(new URL("../src/features/auth/strings.ts", import.meta.url));
const T = S.settings;
// Execute the actual components and handlers with local service boundaries.
for (const lang of ["en", "ar"]) {
  const slots = new Map();
  let path = "", index = 0;
  let failProfile = false, failSync = false, failPassword = false;
  let releaseProfile;
  const calls = { profile: [], prefs: [], check: [], password: [] };
  const session = {
    user: { id: "fixture", email: "fixture@example.test", app_metadata: { providers: ["google"] } },
    profileName: "Aymen Delly", prefs: { track: "explore" },
    async updateProfile(patch) {
      calls.profile.push(patch);
      if (releaseProfile) await new Promise((resolve) => { releaseProfile = resolve; });
      if (failProfile) throw new Error("Profile unavailable");
      session.profileName = patch.display_name;
    },
    async setPrefs(patch) {
      calls.prefs.push(patch); Object.assign(session.prefs, patch);
      return failSync ? "Sync unavailable" : null;
    },
  };
  const imports = {
    "react/jsx-runtime": jsx,
    react: { useState(initial) {
      const key = `${path}:${index++}`;
      if (!slots.has(key)) slots.set(key, initial);
      return [slots.get(key), (value) => slots.set(key, typeof value === "function" ? value(slots.get(key)) : value)];
    } },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "next/link": { default: "a" },
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Scenery": { PageBanner: () => null },
    "@/lib/strings": { S },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.[lang] ?? "", lang }) },
    "@/features/courses/ContentProvider": { useContent: () => ({ getTrack: (id) => ({ title: { en: id, ar: id } }) }) },
    "@/features/auth/SessionProvider": { useSession: () => session, displayName: () => "Fallback", errorText: (error) => error.message },
    "@/lib/supabase": { supabase: () => ({ auth: {
      async signInWithPassword(value) { calls.check.push(value); return { error: failPassword ? { code: "invalid_credentials" } : null }; },
      async updateUser(value) { calls.password.push(value); return { error: null }; },
    } }) },
  };
  const Page = loadSource(new URL("../src/features/auth/Settings.tsx", import.meta.url), imports).default;
  function render(node, at = "root") {
    if (Array.isArray(node)) return node.map((child, i) => render(child, `${at}/${i}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      path = `${at}/${node.type.name}`; index = 0;
      return render(node.type(node.props), path);
    }
    return { type: node.type, props: { ...node.props, children: render(node.props.children, `${at}/children`) } };
  }
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (!node || typeof node !== "object") return [];
    return [node, ...flatten(node.props?.children)];
  }
  const draw = () => flatten(render(jsx.jsx(Page, {})));
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node ?? "";
  const button = (label) => draw().find((node) => node.type === "button" && text(node) === label[lang]);
  const form = (buttonLabel) => draw().find((node) => node.type === "form" && text(node).includes(buttonLabel[lang]));
  const name = () => draw().find((node) => node.type === "input" && node.props.autoComplete === "name");
  const editName = (value) => name().props.onChange({ target: { value } });
  const submit = (label) => form(label).props.onSubmit({ preventDefault() {} });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const passwordFields = () => draw().filter((node) => node.type === "input" && node.props.type === "password");

  assert.equal(passwordFields().length, 0, "Google-only accounts have no password form");
  assert.equal(draw().filter((node) => node.type === "section").length, 2);
  assert.equal(draw().filter((node) => node.type === "input" && node.props.type === "file").length, 0);
  assert(draw().some((node) => node.type === "span" && text(node) === "A"), "Avatar uses one saved-name initial");
  assert(draw().find((node) => node.type === "input" && node.props.type === "email").props.disabled);
  assert(button(T.saveName).props.disabled);
  editName("   "); assert(button(T.saveName).props.disabled);
  editName(" Aymen Delly "); assert(button(T.saveName).props.disabled);
  editName(" New name "); assert(!button(T.saveName).props.disabled);
  failProfile = true; submit(T.saveName); await settle();
  assert(draw().some((node) => node.props.role === "alert" && text(node) === "Profile unavailable"));
  assert.equal(name().props.value, " New name ", "Failed save preserves the draft");
  failProfile = false; releaseProfile = true; submit(T.saveName);
  assert(button(T.saving).props.disabled);
  assert(draw().find((node) => node.type === "fieldset").props.disabled, "Fields freeze during saves");
  releaseProfile(); releaseProfile = null; await settle();
  assert.equal(session.profileName, "New name");
  assert.equal(calls.profile.at(-1).display_name, "New name");
  assert(button(T.saveName).props.disabled);
  editName("Another name"); assert(!draw().some((node) => node.props.role === "status"));

  const pick = () => draw().find((node) => node.type === "input" && node.props.value === "deepen").props.onChange();
  assert(button(T.saveTrack).props.disabled); pick(); failSync = true;
  submit(T.saveTrack); await settle();
  assert(!button(T.saveTrack).props.disabled, "Sync failure remains retryable after the optimistic local update");
  assert(draw().some((node) => node.props.role === "alert" && text(node).includes("Sync unavailable")));
  failSync = false; submit(T.saveTrack); await settle();
  assert(button(T.saveTrack).props.disabled);
  assert.equal(calls.prefs.at(-1).track, "deepen");
  assert.equal(calls.prefs.at(-1).onboarded, true);

  session.user.app_metadata.providers = ["email", "google"];
  assert.equal(passwordFields().length, 0, "Google-linked accounts hide passwords even with an email identity");
  session.user.app_metadata.providers = ["google", "email"];
  assert.equal(passwordFields().length, 0, "Provider order does not change Google account controls");
  session.user.app_metadata.providers = ["email"];
  session.user.identities = [{ provider: "google" }];
  assert.equal(passwordFields().length, 0, "Google identity hides passwords when provider metadata is incomplete");
  session.user.identities = [];
  session.user.app_metadata.provider = "google";
  assert.equal(passwordFields().length, 0, "Primary Google provider hides passwords");
  session.user.app_metadata.provider = "email";
  session.user.email = "fixture@gmail.com";
  assert.equal(passwordFields().length, 3, "Password accounts retain their controls even with a Gmail address");
  assert(button(T.updatePassword).props.disabled);
  const fillPasswords = (current, next, confirm) => {
    [current, next, confirm].forEach((value, i) => passwordFields()[i].props.onChange({ target: { value } }));
  };
  fillPasswords("old-password", "new-password", "mismatch");
  submit(T.updatePassword); await settle();
  assert(draw().some((node) => node.props.role === "alert" && text(node) === T.passwordMismatch[lang]));
  assert.equal(calls.check.length, 0, "Mismatch does not call auth");
  fillPasswords("old-password", "new-password", "new-password");
  assert(!draw().some((node) => node.props.role === "alert"));
  failPassword = true; submit(T.updatePassword); await settle();
  assert(draw().some((node) => node.props.role === "alert" && text(node) === T.wrongPassword[lang]));
  assert.equal(calls.password.length, 0, "Wrong current password never changes credentials");
  failPassword = false; submit(T.updatePassword); await settle();
  assert.equal(calls.password.at(-1).password, "new-password");
  assert.equal(calls.password.at(-1).current_password, "old-password");
  assert(passwordFields().every((node) => node.props.value === ""));
  assert(button(T.updatePassword).props.disabled);
  console.log(`PASS settings ${lang}: minimal page, initials, locked email, name validation/save/failure, sync retry, Google/password account controls and password handlers`);
}

// Real SessionProvider mutations must require an updated row and keep failed syncs pending.
{
  const stored = new Map([["account", "fixture"]]);
  const states = [true, null, { id: "fixture" }, { uid: "fixture", role: "learner", name: "Old name" }, "fixture"];
  let hook = 0, missingRow = false, selected;
  const filters = [];
  const { SessionProvider } = loadSource(new URL("../src/features/auth/SessionProvider.tsx", import.meta.url), {
    "react/jsx-runtime": jsx,
    react: {
      createContext: () => ({ Provider: "provider" }), useContext: () => null,
      useState(initial) { const i = hook++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {}, useRef: (current) => ({ current }),
    },
    "@/lib/store": { readStored: (key) => stored.get(key) ?? null, writeStored: (key, value) => value === null ? stored.delete(key) : stored.set(key, value), useIsClient: () => true, useStored: (key) => stored.get(key) ?? null },
    "@/features/learning/progress": { ACCOUNT_KEY: "account", PROGRESS_ERROR: "progress-error" },
    "@/lib/supabase": { supabase: () => ({ from: () => ({ update: (patch) => ({ eq: (column, uid) => {
      filters.push([column, uid]);
      return { select: (column) => { selected = column; return { single: async () => missingRow ? { error: new Error("No profile row") } : { data: patch, error: null } }; } };
    } }) }) }) },
  });
  const session = () => { hook = 0; return SessionProvider({ children: null }).props.value; };
  missingRow = true;
  await assert.rejects(session().updateProfile({ display_name: "New name" }), /No profile row/);
  assert.equal(session().profileName, "Old name", "A failed name save never updates the visible profile");
  assert.equal(await session().setPrefs({ track: "deepen" }), "No profile row");
  assert.equal(stored.get("yaqin.prefs.fixture.pending"), "1", "Failed journey sync remains pending");
  missingRow = false;
  await session().updateProfile({ display_name: "New name" });
  assert.equal(selected, "display_name");
  assert.equal(session().profileName, "New name");
  assert.equal(await session().setPrefs({ track: "deepen" }), null);
  assert.equal(selected, "id");
  assert(!stored.has("yaqin.prefs.fixture.pending"));
  assert(filters.every(([column, uid]) => column === "id" && uid === "fixture"));
  console.log("PASS SessionProvider: name/journey row confirmation, account filters, pending sync and successful retry");
}
