import { loadSource } from "./load-source.mjs";
// Run actual role and API modules with fake services; no credentials or backend needed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}, globals = {}) {
  const api = imports["@/lib/api"];
  const resolved = api ? { ...imports, ...Object.fromEntries(["@/lib/http", "@/features/courses/api", "@/features/ask/api", "@/features/studio/api", "@/features/studio/users/api", "@/features/studio/curriculum/api", "@/features/studio/knowledge-base/api"].map((name) => [name, api])) } : imports;
  return loadSource(new URL(path, import.meta.url), resolved, globals);
}
const roles = load("../src/features/auth/roles.ts");
for (const [input, expected] of [["learner", "learner"], ["teacher", "teacher"], ["admin", "admin"],
  ["super_admin", "super_admin"], ["instructor", "teacher"], ["reviewer", "admin"], ["unknown", "learner"], [null, "learner"]]) {
  assert.equal(roles.normalizeRole(input), expected);
}
assert.equal(roles.isStaff("learner"), false);
assert.equal(roles.isStaff("unknown"), false);
assert.equal(roles.canReview("teacher"), false);
assert.equal(roles.canReview("admin"), true);
assert.equal(roles.canReview("super_admin"), true);

let networkCalls = 0;
const api = load("../src/features/studio/api.ts", { "@/features/courses/catalog": { normalizeCourse: (course) => course },
  "./supabase": { getAccessToken: () => { throw new Error("Auth must not be requested"); } } }, {
  process: { env: { NEXT_PUBLIC_API_ENABLED: "false" } },
  fetch: () => { networkCalls++; throw new Error("API must not be requested"); },
});
assert.equal(load("../src/lib/http.ts", { "./supabase": { getAccessToken: () => null } }, { process: { env: { NEXT_PUBLIC_API_ENABLED: "false" } } }).apiEnabled, false);
await assert.rejects(api.staffLessons(), (e) => e.status === 503 && e.code === "backend_unavailable");
assert.equal(networkCalls, 0);

// Selected audiences pass through actual API clients without relying on free-text prompts.
{
  const sent = [];
  const request = async (path, body, signal) => { sent.push({ path, body, signal }); return {}; };
  const studio = load("../src/features/studio/api.ts", { "@/lib/http": { request },
    "@/features/courses/catalog": { normalizeCourse: (course) => course } });
  const tutor = load("../src/features/ask/api.ts", { "@/lib/http": { request } });
  for (const track of ["explore", "first-steps", "deepen"]) {
    await studio.startDraft("Teach wudu", "ar", track);
    await tutor.explainBack({ course_id: "wudu-order", transcript: "face", lang: "ar", track });
    assert.equal(sent.at(-2).path, "/review/draft");
    assert.equal(sent.at(-2).body.track, track);
    assert.equal(sent.at(-1).path, "/tutor/explain-back");
    assert.equal(sent.at(-1).body.track, track);
  }
  await tutor.explainBack({ course_id: "wudu-order", transcript: "face", lang: "en" });
  assert.equal(sent.at(-1).body.track, null);
  const controller = new AbortController();
  await tutor.ask({ question: "Explain this page", lang: "ar", lesson_id: "wudu-order", card_id: "wash-face", track: "first-steps", history: [{ role: "user", content: "What is wudu?" }] }, controller.signal);
  assert.equal(sent.at(-1).path, "/tutor/ask");
  assert.equal(sent.at(-1).body.course_id, "wudu-order");
  assert.equal(sent.at(-1).body.card_id, "wash-face");
  assert.equal(sent.at(-1).body.track, "first-steps");
  assert.equal(sent.at(-1).signal, controller.signal);
  await tutor.ask({ question: "What is Islam?", lang: "en", track: "explore" });
  assert.equal(sent.at(-1).body.card_id, null);
  assert.equal(sent.at(-1).body.course_id, null);
}

// Conversation history is bounded and does not serialize source HTML or quotes.
{
  const { chatHistory } = load("../src/features/ask/history.ts");
  const messages = Array.from({ length: 5 }, (_, index) => [
    { role: "user", text: `Question ${index} ` + "q".repeat(1800) },
    { role: "assistant", data: { answer: [{ type: "text", text: "a".repeat(5000) }, { type: "source", id: "quran:1:1" }] } },
  ]).flat();
  const history = chatHistory([...messages, { role: "error" }]);
  assert.equal(history.length, 6);
  assert.equal(history[0].content.startsWith("Question 2"), true);
  assert.equal(history[0].content.length, 1500);
  assert.equal(history[1].content.length, 4000);
  assert.equal(JSON.stringify(history).includes("quran:1:1"), false);
}

