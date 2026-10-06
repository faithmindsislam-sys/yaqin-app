// Run the real progress module with a tiny Supabase/store substitute; no test framework needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./load-source.mjs";

const values = new Map();
const rows = new Map();
const days = new Map();
let fail = false;
const store = {
  readStored: (key) => values.get(key) ?? null,
  writeStored: (key, value) => value === null ? values.delete(key) : values.set(key, value),
};
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: values.get("yaqin.account") } }, error: null }) },
  rpc: async (_name, p) => {
    if (fail) return { error: new Error("Offline") };
    assert.equal(p.p_user, values.get("yaqin.account"));
    const key = `${p.p_user}/${p.p_lesson}`;
    const old = rows.get(key) ?? {};
    rows.set(key, { user_id: p.p_user, lesson_id: p.p_lesson,
      card_index: Math.max(old.card_index ?? 0, p.p_card), cards_done: old.cards_done || p.p_cards_done,
      explain_back_score: p.p_explained ? 1 : old.explain_back_score ?? null,
      quiz_score: p.p_quiz_score ?? old.quiz_score ?? null, completed_at: old.completed_at ?? p.p_completed_at,
      note: p.p_note ?? old.note ?? "" });
    return { error: null };
  },
  from: (table) => ({
    select: () => ({ eq: async (_column, uid) => ({ error: null,
      data: table === "progress" ? [...rows.values()].filter((r) => r.user_id === uid) : (days.get(uid) ?? []).map((day) => ({ day })) }) }),
    upsert: async (items) => { for (const row of items) days.set(row.user_id, [...new Set([...(days.get(row.user_id) ?? []), row.day])]); return { error: null }; },
  }),
};
const sandboxModule = { exports: {} };
const source = readFileSync(new URL("../src/features/learning/progress.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, require: (name) => {
  if (name === "react") return {};
  if (name === "@/lib/store") return store;
  if (name === "@/lib/supabase") return { supabase: () => sb };
  throw new Error(`Unexpected module ${name}`);
}, Date, Promise, console });
const p = sandboxModule.exports;
const guest = { card: 1, cardsDone: true, explained: false, quizScore: null, completedAt: null };
store.writeStored("yaqin.progress", JSON.stringify({ lessons: { wudu: guest }, days: ["2026-01-01"], notes: { wudu: "Guest note" } }));
p.activateAccount("alice");
await p.hydrateFromRemote();
assert.equal(rows.get("alice/wudu").note, "Guest note");
assert.equal(rows.get("alice/wudu").card_index, 1);
assert.equal(store.readStored("yaqin.progress"), null);

fail = true;
p.updateLesson("wudu", { card: 0, completedAt: "2026-01-02T00:00:00Z", quizScore: 0.75 });
p.saveNote("wudu", "Changed while offline");
await p.hydrateFromRemote();
assert.equal(store.readStored(p.PROGRESS_ERROR), "Offline");
assert.ok(JSON.parse(store.readStored("yaqin.progress.alice")).pending.includes("wudu"));
fail = false;
await p.hydrateFromRemote();
assert.equal(rows.get("alice/wudu").card_index, 1);
assert.equal(rows.get("alice/wudu").note, "Changed while offline");
assert.equal(rows.get("alice/wudu").completed_at, "2026-01-02T00:00:00Z");
assert.equal(store.readStored(p.PROGRESS_ERROR), null);

p.activateAccount("bob");
store.writeStored(p.PROGRESS_ERROR, "TypeError: Failed to fetch");
await p.hydrateFromRemote();
assert.equal(store.readStored(p.PROGRESS_ERROR), null, "Successful retry clears a stale error even without pending lesson writes");
assert.equal(Object.keys(JSON.parse(store.readStored("yaqin.progress.bob")).lessons).length, 0);
assert.equal(rows.has("bob/wudu"), false);
p.activateAccount("alice");
await p.hydrateFromRemote();
assert.equal(JSON.parse(store.readStored("yaqin.progress.alice")).notes.wudu, "Changed while offline");

// Recommended next lesson: track order, known lessons last, first lesson again when all are complete.
const path = [{ id: "a" }, { id: "b" }, { id: "c" }];
const done = { completedAt: "2026-01-02T00:00:00Z" };
assert.equal(p.nextLesson(path, [], {}).id, "a");
assert.equal(p.nextLesson(path, [], { a: done, b: { completedAt: null } }).id, "b");
assert.equal(p.nextLesson(path, ["a"], {}).id, "b");
assert.equal(p.nextLesson(path, [], { a: done, b: done, c: done }).id, "a");
assert.equal(p.nextLesson([], [], {}), undefined);
console.log("Guest import, offline retry, progress merge, note persistence, account isolation and next lesson passed.");

// An empty saved curriculum must not flash its final module before live courses arrive.
for (const lang of ["en", "ar"]) for (const [track, total] of [["explore", 3], ["first-steps", 5], ["deepen", 15]]) {
  let status = "loading", lessons = [];
  let modules = Array.from({ length: 3 }, (_, i) => ({ id: `module-${i}`, title: { en: "Module", ar: "وحدة" }, lessons: [] }));
  const course = { id: "shahada", title: { en: "Shahada", ar: "الشهادة" }, tracks: [track], minutes: 5, cards: [], quiz: [] };
  const { default: Dashboard } = loadSource(new URL("../src/features/learning/Dashboard.tsx", import.meta.url), {
    "react/jsx-runtime": jsx,
    react: { useEffect() {}, useMemo: (fn) => fn(), useState: (value) => [value, () => {}] },
    "@/components/RouteLink": { default: "a" }, "@/lib/navigation": { useRouter: () => ({}) },
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Scenery": { PageBanner: () => null }, "@/components/Visuals": { CardVisual: () => null },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/features/auth/SessionProvider": { useSession: () => ({ ready: true, user: { id: "learner" }, prefs: { track, onboarded: true, known: [] } }), displayName: () => null },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.[lang] ?? "" }) },
    "@/features/learning/progress": { nextLesson: p.nextLesson, streak: p.streak, useProgress: () => ({ lessons: {}, days: [] }) },
    "@/features/courses/ContentProvider": { useContent: () => ({ status, trackLessons: () => lessons,
      getTrack: () => ({ modules }), getLesson: (id) => lessons.find((lesson) => lesson.id === id), comingSoon: {}, subjects: [], levels: [] }) },
  });
  const draw = () => renderToStaticMarkup(jsx.jsx(Dashboard, {}));
  assert.match(draw(), /role="status"/, "An empty loading curriculum shows a loading state");
  assert.doesNotMatch(draw(), /3 \/ 3|0\/0/, "Loading must not display temporary module or course counts");
  modules = Array.from({ length: total }, (_, i) => ({ id: `live-${i}`, title: { en: "Live module", ar: "وحدة" }, lessons: i ? [] : [course.id] }));
  status = "ready";
  const firstModule = new RegExp(`1 / ${total}`);
  assert.match(draw(), firstModule, `${track} without published courses starts at module 1`);
  lessons = [course];
  assert.match(draw(), firstModule, "Loaded curriculum opens the recommended module");
  status = "loading";
  assert.match(draw(), firstModule, "Background refresh keeps the existing journey visible");
}
console.log("Dashboard: loading, empty-track module 1, live curriculum and background refresh passed for all tracks in EN/AR.");
