import { loadSource } from "./load-source.mjs";
// Exercise the visible introduction and its real UI handlers without live services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}, globals = {}) {
  return loadSource(new URL(path, import.meta.url), imports, globals);
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const schema = load("../src/features/onboarding/content.ts");
const { INTRODUCTION } = schema;
const coursesModule = load("../src/features/courses/catalog.ts", { "@/lib/course-catalog.json": { default: JSON.parse(readFileSync(new URL("../src/lib/course-catalog.json", import.meta.url), "utf8")) } });
const content = JSON.parse(readFileSync(new URL("../public/data/content.json", import.meta.url), "utf8"));
for (const reference of INTRODUCTION.references) {
  if (reference.sourceId) assert.ok(content.sources[reference.sourceId]?.url, "Stored intro reference must exist");
  assert.ok(reference.url.ar.startsWith("https://") && reference.url.en.startsWith("https://"));
}
assert.equal(INTRODUCTION.pillars.items.length, 5);
assert.deepEqual(plain(schema.ESSENTIALS.map((card) => card.id)), ["tawhid", "islam", "iman", "akhlaq"]);
for (const card of schema.ESSENTIALS) {
  assert.ok(card.items.length > 0 && card.items.every((item) => item.title.ar && item.title.en && item.body.ar && item.body.en));
  assert.ok(card.references.length > 0 && card.references.every((reference) => reference.url.ar.startsWith("https://") && reference.url.en.startsWith("https://")));
}
const session = { pushed: [], prefs: null, user: { id: "learner" }, ready: true };
let introSeen = false;
let contentAvailable = true;
let lang = "en";
const { default: Page } = load("../src/app/start/explore/page.tsx", {
  "react/jsx-runtime": jsx,
  react: { useEffect: () => {}, useRef: () => ({ current: null }) },
  "next/navigation": { useRouter: () => ({ push: (url) => session.pushed.push(url), replace: (url) => session.pushed.push(url) }) },
  "@/features/auth/SessionProvider": { useSession: () => ({ ready: session.ready, user: session.user, prefs: { known: [] }, setPrefs: (prefs) => { session.prefs = prefs; } }) },
  "@/features/onboarding/explore-intro": { useExploreIntroSeen: () => introSeen },
  "lucide-react": {}, "@/components/Logo": {}, "@/components/ui": {},
  "@/features/courses/ContentProvider": { useContent: () => ({ sources: content.sources, trackLessons: (id) => contentAvailable ? coursesModule.coursesInTrack(id, content.tracks, content.courses) : [] }) },
  "@/lib/i18n": { useI18n: () => ({ lang, t: (label) => label?.[lang] ?? "" }) },
  "@/features/onboarding/content": schema,
});
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
const controls = () => nodes(Page());
const button = (text) => controls().find((node) => node.type === "button" && [].concat(node.props.children).includes(text));
assert.equal(controls().filter((node) => node.type === "dialog").length, 4);
assert.equal(controls().filter((node) => node.type === "input").length, 0);
const introNodes = controls();
const testimonyCard = introNodes.find((node) => node.props?.["aria-labelledby"] === "shahada-title");
assert.ok(nodes(introNodes.find((node) => node.type === "dialog" && node.props.id === "essential-tawhid")).includes(testimonyCard), "Testimonies belong inside the Oneness of Allah dialog");
for (const dialog of introNodes.filter((node) => node.type === "dialog" && node.props.id !== "essential-tawhid")) {
  assert.ok(!nodes(dialog).includes(testimonyCard));
}
assert.equal(button("Personalized journey"), undefined, "Personalization is deferred");
assert.ok(button("Start with the basics").props.className.includes("btn-primary"));
const previews = introNodes.filter((node) => node.props?.["aria-haspopup"] === "dialog");
assert.equal(previews.length, 4);
assert.ok(introNodes.findIndex((node) => node.type === "button" && [].concat(node.props.children).includes("Start with the basics")) > introNodes.indexOf(previews.at(-1)), "Learning follows the optional previews");
for (const dialog of introNodes.filter((node) => node.type === "dialog")) {
  assert.ok(dialog.props["aria-labelledby"] && dialog.props["aria-describedby"]);
  assert.ok(nodes(dialog).some((node) => node.type === "button" && node.props.autoFocus && node.props["aria-label"] === "Close preview"));
}
button("Start with the basics").props.onClick();
assert.deepEqual(session.pushed, ["/learn/"], "First-time visitors see their learning plan before starting a lesson");
assert.deepEqual(plain(session.prefs), { track: "explore", onboarded: true });
assert.ok(session.user);
assert.equal(controls().find((node) => node.props?.id === "basics-title").props.children, "Start learning and discovering Islam", "Welcome learners to the whole journey");
assert.equal(button("Start with the basics").props["aria-describedby"], "basics-title basics-description");
// Shown once: a learner who already started Explore is sent on and never sees "Continue learning".
introSeen = true;
assert.equal(controls().filter((node) => node.type === "button").length, 0, "Returning Explore learners skip the introduction");
introSeen = false;
lang = "ar";
assert.equal(controls().find((node) => node.props?.id === "basics-title").props.children, "ابدأ التعلّم واكتشاف الإسلام");
button("ابدأ بالأساسيات").props.onClick();
assert.equal(session.pushed.at(-1), "/learn/", "Arabic first-time visitors also see their learning plan");
lang = "en";
contentAvailable = false;
assert.equal(controls().find((node) => node.props?.id === "basics-title").props.children, "Start learning and discovering Islam", "The welcome stays visible without course metadata");
button("Start with the basics").props.onClick();
assert.equal(session.pushed.at(-1), "/library/?track=explore", "Missing lessons lead to the browsable library");
console.log("Onboarding: beginner welcome and first-time dashboard in EN/AR, shown-once guard, four accessible previews, empty-content fallback, signed-out/loading guards, and no questionnaire entry passed.");

session.user = null;
assert.equal(controls().filter((node) => node.type === "button").length, 0, "Signed-out users cannot enter onboarding");
session.user = { id: "learner" }; session.ready = false;
assert.equal(controls().filter((node) => node.type === "button").length, 0, "Onboarding waits for session loading");