// Drive the real ContentProvider's refresh callback and inspect its resulting state.
async function contentScenario({ enabled, savedFails = false, liveFails = false, savedData,
  pathname = "/learn/", refreshes = 1, liveFailsAfterFirst = false, signedIn = true }) {
  const saved = { tracks: [{ id: "saved" }], courses: {}, sources: {} };
  const live = { tracks: [{ id: "live" }], courses: {}, sources: {} };
  const states = [];
  let stateIndex = 0;
  let liveCalls = 0;
  let refresh;
  const { ContentProvider } = load("../src/features/courses/ContentProvider.tsx", {
    "react/jsx-runtime": jsx,
    "next/navigation": { usePathname: () => pathname },
    react: {
      createContext: () => ({ Provider: "provider" }), useContext: () => {}, useRef: (value) => ({ current: value }),
      useState: (initial) => {
        const i = stateIndex++;
        if (i === states.length) states.push(initial);
        return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
      },
      useCallback: (fn) => { refresh = fn; return fn; }, useEffect: () => {}, useMemo: (fn) => fn(),
    },
    "@/features/courses/catalog": { normalizeBundle: (data) => data },
    "@/features/auth/SessionProvider": { useSession: () => ({ user: signedIn ? { id: "learner" } : null }) },
    "@/lib/api": { apiEnabled: enabled, contentBundle: async () => {
      liveCalls++;
      if (liveFails || (liveFailsAfterFirst && liveCalls > 1)) throw new Error("API unavailable");
      return live;
    } },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.en ?? "" }) },
  }, {
    fetch: async (url) => { assert.equal(url, "/data/content.json"); return {
      ok: !savedFails, status: savedFails ? 404 : 200, json: async () => savedData === undefined ? saved : savedData,
    }; },
  });
  const render = () => { stateIndex = 0; return ContentProvider({ children: "content" }); };
  const initialRender = render();
  for (let i = 0; i < refreshes; i++) await refresh();
  return { states, liveCalls, initialRender, rendered: render() };
}
const signedOut = await contentScenario({ enabled: true, signedIn: false });
assert.equal(signedOut.liveCalls, 0, "Signed-out pages must not request authenticated content");
const cdn = await contentScenario({ enabled: false });
assert.equal(cdn.states[0].tracks[0].id, "saved");
assert.equal(cdn.states[1], false);
assert.equal(cdn.liveCalls, 0);
const outage = await contentScenario({ enabled: true, liveFails: true });
assert.equal(outage.states[0].tracks[0].id, "saved");
assert.equal(outage.states[1], true);
const recovered = await contentScenario({ enabled: true, savedFails: true });
assert.equal(recovered.states[0].tracks[0].id, "live");
assert.equal(recovered.states[1], false);
for (const pathname of ["/signin", "/signin/", "/auth/callback/", "/reset-password/"]) {
  const login = await contentScenario({ enabled: false, savedFails: true, pathname });
  assert.ok(login.initialRender.props.children.includes("content"), "Auth must render while content is loading");
  assert.ok(login.rendered.props.children.includes("content"), "Content outages must not block auth pages");
}
const cachedLive = await contentScenario({ enabled: true, refreshes: 2, liveFailsAfterFirst: true });
assert.equal(cachedLive.states[0].tracks[0].id, "live", "A later API outage must retain the last live lessons");
for (const savedData of [null, { tracks: null, lessons: {}, sources: {} }]) {
  const invalid = await contentScenario({ enabled: false, savedData });
  assert.equal(invalid.states[0].tracks.length, 0);
  assert.equal(invalid.states[1], true);
  const rescued = await contentScenario({ enabled: true, savedData });
  assert.equal(rescued.states[0].tracks[0].id, "live");
  assert.equal(rescued.states[1], false);
}
console.log("Auth: roles, approval permissions, CDN-only requests, auth pages during outages, snapshot validation and retained live lessons passed.");

// Render the real Studio routes and both shared-shell navs for each account role.
const strings = load("../src/lib/strings.ts").S;
const knowledgeStrings = load("../src/features/studio/knowledge-base/strings.ts").K;
const hooks = { useSyncExternalStore: (_subscribe, _get, server) => server(), useEffect: () => {}, useCallback: (fn) => fn, useRef: (initial = null) => ({ current: initial }),
  useState: (initial) => [initial, () => {}] };
