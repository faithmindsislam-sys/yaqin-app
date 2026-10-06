import { loadSource } from "./load-source.mjs";
// Focused checks using the actual catalogue and progress code, without a browser or credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}, globals = {}) {
  const api = imports["@/lib/api"];
  const resolved = api ? { ...imports, ...Object.fromEntries(["@/lib/http", "@/features/courses/api", "@/features/ask/api", "@/features/studio/api", "@/features/studio/users/api", "@/features/studio/curriculum/api", "@/features/studio/knowledge-base/api"].map((name) => [name, api])) } : imports;
  return loadSource(new URL(path, import.meta.url), resolved, globals);
}
const catalog = {
  levels: JSON.parse(readFileSync(new URL("../../content/levels.json", import.meta.url))),
  subjects: JSON.parse(readFileSync(new URL("../../content/subjects.json", import.meta.url))),
  migration: JSON.parse(readFileSync(new URL("../../content/course-migration.json", import.meta.url))),
};
const c = load("../src/features/courses/catalog.ts", { "@/lib/course-catalog.json": { default: catalog } });
const states = new Map();
const p = load("../src/features/learning/progress.ts", { react: {}, "@/lib/supabase": { supabase: () => null }, "@/lib/store": {
  readStored: (key) => states.get(key) ?? null, writeStored: (key, value) => value === null ? states.delete(key) : states.set(key, value),
} });
const track = (id, order) => ({ id, title: { en: id, ar: id }, modules: [{ id: "journey", lessons: order }] });
const tracks = [track("explore", ["other", "shared", "shared"]), track("first-steps", ["shared", "other"]), track("deepen", ["shared"])];
const courses = {
  shared: { id: "shared", subject: "fiqh", tracks: ["first-steps", "deepen"], level: 4, status: "published" },
  other: { id: "other", subject: "quran", tracks: ["explore", "first-steps"], level: 1, status: "published" },
  draft: { id: "draft", subject: "fiqh", tracks: ["deepen"], status: "draft" },
};
assert.equal(c.allCourses(courses).length, 2, "All courses must not multiply by track membership");
assert.deepEqual(Array.from(c.coursesInTrack("first-steps", tracks, courses), (c) => c.id), ["shared", "other"], "Difficulty and subject must not change journey order");
assert.deepEqual(Array.from(c.coursesInTrack("explore", tracks, courses), (c) => c.id), ["other"], "Stale ordering references must not confer membership");
const old = { id: "wudu-order", track: "first-steps", module: "purification", tags: ["old"], level: "deeper", cards: [{ id: "stable-page", body: { ar: "unchanged" }, sources: ["stable-source"] }], quiz: [{ id: "stable-question" }] };
const migrated = c.normalizeCourse(old, [track("deepen", ["wudu-order"])]);
assert.equal(migrated.id, old.id);
assert.equal(migrated.level, "deeper");
assert.equal(migrated.cards, old.cards);
assert.equal(migrated.quiz, old.quiz);
assert.equal(migrated.subject, "fiqh");
assert.deepEqual(Array.from(migrated.tracks), ["first-steps"]);
assert.equal("tags" in migrated || "track" in migrated || "module" in migrated, false);
assert.deepEqual(c.normalizeCourse(migrated, tracks), migrated, "Migration is idempotent");
const oldBundle = c.normalizeBundle({ tracks, lessons: { [old.id]: old }, sources: {} });
assert.equal(oldBundle.courses[old.id].id, old.id);
assert.equal(oldBundle.tracks.find((track) => track.id === "first-steps").title.en, "First Steps as a Muslim");
assert.equal(oldBundle.tracks.find((track) => track.id === "first-steps").title.ar, "خطواتي الأولى كمسلم");
assert.equal(oldBundle.tracks[1].modules, tracks[1].modules, "Renaming the track preserves module content and progress IDs");
assert.equal(oldBundle.tracks[0], tracks[0], "Other tracks keep their labels");

