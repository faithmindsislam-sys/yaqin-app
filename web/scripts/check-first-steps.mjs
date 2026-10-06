import assert from "node:assert/strict";
import * as jsx from "react/jsx-runtime";
import { loadSource } from "./load-source.mjs";

const { PRACTICE_STAGES, FIRST_STEPS, DAILY_PRAYERS, dailyPrayerSteps, firstStepsHref } = loadSource(new URL("../src/features/first-steps/data.ts", import.meta.url));
assert.deepEqual(Array.from(PRACTICE_STAGES, s => s.id), ["foundations", "purification", "prayer", "recitation", "everyday-life", "community"]);
const ids = [];
for (const stage of PRACTICE_STAGES) {
  assert.equal(new URL(firstStepsHref(stage.id), "https://local.test").searchParams.get("step"), stage.id);
  for (const activity of stage.activities) {
    assert(!ids.includes(activity.id)); ids.push(activity.id);
    assert(activity.sources.length, `${activity.id} requires sources`);
    if (activity.kind === "walkthrough") assert(activity.steps.length >= 6);
    for (const source of activity.sources) assert(source.id && source.title.en && source.title.ar && source.url);
  }
}
function bilingual(value) {
  if (!value || typeof value !== "object") return;
  if ("en" in value || "ar" in value) assert(value.en?.trim() && value.ar?.trim());
  else for (const child of Object.values(value)) bilingual(child);
}
bilingual(PRACTICE_STAGES); bilingual(FIRST_STEPS); bilingual(DAILY_PRAYERS);
assert.deepEqual(Array.from(DAILY_PRAYERS, p => [p.id, p.rakahs]), [["fajr", 2], ["dhuhr", 4], ["asr", 4], ["maghrib", 3], ["isha", 4]]);
for (const prayer of DAILY_PRAYERS) {
  const steps = dailyPrayerSteps(prayer);
  bilingual(steps);
  const phases = [...new Set(Array.from(steps, s => s.phase.en))];
  assert.deepEqual(phases, ["Prepare", "Rak’ah 1", "Rak’ah 2", ...(prayer.rakahs > 2 ? ["First sitting", "Rak’ah 3"] : []), ...(prayer.rakahs === 4 ? ["Rak’ah 4"] : []), "Final sitting", "Finish"]);
  assert.equal(steps.filter(s => s.title.en === "Second prostration").length, prayer.rakahs);
  assert.equal(steps.at(-1).title.en, "Finish with the greeting · Tasleem");
}
assert.equal(PRACTICE_STAGES[5].activities[0].kind, "community");

let track = "first-steps";
const { AppShell } = loadSource(new URL("../src/components/AppShell.tsx", import.meta.url), {
  "react/jsx-runtime": jsx,
  react: { useEffect: () => {}, useState: value => [value, () => {}], useSyncExternalStore: (_subscribe, _get, server) => server() },
  "next/link": { default: "a" },
  "next/navigation": { usePathname: () => "/first-steps/", useRouter: () => ({ replace() {} }) },
  "lucide-react": new Proxy({}, { get: (_, key) => key }),
  "@/lib/i18n": { useI18n: () => ({ t: x => x?.en }) },
  "@/features/auth/SessionProvider": { displayName: () => "Learner", useSession: () => ({ ready: true, user: { id: "fixture" }, role: "learner", prefs: { track } }) },
  "@/features/courses/ContentProvider": { useContent: () => ({ getTrack: () => undefined }) },
  "@/components/Logo": { Logo: "logo" },
  "@/components/Scenery": { Skyline: "skyline" },
  "@/components/ui": { Avatar: "avatar", LangToggle: "lang" },
  "@/features/courses/track-meta": { TRACK_META: {} },
});
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
for (const journey of ["first-steps", "explore", "deepen", null]) {
  track = journey;
  const links = nodes(AppShell({ children: "content" })).filter(n => n.type === "a").map(n => n.props.href);
  assert.equal(links.includes("/first-steps/"), journey === "first-steps");
  assert.equal(links.includes("/compare/"), journey === "explore" || journey === null);
  assert.equal(links.includes("/worship/"), journey === "deepen");
  assert(links.includes("/library/") && links.includes("/quran/"), "Courses and Quran stay available in every journey");
}
console.log("PASS first steps: six bilingual stages, sourced activities, five prayer sequences, optional community advice and journey-specific desktop/mobile navigation.");
