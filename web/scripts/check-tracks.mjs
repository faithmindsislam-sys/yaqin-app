// Exercise the chooser's real click handlers without a browser or live account writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

let session;
let introSeen = false;
const actions = [];
const router = { push: (url) => actions.push(["push", url]), replace: (url) => actions.push(["replace", url]) };
const component = { exports: {} };
const source = readFileSync(new URL("../src/features/onboarding/TrackChooser.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
vm.runInNewContext(compiled, { module: component, exports: component.exports, require: (name) => {
  if (name === "react/jsx-runtime") return jsx;
  if (name === "react") return { useEffect: (effect) => effect() };
  if (name === "@/lib/routes") return { currentSignInPath: () => "/signin/" };
  if (name === "@/lib/navigation") return { useRouter: () => router };
  if (name === "@/features/auth/SessionProvider") return { useSession: () => session };
  if (name === "@/lib/i18n") return { useI18n: () => ({ t: (value) => value.en }) };
  if (name === "@/components/ui") return { LangToggle: () => null };
  if (name === "@/features/courses/track-meta") return { TRACK_META: Object.fromEntries(
    ["explore", "first-steps", "deepen"].map((id) => [id, { icon: () => null }])) };
  if (name === "@/features/onboarding/explore-intro") return { useExploreIntroSeen: () => introSeen };
  if (name === "@/features/courses/catalog") return { FIRST_STEPS_TITLE: { en: "First Steps as a Muslim", ar: "خطواتي الأولى كمسلم" } };
  if (name === "@/components/Logo" || name === "lucide-react") return {};
  throw new Error(`Unexpected module ${name}`);
} });

function buttons(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}
const makeSession = (patch = {}) => ({ ready: true, user: { id: "learner" }, prefs: { onboarded: false },
  setPrefs: (prefs) => actions.push(["prefs", { ...prefs }]), ...patch });
const { TrackChooser } = component.exports;
session = makeSession();
const cards = buttons(TrackChooser({}));
assert.equal(cards.length, 3);
for (const [index, track] of ["explore", "first-steps", "deepen"].entries()) {
  actions.length = 0;
  cards[index].props.onClick();
  assert.deepEqual(actions, track === "explore" ? [["push", "/start/explore/"]]
    : [["prefs", { track, onboarded: true }], ["push", "/learn/"]]);
}
// The Explore introduction is shown once; afterwards the card switches track like the others.
introSeen = true;
actions.length = 0;
buttons(TrackChooser({}))[0].props.onClick();
assert.deepEqual(actions, [["prefs", { track: "explore", onboarded: true }], ["push", "/learn/"]]);
introSeen = false;
// The landing page's entry sends learners who already have a track to their dashboard.
session = makeSession({ prefs: { onboarded: true } });
actions.length = 0;
assert.equal(buttons(TrackChooser({ firstVisit: true })).length, 0);
assert.deepEqual(actions, [["replace", "/learn/"]]);
actions.length = 0;
assert.equal(buttons(TrackChooser({})).length, 3, "The in-app chooser stays open for changing track");
assert.deepEqual(actions, []);
session = makeSession({ user: null });
actions.length = 0;
assert.equal(buttons(TrackChooser({})).length, 0);
assert.deepEqual(actions, [["replace", "/signin/"]]);
session = makeSession({ ready: false });
actions.length = 0;
assert.equal(buttons(TrackChooser({})).length, 0);
assert.deepEqual(actions, []);
console.log("All three tracks, signed-in selection, loading and sign-in guard passed.");