p.updateLesson("shared", { card: 2, quizScore: 1, completedAt: "2026-10-04T10:00:00Z", cardsDone: true });
p.saveNote("shared", "Keep across tracks");
const before = states.get("yaqin.progress");
for (const tid of ["first-steps", "deepen", "first-steps"]) {
  const done = JSON.parse(states.get("yaqin.progress")).lessons;
  const list = c.coursesInTrack(tid, tracks, courses);
  assert.equal(list.filter((course) => done[course.id]?.completedAt).length, 1, "Shared completion counts in every relevant track");
  assert.equal(p.nextLesson(list, [], done)?.id, tid === "first-steps" ? "other" : "shared");
  assert.equal(states.get("yaqin.progress"), before, "Switching tracks never resets progress, quiz scores or notes");
}
console.log("Course migration, preserved IDs/content/levels, duplicate-free listings, independent ordering, shared progress and recommendations passed.");

const snapshot = c.normalizeBundle(JSON.parse(readFileSync(new URL("../public/data/content.json", import.meta.url))));
for (const track of snapshot.tracks) {
  assert.equal(track.modules.length, 3, "Every default track has three modules");
  assert(track.modules.every((module) => module.goal.en && module.goal.ar));
  const ordered = track.modules.flatMap((module) => module.lessons);
  assert.equal(new Set(ordered).size, ordered.length);
  for (const course of c.coursesInTrack(track.id, snapshot.tracks, snapshot.courses)) {
    assert(ordered.includes(course.id), "Each track member has a journey module");
  }
}
const fiqh = snapshot.subjects.find((s) => s.id === "fiqh");
assert.equal(c.subjectTitle(fiqh, "explore").en, "Worship and Practice");
assert.equal(c.subjectTitle(fiqh, "deepen").en, fiqh.title.en);
assert.equal(c.subjectTitle({ ...fiqh, title: { en: "Custom", ar: "خاص" } }, "explore").en, "Custom", "Admin titles remain authoritative");
console.log("Three guided journeys, bilingual module goals, subject labels and independent difficulty passed.");

// Exercise the actual player: legacy explain-back metadata never adds a phase or blocks completion.
const S = load("../src/lib/strings.ts").S;
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
const label = (node) => Array.isArray(node) ? node.map(label).join("") : node && typeof node === "object" ? label(node.props?.children) : String(node ?? "");

// Ordinary page citations are text; Quran quotes still use the stored-verse picker.
for (const lang of ["en", "ar"]) {
  const t = (value) => value?.[lang] ?? "";
  let adding = null, page = 0;
  let lesson = { title: { en: "Course", ar: "دورة" }, summary: { en: "Summary", ar: "ملخص" },
    cards: [{ id: "page", kind: "concept", title: { en: "Page", ar: "صفحة" }, body: { en: "Text", ar: "نص" }, sources: ["book"] }] };
  const picks = [];
  const { CourseContent } = load("../src/features/studio/course-editor/CourseContent.tsx", {
    "react/jsx-runtime": jsx, react: { useState: () => [adding, (next) => { adding = next; }] },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/features/courses/content": { SourceQuote: () => null },
    "@/features/learning/CardView": { CardView: () => null },
    "@/features/studio/course-editor/RichText": { RichText: () => null },
    "@/features/courses/ContentProvider": { useContent: () => ({ sources: { book: { ref_en: "Existing book", ref_ar: "كتاب سابق" } } }) },
    "@/lib/i18n": { useI18n: () => ({ t, lang }) },
  }, { crypto, FormData: class { constructor(form) { this.value = form.value; } get() { return this.value; } } });
  const draw = () => nodes(CourseContent({ lesson, writing: lang, locked: false, preview: false, page,
    setPage: (next) => { page = next; }, edit: (update) => { lesson = update(lesson); }, change() {},
    changeCard: (id, update) => { lesson = { ...lesson, cards: lesson.cards.map((card) => card.id === id ? update(card) : card) }; },
    setPicker: (id) => picks.push(id),
  }));
  const press = (name) => draw().find((node) => node.type === "button" && (node.props["aria-label"] === name || label(node) === name)).props.onClick();
  const reference = lang === "ar" ? "كتاب عن الإسلام، ص. ١٠" : "Discover Islam, p. 10";
  const add = (value) => {
    press(t(S.editor.addSource));
    draw().find((node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { value } });
  };
  add("   ");
  assert.equal(lesson.cards[0].references, undefined, "Whitespace is not a citation");
  press(t(S.curriculum.cancel));
  add(`  ${reference}  `);
  add(reference);
  assert.deepEqual(Array.from(lesson.cards[0].references), [reference], "Citations are trimmed and deduplicated");
  assert.deepEqual(lesson.cards[0].sources, ["book"], "Existing stored sources are preserved");
  assert.equal(picks.length, 0, "Adding text never opens the verse picker");
  const { payload } = load("../src/features/studio/course-editor/model.ts");
  assert.equal(payload({ ...lesson, id: "course", tracks: ["explore"] }).cards[0].references[0], reference);
  press(`${t(S.editor.remove)} ${reference}`);
  assert.equal(lesson.cards[0].references.length, 0);
  press(t(S.editor.addQuote));
  assert.equal(picks[0], lesson.cards[1].id, "Quran quotes still open the verse picker");
}
console.log("English/Arabic source text entry, trimming, deduplication, removal, save payload and Quran quote picker passed.");