const selectImport = { Select: ({ label, value, options, onChange, name, disabled }) => jsx.jsx("select", {
  "aria-label": label, value, name, disabled, onChange: (event) => onChange(event.target.value),
  children: options.map((option) => jsx.jsx("option", { value: option.value, children: option.label }, option.value)),
}) };
const content = { getTrack: () => undefined, allLessons: () => [], tracks: [], subjects: [], levels: [], sources: {}, refresh: async () => {} };
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
for (const lang of ["en", "ar"]) {
  const t = (value) => value[lang];
  for (const role of ["learner", "teacher", "admin", "super_admin", "guest"]) {
    const session = { ready: true, user: role === "guest" ? null : { id: "test" }, guest: role === "guest",
      role: role === "guest" ? "learner" : role, prefs: {}, signOut: async () => {} };
    const imports = {
      "react/jsx-runtime": jsx, react: hooks, "lucide-react": new Proxy({}, { get: () => () => null }),
      "next/link": { default: "a" },
      "@/lib/i18n": { useI18n: () => ({ t, lang }) },
      "@/features/auth/SessionProvider": { useSession: () => session, displayName: () => "Test" },
      "@/features/courses/ContentProvider": { useContent: () => content }, "@/lib/strings": { S: strings }, "@/features/auth/roles": roles,
      "@/features/studio/knowledge-base/strings": { K: knowledgeStrings },
      "@/features/studio/knowledge-base/model": load("../src/features/studio/knowledge-base/model.ts"),
      "@/features/studio/knowledge-base/AddResource": { AddResource: () => null },
      "@/features/learning/CardView": { CardView: () => null }, "@/features/studio/course-editor/LessonHistory": { LessonHistory: () => null },
      "@/lib/types": load("../src/lib/types.ts"),
      "@/features/courses/catalog": { COURSE_IMAGES_ENABLED: false },
      "@/components/Logo": { Logo: () => null }, "@/components/ui": { Avatar: () => null, LangToggle: () => null },
      "@/features/learning/LearnStats": { LearnStats: () => null }, "@/features/courses/track-meta": { TRACK_META: {} },
      "@/features/courses/content": { SourceQuote: () => jsx.jsx("blockquote", { children: "Preview" }), CardBody: () => null, TRACK_META: {} },
      "@/components/Select": selectImport, "@/features/studio/ComingSoonChip": { ComingSoonChip: () => null },
      "@/components/AppShell": { AppShell: ({ children }) => children }, "@/lib/api": { apiEnabled: true },
    };
    for (const pathname of ["/studio/", "/studio/sources/", "/studio/users/", "/studio/knowledge-base/", "/learn/"]) {
      const redirects = [];
      const { AppShell } = load("../src/components/AppShell.tsx", { ...imports,
        react: { ...hooks, useEffect: (effect) => effect() },
        "next/navigation": { usePathname: () => pathname, useRouter: () => ({ replace: (url) => redirects.push(url) }) } });
      const rendered = elements(AppShell({ children: "private content" }));
      const navs = rendered.filter((node) => node.type === "nav");
      if (!session.user) {
        assert.deepEqual(redirects, ["/signin/"]);
        assert.equal(navs.length, 0);
        assert.ok(!rendered.some((node) => node.props?.children === "private content"), "Old guest state cannot grant access");
      } else {
        assert.equal(navs.length, 2);
        assert.deepEqual(redirects, []);
      }
      const expected = pathname.startsWith("/studio")
        ? ["/studio/", ...(roles.canReview(session.role) ? ["/studio/curriculum/"] : []), ...(role === "super_admin" ? ["/studio/users/"] : []), ...(roles.canReview(session.role) ? ["/studio/knowledge-base/"] : []), "/learn/"]
        : ["/learn/", "/library/", "/quran/", "/compare/", "/ask/", "/shahada/", ...(roles.isStaff(session.role) ? ["/studio/"] : [])];
      for (const nav of navs) {
        const links = elements(nav).filter((node) => node.type === "a");
        assert.deepEqual(Array.from(links, (node) => node.props.href), expected);
        assert.deepEqual(Array.from(links.filter((node) => node.props["aria-current"] === "page"), (node) => node.props.href),
          expected.includes(pathname) ? [pathname] : []);
      }
      if (!pathname.startsWith("/studio")) continue;
      const route = pathname === "/studio/" ? "page" : pathname.split("/")[2] + "/page";
      let stateIndex = 0;
      const sourcePreview = pathname === "/studio/sources/";
      const Page = load(`../src/app/studio/${route}.tsx`, { ...imports, react: { ...hooks,
        useState: (initial) => {
          const i = stateIndex++;
          return [sourcePreview && i === 0 ? [{ id: "source", ref_en: "Test", ref_ar: "اختبار" }]
            : sourcePreview && i === 1 ? "source" : initial, () => {}];
        },
      } }).default;
      const nodes = elements(Page());
      const restricted = !roles.isStaff(session.role) || !session.user;
      if (pathname === "/studio/knowledge-base/") {
        if (!roles.canReview(session.role) || !session.user) assert(nodes.some((node) => node.props?.children === t(knowledgeStrings.restricted)));
        else assert(nodes.some((node) => node.type === "h1" && node.props.children === t(knowledgeStrings.title)));
      }
      else if (restricted) assert(nodes.some((node) => node.props?.children === t(strings.instructor.restricted)));
      else if (pathname === "/studio/users/" && role !== "super_admin")
        assert(nodes.some((node) => node.props?.children === t(strings.users.restricted)));
      else if (pathname === "/studio/") {
        // Lessons are written in the editor page; the list only links to it.
        assert.equal(nodes.filter((node) => node.type === "textarea").length, 0);
        assert(nodes.some((node) => node.type === "a" && node.props.href === "/studio/course/"));
        assert(!nodes.some((node) => node.props?.children === t(strings.instructor.queue)));
      } else if (pathname === "/studio/sources/") {
        assert.equal(nodes.filter((node) => node.type === "textarea").length, 0);
        assert(nodes.some((node) => node.type === "blockquote"));
        assert.equal(nodes.some((node) => node.type === "button" && node.props.children === t(strings.instructor.approveSource)), roles.canReview(session.role));
      }
    }
  }
}
assert.match(readFileSync(new URL("../src/app/instructor/page.tsx", import.meta.url), "utf8"), /export \{ default \} from "\.\.\/studio\/page"/);
console.log("Studio: bilingual desktop/mobile navigation, active links, learner nav, role access, split editor and instructor alias passed.");

