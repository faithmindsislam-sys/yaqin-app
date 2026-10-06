import assert from "node:assert/strict";
import { loadSource } from "./load-source.mjs";
import * as jsx from "react/jsx-runtime";

class ApiError extends Error {
  constructor(status) { super(`HTTP ${status}`); this.status = status; }
}

const job = (status, resumable = false) => ({ job_id: "job one", status, resumable, stage: status });

async function follow(states, { cancelDuringWait = false, postFailure = null } = {}) {
  const requests = [];
  const progress = [];
  let active = true;
  const { waitForDraft } = loadSource(new URL("../src/features/studio/api.ts", import.meta.url), {
    "@/lib/http": { ApiError, request: async (path, body) => {
      requests.push([path, body]);
      if (body !== undefined) {
        if (postFailure) throw postFailure;
        return { job_id: "job one", status: "running", stage: "checking" };
      }
      const state = states.length > 1 ? states.shift() : states[0];
      if (state instanceof Error) throw state;
      return state;
    } },
    "@/features/courses/catalog": { normalizeCourse: (value) => value },
  }, { TypeError, Error, setTimeout: (done) => { if (cancelDuringWait) active = false; done(); } });
  try {
    const result = await waitForDraft("job one", () => active, (state) => progress.push(state.status));
    return { result, requests, progress };
  } catch (error) { return { error, requests, progress }; }
}

const resumed = await follow([job("failed", true), job("running"), job("done")]);
assert.equal(resumed.result.status, "done");
assert.deepEqual(resumed.progress, ["failed", "running", "done"]);
assert.deepEqual(resumed.requests.map(([path]) => path), [
  "/review/draft/job%20one", "/review/draft/job%20one/resume",
  "/review/draft/job%20one", "/review/draft/job%20one",
]);
assert.equal(JSON.stringify(resumed.requests[1][1]), "{}"); // No client-supplied draft or verdict.

for (const status of ["done", "no_sources", "failed"]) {
  const stopped = await follow([job(status)]);
  assert.equal(stopped.result.status, status);
  assert.equal(stopped.requests.length, 1);
}
const exhausted = await follow([job("failed", true)]);
assert.equal(exhausted.result.status, "failed");
assert.equal(exhausted.requests.filter(([, body]) => body !== undefined).length, 2);
const cancelled = await follow([job("running")], { cancelDuringWait: true });
assert.equal(cancelled.result, null);
assert.equal(cancelled.requests.length, 1);
console.log("PASS: saved-job continuation, terminal outcomes, bounded resumes, and polling cancellation");


const recoveredNetwork = await follow([new TypeError("network disconnected"), new ApiError(503), job("done")]);
assert.equal(recoveredNetwork.result.status, "done");
assert.equal(recoveredNetwork.requests.length, 3);
assert(recoveredNetwork.requests.every(([, body]) => body === undefined));
for (const error of [new TypeError("offline"), new ApiError(502)]) {
  const failed = await follow([error]);
  assert.equal(failed.error, error);
  assert.equal(failed.requests.length, 3);
}
const forbidden = await follow([new ApiError(403)]);
assert.equal(forbidden.requests.length, 1);
assert.equal(forbidden.error.status, 403);
const ambiguous = await follow([job("failed", true)], { postFailure: new TypeError("resume acknowledgement lost") });
assert.equal(ambiguous.requests.length, 2);
assert.equal(ambiguous.requests.filter(([, body]) => body !== undefined).length, 1);
assert(ambiguous.error instanceof TypeError);
const cancelledRetry = await follow([new TypeError("offline")], { cancelDuringWait: true });
assert.equal(cancelledRetry.result, null);
assert.equal(cancelledRetry.requests.length, 1);
console.log("PASS: three bounded GET attempts, no authorization retry, no automatic POST retry, and cancelled retry");