for (const lang of ["en", "ar"]) for (const hasQuiz of [true, false]) for (const context of [
  { url: "explore", pref: "deepen", membership: ["explore", "deepen"], expected: "explore" },
  { url: null, pref: "first-steps", membership: ["deepen"], expected: "first-steps" },
  { url: null, pref: null, membership: ["deepen"], expected: null },
  { url: "invalid", pref: "invalid", membership: ["deepen"], expected: null },
  { url: "invalid", pref: "deepen", membership: ["explore"], expected: "deepen" },
]) {
  const t = (value) => value?.[lang] ?? "";
  const lesson = { id: "legacy", title: { en: "Course", ar: "دورة" }, level: 1, subject: "islam", tracks: context.membership,
    cards: [{ id: "one" }, { id: "two" }], quiz: hasQuiz ? [{ id: "question" }] : [],
    explain_back: { prompt: { en: "Removed", ar: "محذوف" }, key_ideas: [{ id: "legacy-idea" }] } };
  let states = [], cursor = 0, step = null;
  let saved = { card: 0, cardsDone: false, explained: false, quizScore: null, completedAt: null };
  const imports = {
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    react: { Suspense: ({ children }) => children, useState: (initial) => {
      const i = cursor++;
      if (i === states.length) states.push(typeof initial === "function" ? initial() : initial);
      return [states[i], (next) => { states[i] = next; }];
    } },
    "next/navigation": { useRouter: () => ({ push() {} }), useSearchParams: () => ({ get: (key) => key === "step" ? step : key === "id" ? lesson.id : key === "track" ? context.url : null }) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/features/learning/CardView": { CardView: ({ card }) => jsx.jsx("card-view", { id: card.id }) },
    "@/features/learning/Quiz": { Quiz: (props) => jsx.jsx("quiz", { ...props }) },
    "@/features/courses/ContentProvider": { useContent: () => ({ getLesson: () => lesson, getTrack: () => null, subjects: [], levels: [], nextLessonAfter: () => [{ id: "next", title: { en: "Next", ar: "التالي" } }] }) },
    "@/features/courses/catalog": { subjectTitle: () => ({}) }, "@/lib/types": load("../src/lib/types.ts"),
    "@/lib/strings": { S }, "@/lib/i18n": { useI18n: () => ({ t, lang }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ prefs: { track: context.pref } }) },
    "@/features/learning/progress": { useProgress: () => ({ lessons: {} }), useLessonProgress: () => [saved, (patch) => { saved = { ...saved, ...patch }; }] },
  };
  imports["@/features/learning/SidePanel"] = load("../src/features/learning/SidePanel.tsx", {
    ...imports, "@/lib/api": {}, "@/features/ask/Answer": {}, "@/features/ask/Answer": { AnswerView: () => null },
  });
  // Keep the real checklist; companion and notes do not affect course navigation.
  let companion;
  imports["@/features/learning/SidePanel"].Companion = function Companion(props) { companion = props; return null; };
  imports["@/features/learning/SidePanel"].Notes = function Notes() { return null; };
  const Player = load("../src/app/course/page.tsx", imports, { window: { scrollTo() {} } }).default;
  const draw = () => { cursor = 0; return nodes(Player()); };
  const press = (name) => draw().find((node) => node.type === "button" && label(node).includes(name)).props.onClick();
  assert.equal(draw().filter((node) => node.type === "li").length, hasQuiz ? 3 : 2);
  assert.equal(companion.audience, context.expected, "Teaching audience follows explicit URL/preference, never course membership");
  // Exercise the real Companion submit handler using the player's supplied props.
  let askBody;
  let companionState = [], companionCursor = 0;
  const RealCompanion = load("../src/features/learning/SidePanel.tsx", {
    ...imports,
    react: { useEffect() {}, useRef: (value) => ({ current: value }), useState: (initial) => {
      const i = companionCursor++;
      if (i === companionState.length) companionState.push(initial);
      return [companionState[i], (next) => { companionState[i] = next; }];
    } },
    "@/features/ask/api": { ask: async (body) => { askBody = body; return {}; } },
    "@/features/ask/Answer": { AnswerView: () => null },
  }, { AbortController }).Companion;
  const drawCompanion = () => { companionCursor = 0; return nodes(RealCompanion(companion)); };
  drawCompanion().find((node) => node.type === "textarea").props.onChange({ target: { value: "Controlled evaluation question" } });
  await drawCompanion().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(askBody.track, context.expected);
  assert.equal(askBody.lang, lang);
  assert.equal(askBody.lesson_id, "legacy");
  assert.equal(askBody.card_id, "one", "The companion uses the player's actual current page");
  assert.equal(askBody.history.length, 0);
  assert(draw().some((node) => node.type === "span" && label(node) === `${t(S.lesson.page)} 1 ${t(S.lesson.of)} 2`));
  press(t(S.lesson.continue));
  press(t(hasQuiz ? S.lesson.startQuiz : S.lesson.continue));
  assert.equal(saved.cardsDone, true);
  if (hasQuiz) {
    assert(draw().some((node) => node.type === "quiz"), "Pages lead directly to the knowledge check");
    draw().find((node) => node.type === "quiz").props.onBack();
    assert.equal(draw().find((node) => node.type === "card-view").props.id, "two");
    press(t(S.lesson.startQuiz));
    assert(draw().some((node) => node.type === "span" && label(node) === `${t(S.lesson.question)} 1 ${t(S.lesson.of)} 1`));
    draw().find((node) => node.type === "quiz").props.onFinish(1);
    assert.equal(saved.quizScore, 1);
  }
  assert(saved.completedAt, "Completion never requires an explanation");
  assert(draw().some((node) => node.type === "h2" && label(node) === t(S.lesson.doneTitle)));
  assert.equal(draw().find((node) => node.type === "a" && node.props.href?.startsWith("/course/?id=next")).props.href,
    `/course/?id=next${context.expected ? `&track=${context.expected}` : ""}`, "Next course preserves teaching audience independently of classification");
  step = "explain";
  states = [];
  assert(draw().some((node) => node.type === (hasQuiz ? "quiz" : "card-view")), "Legacy links open a supported phase");
}
console.log("English/Arabic course flow, reduced totals/checklist, quiz back-navigation, completion without explain-back and legacy links passed.");
console.log("20 English/Arabic Companion request cases passed: URL audience, independent preference, absent/invalid non-assuming context.");