const textContent = (node) => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(textContent).join("")
  : typeof node === "object" ? textContent(node.props?.children) : String(node);
const button = (nodes, name) => nodes.find((node) => node.type === "button" && textContent(node) === name);
const rows = (nodes) => nodes.filter((node) => node.type === "tr" && node.key);

// Write a lesson in the editor: nothing is sent while a required part is missing, then the saved
// lesson carries formatted text, a source and the author as contributor, and Publish submits and approves it.
{
  const editorStates = [];
  let editorIndex = 0;
  const editorRefs = [];
  let editorRefIndex = 0;
  const sent = [];
  const steps = [];
  const visited = [];
  const replaced = [];
  const draftRequests = [];
  const toasts = [];
  let draftOutcome = "no_sources";
  let editorPart = null;
  const placementCalls = [];
  let placementFails = false;
  let editorCurriculum = { tracks: [{ id: "explore", title: { en: "Explore Islam" }, modules: [
    { id: "common-questions", title: { en: "Common questions" }, lessons: ["other-course"] },
    { id: "practice", title: { en: "Practice" }, lessons: [] },
  ] }], updated_at: { tracks: "revision-1" } };
  let ids = 0;
  const Editor = load("../src/app/studio/course/page.tsx", {
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ replace: (url) => replaced.push(url), push: (url) => {
      if (url.startsWith("/studio/course/?part=")) editorPart = url.split("part=")[1];
      else visited.push(url);
    } }), useSearchParams: () => ({ get: (key) => key === "part" ? editorPart : null }) },
    react: { ...hooks, Suspense: ({ children }) => children, useRef: (initial) => {
      const i = editorRefIndex++;
      return editorRefs[i] ??= { current: initial };
    }, useState: (initial) => {
      const i = editorIndex++;
      if (i === editorStates.length) editorStates.push(initial);
      return [editorStates[i], (next) => { editorStates[i] = typeof next === "function" ? next(editorStates[i]) : next; }];
    } },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Select": selectImport, "@/features/courses/content": { SourceQuote: () => null },
    "@/features/learning/CardView": { CardView: ({ card }) => ({ type: "card-view", props: { card } }) },
    "@/features/studio/course-editor/LessonHistory": { LessonHistory: () => null },
    "@/features/studio/course-editor/CourseActivities": { CourseActivities: () => null },
    "@/features/studio/course-editor/RichText": { RichText: ({ onChange }) => ({ type: "rich-text", props: { onChange } }) },
    "@/features/studio/course-editor/SourcePicker": { SourcePicker: ({ onPick }) => ({ type: "source-picker", props: { onPick } }) },
    "@/features/studio/course-editor/drafts": { draftKey: (uid, id) => `${uid}:${id}`, readDraft: () => null, keepDraft: () => {} },
    "@/lib/api": { ApiError: class extends Error {}, apiEnabled: true,
      curriculum: async () => editorCurriculum,
      saveTrackModules: async (trackId, modules, revision) => {
        if (placementFails) throw new Error("Module save unavailable");
        assert.equal(trackId, "explore");
        assert.equal(revision, editorCurriculum.updated_at.tracks);
        placementCalls.push(modules);
        editorCurriculum = { ...editorCurriculum, tracks: [{ ...editorCurriculum.tracks[0], modules }], updated_at: { tracks: "revision-2" } };
        return editorCurriculum;
      },
      startDraft: async (prompt, lang, track) => { draftRequests.push({ prompt, lang, track }); return { job_id: "draft-1" }; },
      draftJob: async (id) => {
        assert.equal(id, "draft-1");
        return draftOutcome === "no_sources"
          ? { status: "no_sources", stage: "no_sources", reason: "No approved sources match this topic" }
          : { status: "done", stage: "done", lesson_id: "generated-lesson" };
      },
      saveDraft: async (lesson) => { sent.push(lesson); return { contributors: ["Test Author"] }; },
      updatePublished: async (lesson) => {
        steps.push("update");
        sent.push(lesson);
        return { contributors: ["Test Author"], issues: [] };
      },
      submitDraft: async () => { steps.push("submit"); },
      reviewDecision: async (_id, decision) => { steps.push(decision); },
      reviewCheck: async () => { assert.fail("Manual saves must not run the review check"); },
      unpublishLesson: async () => { steps.push("unpublish"); }, lessonHistory: async () => [] },
    "@/features/auth/roles": roles, "@/lib/types": load("../src/lib/types.ts"), "@/lib/strings": { S: strings },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.en ?? "", lang: "en" }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ role: "admin", user: { id: "test" } }), displayName: () => "Test Author" },
    "@/features/courses/ContentProvider": { useContent: () => ({ refresh: async () => {}, levels: [1, 2, 3, 4].map((id) => ({ id, title: strings.library.levels[id] })), subjects: [{ id: "islam", levels: [1, 2, 3, 4], title: { en: "Islam essentials", ar: "أساسيات الإسلام" } }], sources: { "quran:5:6": { ref_en: "Al-Ma'idah 5:6", ref_ar: "المائدة: ٦" } },
      tracks: editorCurriculum.tracks }) },
  }, { Error, crypto: { randomUUID: () => `${String(++ids).padStart(8, "0")}-0000-4000-8000-000000000000` },
    sessionStorage: { setItem: (_key, text) => toasts.push(text) } }).default;
  const E = strings.editor;
  const draw = () => { editorIndex = 0; editorRefIndex = 0; return elements(Editor()); };
  const press = (name) => button(draw(), name).props.onClick();
  const type = (label, value) => draw().find((node) => node.props?.["aria-label"] === label).props.onChange({ target: { value } });
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  draw().find((node) => node.type === "button" && textContent(node).startsWith(E.ai.en)).props.onClick();
  type(E.aiTitle.en, "A lesson about wudu");
  type(E.aiAudience.en, "explore");
  draw().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert(draw().some((node) => node.props?.role === "alert" && textContent(node) === "No approved sources match this topic"));
  assert.deepEqual(draftRequests, [{ prompt: "A lesson about wudu", lang: "en", track: "explore" }]);
  assert.equal(replaced.length, 0, "An empty AI result must not navigate to a lesson");
  draftOutcome = "done";
  draw().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(replaced, ["/studio/course/?id=generated-lesson"], "A completed AI job opens its saved draft");
  assert.equal(sent.length, 0, "An AI job's saved draft must not be saved again by the browser");
  press(E.manual.en);

  press(strings.instructor.saveDraft.en);
  await settle();
  assert.equal(sent.length, 0);
  assert(draw().some((node) => node.type === "li" && textContent(node) === E.needTitle.en));
  assert(draw().some((node) => node.type === "li" && textContent(node) === E.needMinutes.en), "A new lesson starts at 0 minutes");
  assert(!draw().some((node) => node.type === "li" && textContent(node) === `${E.section.en} 1 ${E.needsSource.en}`), "Resources are optional on ordinary pages");

  type(E.titlePlaceholder.en, "The order of wudu");
  type(E.summaryPlaceholder.en, "What to wash, in order.");
  press(E.details.en);
  assert.equal(button(draw(), E.details.en).props["aria-pressed"], true);
  assert(!draw().some((node) => node.type === "rich-text"), "Details opens its own panel");
  assert(draw().some((node) => node.props?.["aria-label"] === strings.instructor.subject.en));
  assert(draw().some((node) => node.type === "input" && node.props.type === "radio" && node.props.checked));
  type(E.minutes.en, "4");
  type(`Explore Islam · ${strings.dash.module.en}`, "practice");
  assert.equal(placementCalls.length, 0, "Choosing a module waits until the course is saved");
  press(E.partCourse.en);
  assert.equal(draw().find((node) => node.props?.["aria-label"] === E.titlePlaceholder.en).props.value, "The order of wudu", "Tab switches preserve unsaved content");
  type(E.sectionTitle.en, "Start with the face");
  draw().find((node) => node.type === "rich-text").props.onChange("<p>Wash the <b>face</b>.</p>");
  press(E.addQuote.en);
  draw().find((node) => node.type === "source-picker").props.onPick("quran:5:6");
  assert.equal(draw().find((node) => node.props?.["aria-current"] === "page").props["aria-label"], `${E.section.en} 2`, "A new page opens right away");
  // "View lesson" shows the learner view of the open page inside the editor, and gives a way back.
  press(E.view.en);
  assert.equal(draw().find((node) => node.type === "card-view").props.card.id, "00000002");
  assert(!draw().some((node) => node.type === "rich-text" || node.props?.["aria-label"] === E.titlePlaceholder.en));
  press(E.keepEditing.en);
  assert(!draw().some((node) => node.type === "card-view"));
  // Saving a draft closes the editor, like publishing does.
  press(strings.instructor.saveDraft.en);
  await settle();
  assert.deepEqual(visited, ["/studio/"], "Saving a draft returns to the lesson list");
  assert.equal(placementCalls.length, 1);
  assert.deepEqual(Array.from(placementCalls[0][0].lessons), ["other-course"], "Moving a course preserves other courses");
  assert.deepEqual(Array.from(placementCalls[0][1].lessons), [sent[0].id], "The chosen module receives the saved course");
  assert.deepEqual(steps, []);
  // An account that may publish can send the lesson to review instead: it is submitted, not approved.
  press(strings.instructor.submit.en);
  await settle();
  assert.deepEqual(steps, ["submit"]);
  press(strings.instructor.publishDirect.en);
  await settle();
  assert.deepEqual(steps, ["submit", "submit", "approve"]);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {
    id: "the-order-of-wudu-00000003", subject: "islam", tracks: ["explore"], level: 1, minutes: 4, status: "draft",
    title: { en: "The order of wudu", ar: "" }, summary: { en: "What to wash, in order.", ar: "" },
    cards: [
      { id: "00000001", kind: "concept", title: { en: "Start with the face", ar: "" }, html: { en: "<p>Wash the <b>face</b>.</p>", ar: "" }, sources: [] },
      { id: "00000002", kind: "quote", title: { en: "Al-Ma'idah 5:6", ar: "المائدة: ٦" }, sources: ["quran:5:6"] },
    ],
  });
  assert.equal(visited.length, 3, "Sending to review and publishing return to the lesson list");
  assert(draw().some((node) => node.props?.className === "chip max-w-full" && textContent(node) === "TTest Author"), "The API's credits list is shown after saving");

  // A live lesson is updated in place, in one call, without an automated review check.
  assert.equal(button(draw(), E.update.en).props.disabled, true, "Nothing to update until the lesson changes");
  type(E.titlePlaceholder.en, "The order of wudu, step by step");
  press(E.update.en);
  await settle();
  assert.deepEqual(steps.slice(3), ["update"]);
  assert.equal(sent.length, 4);
  assert(!draw().some((node) => node.type === "li" && textContent(node) === "Unsupported claim"));
  assert.equal(sent[3].id, sent[0].id);
  assert.equal(sent[3].title.en, "The order of wudu, step by step");
  assert.equal("tags" in sent[3], false);
  assert.equal(sent[3].subject, "islam");
  assert.deepEqual(toasts.join("|"), [strings.instructor.draftSaved.en, strings.instructor.submitted.en, strings.instructor.published.en, E.updated.en].join("|"), "The list shows what was done");
  assert.equal(visited.length, 4, "Updating returns to the lesson list");
  press(E.details.en);
  type(`Explore Islam · ${strings.dash.module.en}`, "common-questions");
  placementFails = true;
  press(E.update.en);
  await settle();
  assert.equal(visited.length, 4, "A failed module save stays in the editor");
  assert(draw().some((node) => node.props?.role === "alert" && textContent(node).includes("Module save unavailable")));
  assert.equal(textContent(draw().find((node) => String(node.props?.className).includes("studio-status"))), strings.instructor.status.published.en, "The course stays published when the module save fails");
  placementFails = false;
  press(E.update.en);
  await settle();
  assert.deepEqual(steps.slice(4), ["update", "update"]);
  assert.equal(sent.at(-1).id, sent[0].id, "Retrying module placement keeps the saved course ID");
  assert.equal(visited.length, 5);
  assert.deepEqual(Array.from(editorCurriculum.tracks[0].modules[0].lessons), ["other-course", sent[0].id]);
  assert.deepEqual(Array.from(editorCurriculum.tracks[0].modules[1].lessons), [], "Moving modules removes the previous placement");
  console.log("Studio editor: AI jobs report missing sources and open saved drafts, missing parts block saving, the saved lesson is published, and a live lesson is updated.");
}