// Render the actual editor with native hook stubs to exercise its URL handoff and
// refresh subscription. Network/provider behavior is covered by waitForDraft above.
function editor(initialSearch = "", { cachedLesson = null } = {}) {
  let search = new URLSearchParams(initialSearch);
  const states = [], refs = [], effects = [];
  let stateCursor = 0, refCursor = 0, effectCursor = 0;
  const routes = [], polled = [], events = [];
  const alive = { current: true };
  const t = (value) => value?.en ?? "";
  const router = { replace(path) {
    routes.push(path); events.push("url");
    search = new URLSearchParams(new URL(path, "https://studio.example").search);
  } };
  const react = {
    Suspense: ({ children }) => children,
    useState(initial) {
      const i = stateCursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
    },
    useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useEffect(run, dependencies) {
      const i = effectCursor++;
      const prior = effects[i];
      if (prior && dependencies?.every((value, index) => value === prior.dependencies?.[index])) return;
      prior?.cleanup?.();
      effects[i] = { dependencies, pending: run };
    },
  };
  let notice = null;
  const setBusy = () => {};
  const setNotice = (value) => { notice = value; };
  const inert = () => null;
  const imports = {
    react, "react/jsx-runtime": jsx,
    "@/components/RouteLink": { default: "a" },
    "next/navigation": { useSearchParams: () => search },
    "@/lib/navigation": { useRouter: () => router },
    "lucide-react": new Proxy({}, { get: () => inert }),
    "@/components/AppShell": { AppShell: ({ children }) => children },
    "@/components/Scenery": { PageBanner: inert },
    "@/components/PersonaIdentity": { PersonaIdentity: inert },
    "@/components/Select": { Select: (props) => jsx.jsx("select", props) },
    "@/lib/personas": { PERSONAS: { hassan: { welcome: { en: "Hassan" } } } },
    "./LessonHistory": { LessonHistory: inert }, "./CourseActivities": { CourseActivities: inert },
    "./SourcePicker": { SourcePicker: inert }, "./CourseContent": { CourseContent: inert },
    "./CourseDetails": { CourseDetails: inert },
    "./useCourseDocument": { useCourseDocument: () => ({ lesson: cachedLesson, busy: false, notice, alive,
      setBusy, setNotice, fail: (error) => setNotice({ text: error.message }), start() {} }) },
    "./model": { cardHtml: inert, filled: inert, plain: inert },
    "@/lib/http": { apiEnabled: true },
    "@/features/studio/api": {
      startDraft: async () => { events.push("start"); return { job_id: "job one" }; },
      draftJob: async () => job("running"),
      waitForDraft: async (id, active) => { if (active()) { events.push("poll"); polled.push(id); } return null; },
    },
    "@/features/courses/ContentProvider": { useContent: () => ({ sources: {}, tracks: [] }) },
    "@/lib/i18n": { useI18n: () => ({ lang: "en", t }) },
    "@/features/auth/roles": { isStaff: () => true, canReview: () => false },
    "@/features/auth/SessionProvider": { useSession: () => ({ role: "teacher", user: { id: "teacher" } }) },
  };
  const { default: Page } = loadSource(new URL("../src/features/studio/course-editor/CourseEditor.tsx", import.meta.url), imports, {
    Error, window: { setInterval: () => 1, clearInterval() {} },
  });
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") return nodes(node.type(node.props));
    return [node, ...nodes(node.props?.children)];
  };
  return {
    routes, polled, events,
    render() { stateCursor = refCursor = effectCursor = 0; return nodes(Page()); },
    async effects() {
      for (const effect of effects) if (effect?.pending) { const run = effect.pending; effect.pending = null; effect.cleanup = run(); }
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
    close() { effects.forEach((effect) => effect.cleanup?.()); alive.current = false; },
  };
}

const fresh = editor();
let view = fresh.render();
// The second course-start choice opens Hassan's AI form.
view.filter((node) => node.type === "button" && node.props.onClick)[1].props.onClick();
view = fresh.render();
view.find((node) => node.type === "select").props.onChange("explore");
view.find((node) => node.type === "textarea").props.onChange({ target: { value: "Teach wudu" } });
view = fresh.render();
view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
for (let i = 0; i < 4; i++) await Promise.resolve();
assert.equal(fresh.routes[0], "/studio/course/?generation=job%20one");
assert.deepEqual(fresh.events, ["start", "url"]); // URL is durable before polling begins.
fresh.render(); await fresh.effects();
assert.deepEqual(fresh.polled, ["job one"]);
fresh.close();
const refreshed = editor("generation=job%20one");
refreshed.render(); await refreshed.effects();
assert.deepEqual(refreshed.polled, ["job one"]);
assert.deepEqual(refreshed.events, ["poll"]); // Refresh never starts a duplicate job.
refreshed.close();
console.log("PASS: pending job URL saved before polling and refresh resumes the same job without POSTstart");

const cachedManual = editor("generation=job%20one", { cachedLesson: { id: "", title: { en: "Unsaved manual course" } } });
const pendingView = cachedManual.render();
assert(pendingView.find((node) => node.type === "form"), "Pending generation stays visible over a preserved manual draft");
pendingView.find((node) => node.type === "select").props.onChange("explore");
pendingView.find((node) => node.type === "textarea").props.onChange({ target: { value: "A different course" } });
const pendingForm = cachedManual.render().find((node) => node.type === "form");
pendingForm.props.onSubmit({ preventDefault() {} });
await cachedManual.effects();
assert.deepEqual(cachedManual.events, ["poll"], "Existing generation URL prevents another POSTstart");
cachedManual.close();
console.log("PASS: existing generation guards new starts and shows progress without deleting a cached manual draft");