// Render the real details form and exercise its dependent dropdown handlers.
for (const lang of ["en", "ar"]) {
  const t = (value) => value?.[lang] ?? "";
  const journeys = ["explore", "first-steps", "deepen"].map((id) => ({
    id, title: { en: id, ar: id }, modules: [0, 1].map((i) => ({
      id: `${id}-${i}`, title: { en: `${id} ${i}`, ar: `${id} ${i}` },
      lessons: id === "first-steps" && i === 1 ? ["course"] : [],
    })),
  }));
  let lesson = { id: "course", tracks: ["first-steps"], audience_track: "mixed", subject: "fiqh", level: 1, minutes: 10, title: { en: "Course", ar: "دورة" }, cards: [] };
  let moduleChoices = {};
  const { CourseDetails } = load("../src/features/studio/course-editor/CourseDetails.tsx", {
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "@/components/Select": { Select: (props) => jsx.jsx("select", props) },
    "@/features/courses/ContentProvider": { useContent: () => ({ tracks: journeys, subjects: [], levels: [] }) },
    "@/lib/i18n": { useI18n: () => ({ t }) },
  });
  const draw = (direct = true) => nodes(CourseDetails({ lesson, locked: false, busy: false, direct, moduleChoices,
    change: (patch) => { lesson = { ...lesson, ...patch }; },
    chooseModule: (id, value) => { moduleChoices = { [id]: value }; },
  }));
  const field = (label, direct = true) => draw(direct).find((node) => node.type === "select" && node.props.label === t(label)).props;
  assert.equal(field(S.dash.module).value, "first-steps-1", "Opening preserves the saved module");
  assert.equal(draw().filter((node) => node.type === "select" && node.props.label === t(S.dash.module)).length, 1);
  assert.equal(draw().filter((node) => node.type === "select" && node.props.label === t(S.editor.aiAudience)).length, 0);
  assert.equal(draw().filter((node) => node.type === "input" && node.props.type === "radio").length, 0);
  for (const journey of journeys) {
    field(S.instructor.track).onChange(journey.id);
    assert.deepEqual(Array.from(lesson.tracks), [journey.id]);
    assert.equal(lesson.audience_track, journey.id);
    assert.equal(field(S.dash.module).value, `${journey.id}-0`);
    assert.deepEqual(Array.from(field(S.dash.module).options, (option) => option.value), journey.modules.map((module) => module.id));
    field(S.dash.module).onChange(`${journey.id}-1`);
    field(S.instructor.track).onChange(journey.id);
    assert.equal(field(S.dash.module).value, `${journey.id}-1`, "Selecting the same journey keeps the chosen module");
    assert.equal(field(S.dash.module, false).disabled, true);
  }
  const { payload } = load("../src/features/studio/course-editor/model.ts");
  assert.equal(payload({ ...lesson, audience_track: "mixed" }).audience_track, "deepen", "Saving keeps audience aligned with the journey");
}
console.log("English/Arabic details passed: one journey, one matching module, defaults, saved placement and aligned audience.");