// Exercise Users handlers and effect races against fake APIs only.
{
  const slots = [];
  let hookIndex = 0;
  const effects = [];
  const timers = new Map();
  let timerId = 0;
  const requests = [];
  const mutations = [];
  const fixture = [
    { id: "owner", email: "owner@example.test", display_name: "Owner", role: "super_admin", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: null, disabled: false, daily_reserved_tokens: 0, standalone_daily_reserved_tokens: 1800000 },
    { id: "target", email: "target@example.test", display_name: "Target", role: "learner", created_at: "2026-10-02T00:00:00Z", last_sign_in_at: null, disabled: false, daily_reserved_tokens: 200000, standalone_daily_reserved_tokens: 400000 },
  ];
  const counts = { total: 21, learner: 20, teacher: 0, admin: 0, super_admin: 1, disabled: 0 };
  const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = hookIndex++;
      if (!slots[i]) slots[i] = { value: initial };
      return [slots[i].value, (next) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }];
    },
    useRef(initial) {
      const i = hookIndex++;
      if (!slots[i]) slots[i] = { current: initial ?? { showModal() {}, close() {}, showPopover() {}, hidePopover() {}, isConnected: true } };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = hookIndex++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = hookIndex++;
      if (same(slots[i]?.deps, deps)) return;
      const previous = slots[i];
      slots[i] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    },
  };
  const t = (value) => value.en;
  const Page = load("../src/app/studio/users/page.tsx", {
    "react/jsx-runtime": jsx, react,
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Select": selectImport, "@/features/auth/roles": roles, "@/lib/strings": { S: strings },
    "@/lib/i18n": { useI18n: () => ({ t, lang: "en" }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ role: "super_admin", user: { id: "owner" } }) },
    "@/lib/api": {
      apiEnabled: true,
      listUsers: (params) => new Promise((resolve, reject) => requests.push({ params, resolve, reject })),
      changeUserRole: async (id, role) => { mutations.push({ id, role }); },
      setUserDisabled: async (id, disabled) => { mutations.push({ id, disabled }); },
      userEvents: async () => [],
    },
  }, {
    window: {
      setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
      clearTimeout: (id) => timers.delete(id),
    },
  }).default;
  const draw = () => { hookIndex = 0; const nodes = elements(Page()); while (effects.length) effects.shift()(); return nodes; };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const resolvePage = async (items = fixture, total = 21) => { requests.at(-1).resolve({ items, total, counts, daily_token_limit: 10000000 }); await settle(); return draw(); };
  const select = (nodes, label, value) => nodes.find((node) => node.type === "select" && node.props["aria-label"] === label).props.onChange({ target: { value } });
  const confirmButton = (nodes) => elements(nodes.find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "users-confirm-title"))
    .find((node) => node.type === "button" && node.props.className.startsWith("btn ") && !node.props.className.includes("ghost"));
  let nodes = draw();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].params.page_size, 10);
  nodes = await resolvePage();
  assert(nodes.some((node) => textContent(node) === "Showing 1–2 of 21"));
  assert(nodes.some((node) => node.type === "bdi" && textContent(node) === "0 / 10,000,000"));
  assert(nodes.some((node) => node.type === "bdi" && textContent(node) === "200,000 / 10,000,000"));
  assert(nodes.some((node) => textContent(node) === "FaithMinds: 1,800,000"), "FaithMinds usage stays visible even with zero main-app usage");
  button(nodes, "Target").props.onClick();
  await settle();
  nodes = draw();
  const detail = nodes.find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "users-detail-title");
  assert(elements(detail).some((node) => node.type === "bdi" && textContent(node) === "200,000 / 10,000,000"));
  assert(elements(detail).some((node) => textContent(node) === "FaithMinds: 400,000"));
  detail.props.onClose();
  nodes = draw();
  assert(nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Super admin").props.disabled);
  assert(nodes.find((node) => node.props?.["aria-label"] === "Disable: Owner").props.disabled);
  button(nodes, strings.instructor.nextPage.en).props.onClick();
  nodes = draw();
  assert.equal(requests.at(-1).params.page, 2);
  assert.equal(rows(nodes).length, 2, "Old rows stay visible during paging");
  select(nodes, strings.users.role.en, "teacher");
  draw();
  assert.equal(requests.at(-1).params.page, 1);
  assert.equal(requests.at(-1).params.role, "teacher");
  const stale = requests.at(-2);
  nodes = await resolvePage([{ ...fixture[1], role: "teacher" }], 1);
  stale.resolve({ items: [{ ...fixture[1], display_name: "Stale page" }], total: 21, counts });
  await settle();
  nodes = draw();
  assert(!nodes.some((node) => node.props?.children === "Stale page"), "A stale page response is ignored");
  select(nodes, "Teacher", "admin");
  nodes = draw();
  assert.equal(mutations.length, 0, "Selecting a role needs confirmation");
  assert(nodes.some((node) => textContent(node) === "Teacher → Admin"));
  nodes.find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "users-confirm-title").props.onClose();
  nodes = draw();
  assert.equal(mutations.length, 0, "Cancelling leaves the account unchanged");
  nodes.find((node) => node.props?.["aria-label"] === "Disable: Target").props.onClick();
  nodes = draw();
  assert.equal(mutations.length, 0, "Disabling needs confirmation");
  confirmButton(nodes).props.onClick();
  await settle();
  nodes = draw();
  assert.deepEqual(mutations, [{ id: "target", disabled: true }]);
  nodes = await resolvePage([{ ...fixture[1], role: "teacher", disabled: true }], 1);
  nodes.find((node) => node.props?.["aria-label"] === "Enable: Target").props.onClick();
  await settle();
  nodes = draw();
  assert.deepEqual(mutations.at(-1), { id: "target", disabled: false }, "Enabling runs directly");
  nodes = await resolvePage([{ ...fixture[1], role: "teacher" }], 1);
  select(nodes, "Teacher", "admin");
  nodes = draw();
  confirmButton(nodes).props.onClick();
  await settle();
  draw();
  assert.deepEqual(mutations.at(-1), { id: "target", role: "admin" });
  nodes = await resolvePage([], 0);
  assert(button(nodes, strings.instructor.resetFilters.en), "Empty results offer a reset");
  button(nodes, strings.instructor.resetFilters.en).props.onClick();
  draw();
  nodes = await resolvePage();
  button(nodes, strings.instructor.nextPage.en).props.onClick();
  draw();
  nodes = await resolvePage([], 10);
  assert.equal(requests.at(-1).params.page, 1, "An empty later page falls back to the previous page");
  nodes = await resolvePage();
  const input = nodes.find((node) => node.type === "input" && node.props.type === "search");
  const before = requests.length;
  input.props.onChange({ target: { value: "target@" } });
  draw();
  assert.equal(requests.length, before, "Typing is debounced");
  for (const timer of [...timers.values()]) if (timer.delay === 300) timer.fn();
  draw();
  assert.equal(requests.at(-1).params.q, "target@");
  assert.equal(requests.at(-1).params.page, 1);
  nodes = await resolvePage([{ ...fixture[1], daily_reserved_tokens: null, standalone_daily_reserved_tokens: null }], 1);
  assert(nodes.some((node) => node.type === "bdi" && textContent(node) === `${strings.users.tokensUnavailable.en} / 10,000,000`), "Missing usage must not appear as zero; the known maximum stays visible");
  assert(nodes.some((node) => textContent(node) === `FaithMinds: ${strings.users.tokensUnavailable.en}`), "Unreadable FaithMinds usage must not appear as zero");
  nodes.find((node) => node.props?.["aria-label"] === strings.instructor.resetFilters.en).props.onClick();
  draw();
  nodes = await resolvePage([{ ...fixture[1], daily_actual_tokens: 12345, daily_usage_unknown_calls: 1,
    standalone_daily_actual_tokens: 0, standalone_daily_usage_unknown_calls: 0 }], 1);
  assert(nodes.some((node) => textContent(node) === "YAQIN · Provider-reported: 12,345 · Calls with unknown usage (1)"));
  assert(nodes.some((node) => textContent(node) === "FaithMinds · Provider-reported: 0"), "Only a measured zero may display zero");
  assert(nodes.some((node) => textContent(node) === strings.users.reservedTokens.en));
  nodes.find((node) => node.type === "button" && textContent(node) === "Target").props.onClick();
  nodes = draw();
  const details = nodes.find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "users-detail-title");
  assert(textContent(details).includes("YAQIN · Provider-reported: 12,345 · Calls with unknown usage (1)"), "User details retain provider totals and incompleteness");
  console.log("Studio users: server paging, stale responses, disabled self-controls, role/status confirmations, reload/fallback and debounced search passed.");
}

// Sign-in offers account authentication only, including when Auth is unavailable.
for (const lang of ["en", "ar"]) {
  for (const authAvailable of [true, false]) {
    const SignIn = load("../src/app/signin/page.tsx", {
      "react/jsx-runtime": jsx, react: hooks,
      "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({ replace: () => {} }) },
      "lucide-react": new Proxy({}, { get: () => () => null }),
      "@/components/Logo": { Logo: () => null }, "@/components/ui": { LangToggle: () => null },
      "@/lib/i18n": { useI18n: () => ({ t: (label) => label[lang], lang }) },
      "@/features/auth/SessionProvider": { useSession: () => ({ ready: true, user: null, guest: true, authAvailable }) },
      "@/lib/strings": { S: strings }, "@/lib/supabase": { supabase: () => null },
    }).default;
    const nodes = elements(SignIn());
    const labels = JSON.stringify(nodes.map((node) => node.props?.children), (_, value) => typeof value === "symbol" ? undefined : value);
    assert.ok(!/Continue as guest|المتابعة كزائر|continue as a guest|تابع كزائر/.test(labels));
    const google = nodes.find((node) => node.type === "button" && [].concat(node.props.children).includes(strings.auth.google[lang]));
    assert.equal(google.props.disabled, !authAvailable);
  }
}
console.log("Sign-in: no guest entry in EN/AR, including missing authentication configuration.");