// Exercise manual save/publish transitions without an automated review gate.
for (const [role, status, expected] of [
  ["admin", "draft", ["save", "submit", "approve"]],
  ["admin", "published", ["update"]],
  ["teacher", "published", ["unpublish", "save", "submit"]],
]) {
  const states = [], refs = [], calls = [];
  let stateIndex = 0, refIndex = 0;
  const lesson = { id: "manual", subject: "islam", level: 1, tracks: ["explore"], minutes: 3, status,
    title: { en: "Course", ar: "" }, summary: { en: "Summary", ar: "" },
    cards: [{ id: "page", kind: "concept", title: { en: "Page", ar: "" }, body: { en: "Content", ar: "" }, sources: [] }] };
  const { useCourseDocument: courseDocument } = load("../src/features/studio/course-editor/useCourseDocument.ts", {
    react: {
      useEffect() {},
      useRef: (initial) => refs[refIndex++] ??= { current: initial },
      useState: (initial) => {
        const index = stateIndex++;
        if (index === states.length) states.push(initial);
        return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
    },
    "@/lib/navigation": { useRouter: () => ({ push: (url) => calls.push(url) }) },
    "@/lib/http": { apiEnabled: true },
    "@/features/courses/catalog": c,
    "@/features/courses/ContentProvider": { useContent: () => ({ refresh: async () => {},
      tracks: [track("explore", [lesson.id])], subjects: [{ id: "islam", levels: [1] }] }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ role, user: { id: "author" } }) },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.en ?? "" }) },
    "@/features/studio/course-editor/drafts": { draftKey: () => "draft", keepDraft() {}, readDraft: () => null },
    "@/features/studio/api": {
      reviewCheck: () => assert.fail("Manual saves must not run the review check"),
      lessonHistory: async () => [],
      unpublishLesson: async () => { calls.push("unpublish"); },
      saveDraft: async () => { calls.push("save"); return {}; },
      updatePublished: async () => { calls.push("update"); return {}; },
      submitDraft: async () => { calls.push("submit"); },
      reviewDecision: async (_id, decision) => { calls.push(decision); },
    },
  }, { window: { confirm: () => true }, sessionStorage: { setItem() {} } });
  const draw = () => { stateIndex = 0; refIndex = 0; return courseDocument(lesson.id); };
  draw().start(lesson);
  await draw().save("publish");
  assert.deepEqual(calls, [...expected, "/studio/"], `${role} ${status} saves without a review check`);
  assert.equal(draw().lesson.status, role === "admin" ? "published" : "in_review");
}
console.log("Manual draft publication, live admin updates and teacher resubmission skip automated review checks.");
