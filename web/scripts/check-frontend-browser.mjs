import { loadSource } from "./load-source.mjs";
// Real React mount/update/unmount and Next navigation, with local service boundaries.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { S } = loadSource(new URL("../src/lib/strings.ts", import.meta.url));
const { PERSONAS } = loadSource(new URL("../src/lib/personas.ts", import.meta.url));
const { K } = loadSource(new URL("../src/features/studio/knowledge-base/strings.ts", import.meta.url));
const { FIRST_STEPS: F, PRACTICE_STAGES, DAILY_PRAYERS, dailyPrayerSteps } = loadSource(new URL("../src/features/first-steps/data.ts", import.meta.url));
const { W, HABITS, REFLECTIONS, PRAYERS, COUNTERS } = loadSource(new URL("../src/features/worship/data.ts", import.meta.url));
const base = process.env.FRONTEND_TEST_URL || "http://127.0.0.1:3119";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Only local test servers are allowed");
const snapshot = JSON.parse(readFileSync("public/data/content.json", "utf8"));
const bi = (text) => ({ en: text, ar: `عربي ${text}` });
const course = (id, html = true) => ({ id, title: bi(`Course ${id}`), summary: bi(`Summary ${id}`), subject: "fiqh", level: 1,
  tracks: ["first-steps"], audience_track: "deepen", minutes: 5, status: "draft", cards: [
    { id: `${id}-one`, kind: "concept", title: bi(`Page ${id}`), ...(html ? { html: bi("<p>Formatted <strong>page text</strong></p>") } : { body: bi("Legacy page text") }), sources: [] },
    { id: `${id}-two`, kind: "concept", title: bi(`Second ${id}`), body: bi("Second page"), sources: [] },
  ], quiz: [1, 2].map((i) => ({ id: `${id}-q${i}`, question: bi(`Question ${id} ${i}`), options: [bi("Correct"), bi("Incorrect")], answer: 0 })) });
const answer = (text) => ({ tier: "A", answer: [{ type: "text", text }], sources: {}, follow_ups: [], referral: null, ai_generated: true });
const identity = (id) => {
  const user = { id, email: `${id}@example.test`, role: "authenticated", aud: "authenticated", created_at: "2026-10-01T00:00:00Z", user_metadata: { name: "Test account" }, app_metadata: {} };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: id, exp, aud: "authenticated", role: "authenticated" })).toString("base64url"), "offline"].join(".");
  return { access_token: token, refresh_token: "offline-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
};
const firstId = "00000000-0000-0000-0000-000000000001";
const secondId = "00000000-0000-0000-0000-000000000002";
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { assert(Date.now() < deadline, "Expected mocked request did not arrive"); await new Promise((resolve) => setTimeout(resolve, 10)); }
}
const gate = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };
const output = process.env.FRONTEND_SCREENSHOTS || "/tmp/yaqin-frontend-audit";
mkdirSync(output, { recursive: true });
async function screenshot(page, name) {
  const portraits = page.locator('img[src^="/avatars/"]');
  if (await portraits.count()) {
    await portraits.first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('img[src^="/avatars/"]')].every((image) => image.complete && image.naturalWidth > 0));
  }
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}
const browser = await chromium.launch({ headless: true, ...(process.env.COURSE_CHROME_PATH ? { executablePath: process.env.COURSE_CHROME_PATH } : {}) });
let activePage;
let activeLabel;

async function setup(lang, mobile, { signedIn = true, role = "admin", outage = false, seedTrack = "invalid" } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  const state = { role, outage, empty: false, logoutFails: false, uid: firstId, saves: [], saveGate: null, loadGate: null, askGate: null, askFails: false, jobGate: null,
    worship: new Map(), worshipSaveFails: false, worshipLoadFails: false, worshipGate: null,
    drafts: [], asks: [], failedRequests: [], askResponse: answer("OLD RESPONSE"), courses: { a: course("a"), b: course("b", false) }, loaded: 0, asked: 0, polled: 0,
    resourceDeleted: false, deleteCalls: 0, deleteFails: false,
    resource: { documentId: "a".repeat(32), resourceId: "a".repeat(32), filename: "publisher-islamhouse-en-42.pdf",
      title: "The Pillars of Faith", description: "A concise introduction to faith.", pages: 24, status: "COMPLETED", enabled: true, ocrUsed: false } };
  const bundle = () => ({ ...snapshot, courses: state.empty ? {} : { ...snapshot.courses, ...Object.fromEntries(Object.entries(state.courses).map(([id, course]) => [id, { ...course, status: "published" }])) } });
  await context.addInitScript(({ lang, signedIn, session, seedTrack }) => {
    if (!sessionStorage.getItem("fixture-seeded")) {
      if (signedIn) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      localStorage.setItem("yaqin.lang", lang);
      // Malformed preferences and chat entries exercise the persisted-data boundary.
      localStorage.setItem(`yaqin.prefs.${session.user.id}`, JSON.stringify({ track: seedTrack, minutes: {}, known: {}, onboarded: true }));
      localStorage.setItem(`yaqin.prefs.${session.user.id}.pending`, "1");
      localStorage.setItem(`yaqin.ask.${session.user.id}.first-steps.${lang}`, JSON.stringify([null, { role: "assistant", data: { answer: [{ type: "text", text: {} }] } }, { role: "user", text: {} }]));
      localStorage.setItem(`yaqin.ask.${session.user.id}.explore.${lang}`, JSON.stringify([{ role: "user", text: "Previously saved question" }]));
      sessionStorage.setItem("fixture-seeded", "1");
    }
    window.recognitions = [];
    window.SpeechRecognition = class {
      constructor() { this.stopped = false; window.recognitions.push(this); }
      start() {}
      stop() { this.stopped = true; this.onend?.(); }
    };
  }, { lang, signedIn, seedTrack, session: identity(firstId) });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const send = (json, status = 200) => route.fulfill({ status, json, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" } });
    if (request.method() === "OPTIONS") return send({});
    if (url.port === "8798") {
      if (path === "/rest/v1/worship_entries") {
        if (request.method() === "GET") {
          if (state.worshipLoadFails) return send({ message: "Worship load unavailable" }, 503);
          const uid = url.searchParams.get("user_id")?.slice(3);
          const ranges = url.searchParams.getAll("day");
          const start = ranges.find(value => value.startsWith("gte."))?.slice(4);
          const end = ranges.find(value => value.startsWith("lte."))?.slice(4);
          return send([...state.worship.values()].filter(row => row.user_id === uid && row.day >= start && row.day <= end));
        }
        if (state.worshipGate) await state.worshipGate.promise;
        if (state.worshipSaveFails) return send({ message: "Worship save unavailable" }, 503);
        const payload = request.postDataJSON();
        const ignore = request.headers().prefer?.includes("ignore-duplicates");
        for (const row of Array.isArray(payload) ? payload : [payload]) {
          assert.equal(row.user_id, state.uid, "Worship writes belong to the authenticated account");
          const key = `${row.user_id}:${row.day}`;
          if (!ignore || !state.worship.has(key)) state.worship.set(key, row);
        }
        return send(Array.isArray(payload) ? [] : state.worship.get(`${payload.user_id}:${payload.day}`));
      }
      if (path.endsWith("/logout")) { return send(state.logoutFails ? { message: "Sign-out unavailable" } : {}, state.logoutFails ? 400 : 200); }
      if (path.endsWith("/token")) { state.uid = secondId; return send(identity(secondId)); }
      if (path.endsWith("/user")) return send(identity(state.uid).user);
      if (path.includes("profiles")) return send({ role: state.role, preferred_track: seedTrack === "deepen" ? "deepen" : "first-steps", daily_minutes: 10, onboarded: true, known_lessons: [], lang, display_name: "Test account" });
      return send([]);
    }
    if (path === "/data/content.json" || path === "/api/content") return send(state.outage ? {} : bundle(), state.outage ? 503 : 200);
    if (url.port === "8797") {
      if (path === "/api/admin/rag/resources") {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        const matched = !state.resourceDeleted && [state.resource.title, state.resource.description, state.resource.filename].some((value) => value.toLowerCase().includes(q));
        return send({ resources: matched ? [state.resource] : [], total: matched ? 1 : 0, page: 1, pageSize: 25 });
      }
      if (path === `/api/admin/rag/documents/${state.resource.documentId}/status`) return send(state.resource);
      if (path === `/api/admin/rag/resources/${state.resource.documentId}/metadata`) {
        Object.assign(state.resource, request.postDataJSON());
        return send(state.resource);
      }
      if (path === `/api/admin/rag/resources/${state.resource.documentId}/delete`) {
        state.deleteCalls++;
        if (state.deleteFails) return send({ error: { message: "Deletion temporarily unavailable." } }, 503);
        state.resourceDeleted = true;
        return send({ documentId: state.resource.documentId, deleted: true });
      }
      if (path === "/api/admin/users") return send({ items: [], total: 0, counts: { total: 0, learner: 0, teacher: 0, admin: 0, super_admin: 0, disabled: 0 } });
      if (path === "/api/review/courses") return send(Object.values(state.courses));
      const review = path.match(/^\/api\/review\/([^/]+)\/(decision|submit|archive|unpublish|delete)$/);
      if (review) {
        const [, id, operation] = review;
        const decision = operation === "decision" ? request.postDataJSON().decision : operation;
        (state.actionCalls ??= []).push({ id, decision });
        if (state.saveGate) await state.saveGate.promise;
        if (decision === "delete" && state.protectedCourse === id) return send({ error: { code: "has_progress", message: "Learners have progress on this course. Archive it instead of deleting it." } }, 409);
        if (decision === "delete") delete state.courses[id];
        else state.courses[id].status = { approve: "published", request_changes: "draft", submit: "in_review", archive: "archived", unpublish: "draft" }[decision];
        return send({});
      }
      if (path.startsWith("/api/courses/")) {
        const id = path.split("/").at(-1); state.loaded++;
        if (state.loadGate && id === "a") await state.loadGate.promise;
        return send(state.courses[id]);
      }
      if (path.endsWith("/history")) return send([]);
      if (path === "/api/review/drafts" || path === "/api/review/published") {
        const data = request.postDataJSON(); state.saves.push(data);
        if (state.saveGate) await state.saveGate.promise;
        state.courses[data.id] = data;
        return send({ lesson_id: data.id, status: "draft", contributors: ["Test account"] });
      }
      if (path === "/api/tutor/ask") { state.asked++; state.asks.push(request.postDataJSON()); if (state.askGate) await state.askGate.promise; return send(state.askFails ? { error: { message: "Tutor unavailable" } } : state.askResponse, state.askFails ? 503 : 200); }
      if (path === "/api/review/draft") { state.drafts.push(request.postDataJSON()); return send({ job_id: "test-job" }); }
      if (path === "/api/review/draft/test-job") { state.polled++; if (state.jobGate) await state.jobGate.promise; return send({ job_id: "test-job", status: "done", stage: "done", lesson_id: "b" }); }
      return send({});
    }
    if (url.origin === new URL(base).origin) return route.continue();
    // No deployed services, external assets or credentials are contacted.
    return route.abort();
  });
  const page = await context.newPage();
  page.on("requestfailed", (request) => state.failedRequests.push({ method: request.method(), path: new URL(request.url()).pathname, reason: request.failure()?.errorText }));
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /same key|Hydration failed|Cannot update a component/.test(message.text())) errors.push(message.text()); });
  page.on("dialog", (dialog) => dialog.accept());
  const t = (value) => value[lang];
  const button = (name) => page.getByRole("button", { name: t(name), exact: true });
  const field = (name) => page.getByRole("textbox", { name: t(name), exact: true });
  const goto = (path) => page.goto(`${base}${path}`);
  const client = (path) => page.evaluate((path) => window.history.pushState(null, "", path), path);
  return { context, page, state, errors, t, button, field, goto, client, lang };
}

async function checkStudioActions(f, label) {
  const { page, state, t, goto } = f;
  state.courses = Object.fromEntries(["in_review", "draft", "published", "archived"].map((status, i) => {
    const item = { ...course(String(i)), status, author_id: firstId };
    if (i === 0) item.title = { en: "Who is Allah? Oneness and Mercy", ar: "من هو الله؟ التوحيد والرحمة" };
    return [item.id, item];
  }));
  const item = state.courses["0"];
  const row = (id) => page.locator(".studio-lesson-row").filter({ has: page.getByRole("link", { name: t(state.courses[id].title), exact: true }) });
  const more = (id) => row(id).getByRole("button", { name: `${t(S.instructor.moreActions)}: ${t(state.courses[id].title)}`, exact: true });
  const menu = (id) => row(id).getByRole("group", { name: `${t(S.instructor.colActions)}: ${t(state.courses[id].title)}`, exact: true });
  await goto("/studio/");
  await more("0").waitFor();
  assert.equal(await row("0").getByRole("button").count(), 2, "Only Publish and More are visible");
  const actions = await row("0").locator(".studio-row-actions > .btn").evaluateAll((items) => items.map((item) => ({ top: item.getBoundingClientRect().top, height: item.getBoundingClientRect().height })));
  assert(actions.every(({ top, height }) => top === actions[0].top && height >= 44), "Actions fit one row with touch-sized targets");
  assert.equal(await row("3").getByRole("link", { name: t(S.instructor.editArchived), exact: true }).isVisible(), true);
  assert.equal(await row("3").locator(".btn-primary").count(), 0, "Archived courses have no publication action");
  await more("3").click();
  assert.equal(await menu("3").getByRole("button", { name: t(S.instructor.archive), exact: true }).count(), 0, "Archived courses cannot be archived again");
  await menu("3").getByRole("button", { name: t(S.instructor.delete), exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await more("0").focus(); await page.keyboard.press("Enter");
  await menu("0").waitFor();
  const bounds = await menu("0").boundingBox();
  const viewport = page.viewportSize();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, "The action menu fits the viewport");
  await page.keyboard.press("Tab");
  assert.equal(await row("0").getByRole("button", { name: t(S.instructor.requestChanges), exact: true }).evaluate((button) => button === document.activeElement), true);
  await screenshot(page, `studio-actions-${label}`);
  await page.keyboard.press("Escape"); await menu("0").waitFor({ state: "hidden" });
  assert.equal(await more("0").evaluate((button) => button === document.activeElement), true);
  await more("0").click();
  await page.getByRole("heading", { name: t(S.instructor.lessons), exact: true }).click();
  await menu("0").waitFor({ state: "hidden" });
  await more("0").click();
  await row("0").getByRole("button", { name: t(S.instructor.requestChanges), exact: true }).click();
  await row("0").getByText(t(S.instructor.status.draft), { exact: true }).waitFor();
  assert.deepEqual(state.actionCalls, [{ id: item.id, decision: "request_changes" }]);
  await more("1").click();
  await row("1").getByRole("button", { name: t(S.instructor.delete), exact: true }).click();
  const confirmation = page.getByRole("dialog");
  await confirmation.getByRole("button", { name: t(S.instructor.closeForm), exact: true }).click();
  assert.equal(state.actionCalls.length, 1, "Cancel does not delete the draft");
  await more("1").click();
  await row("1").getByRole("button", { name: t(S.instructor.archive), exact: true }).click();
  await confirmation.getByRole("button", { name: t(S.instructor.archive), exact: true }).click();
  await row("1").getByText(t(S.instructor.status.archived), { exact: true }).waitFor();
  await more("2").click();
  await row("2").getByRole("button", { name: t(S.instructor.hide), exact: true }).click();
  await confirmation.getByRole("button", { name: t(S.instructor.hide), exact: true }).click();
  await row("2").getByText(t(S.instructor.status.draft), { exact: true }).waitFor();
  state.saveGate = gate();
  await row("0").getByRole("button", { name: t(S.instructor.publishDirect), exact: true }).click();
  await until(() => state.actionCalls.length === 4);
  assert.equal(await more("2").isDisabled(), true, "More is disabled during an action");
  state.saveGate.release(); state.saveGate = null;
  await row("0").getByText(t(S.instructor.status.published), { exact: true }).waitFor();
  state.protectedCourse = "0";
  await more("0").click();
  await menu("0").getByRole("button", { name: t(S.instructor.delete), exact: true }).click();
  await confirmation.getByRole("button", { name: t(S.instructor.delete), exact: true }).click();
  await page.getByRole("alert").getByText("Learners have progress on this course. Archive it instead of deleting it.", { exact: true }).waitFor();
  assert.equal(state.courses["0"].status, "published", "Deletion with learner progress keeps the course");
  await row("0").getByText(t(S.instructor.status.published), { exact: true }).waitFor();
  state.protectedCourse = null;
  state.courses["3"].status = "in_review";
  await goto("/studio/");
  for (const id of ["0", "1", "2", "3"]) {
    const title = t(state.courses[id].title);
    const courseRow = row(id);
    await more(id).click();
    await menu(id).getByRole("button", { name: t(S.instructor.delete), exact: true }).click();
    await confirmation.getByText(t(S.instructor.deleteConfirm), { exact: true }).waitFor();
    assert.equal(await confirmation.getByRole("button", { name: t(S.instructor.closeForm), exact: true }).evaluate((button) => button === document.activeElement), true, "Cancel has initial focus");
    const calls = state.actionCalls.length;
    await confirmation.getByRole("button", { name: t(S.instructor.closeForm), exact: true }).click();
    assert.equal(state.actionCalls.length, calls, "Cancel does not send a deletion request");
    await more(id).click();
    await menu(id).getByRole("button", { name: t(S.instructor.delete), exact: true }).click();
    const deleteButton = confirmation.getByRole("button", { name: t(S.instructor.delete), exact: true });
    assert.match(await deleteButton.getAttribute("class"), /btn-tint-danger/, "Deletion confirmation uses the destructive style");
    if (id === "0") await screenshot(page, `studio-delete-${label}`);
    await deleteButton.click();
    await page.getByRole("status").getByText(t(S.instructor.deleted), { exact: true }).waitFor();
    await page.getByRole("link", { name: title, exact: true }).waitFor({ state: "hidden" });
    assert.equal(state.courses[id], undefined);
    assert.equal(await courseRow.count(), 0, "Deleted courses leave the list");
    assert.equal(state.actionCalls.length, calls + 1, "Confirm sends exactly one deletion request");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(f.errors, []);
  console.log(`PASS Studio actions ${label}: layout, keyboard, request changes, hide, publish, busy state; delete at every status, cancellation and learner-progress protection`);
}

async function checkStudioFilters(f, label) {
  const { context, page, errors, t, button, goto, client } = f;
  const key = `yaqin.studio.filters.${firstId}`;
  const journey = snapshot.tracks.find((track) => track.id === "first-steps");
  const journeyModule = journey.modules[0];
  const subject = snapshot.subjects.find((subject) => subject.id === "fiqh");
  const level = snapshot.levels.find((level) => level.id === 1);
  const search = () => page.locator(".studio-filters").getByRole("searchbox");
  const select = (name) => page.locator(".studio-filters").getByRole("combobox", { name: new RegExp(`^${t(name)}`) });
  const choose = async (name, value) => {
    await select(name).click(); await page.getByRole("option", { name: t(value), exact: true }).click();
  };
  const saved = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), key);
  const defaults = async () => {
    assert.equal(await search().inputValue(), "");
    for (const [name, value] of [[S.instructor.track, S.library.all], [S.dash.module, S.library.allModules], [S.instructor.subject, S.library.allSubjects], [S.instructor.level, S.instructor.allLevels], [S.instructor.statusFilter, S.instructor.allStatuses]]) {
      assert((await select(name).textContent()).includes(t(value)));
    }
    assert.equal(await select(S.dash.module).isDisabled(), true);
    await page.getByRole("link", { name: t(bi("Course a")), exact: true }).waitFor();
  };
  const restored = async () => {
    await search().waitFor();
    assert.equal(await search().inputValue(), "Course a");
    for (const [name, value] of [[S.instructor.track, journey.title], [S.dash.module, journeyModule.title], [S.instructor.subject, subject.title], [S.instructor.level, level.title], [S.instructor.statusFilter, S.instructor.status.draft]]) {
      await page.waitForFunction(({ name, value }) => [...document.querySelectorAll(".studio-filters .studio-select")].some((el) => el.textContent.includes(name) && el.textContent.includes(value)), { name: t(name), value: t(value) });
    }
  };

  await goto("/studio/"); await defaults();
  await choose(S.instructor.track, journey.title);
  await choose(S.dash.module, journeyModule.title);
  await choose(S.instructor.subject, subject.title);
  await choose(S.instructor.level, level.title);
  await choose(S.instructor.statusFilter, S.instructor.status.draft);
  await search().fill("Course a");
  await page.waitForFunction((key) => JSON.parse(sessionStorage.getItem(key))?.search === "Course a", key);
  const expected = { trackFilter: "first-steps", moduleFilter: journeyModule.id, subjectFilter: "fiqh", levelFilter: 1, statusFilter: "draft", search: "Course a" };
  assert.deepEqual(await saved(), expected);
  await page.getByRole("link", { name: t(S.instructor.newLesson), exact: true }).click();
  await page.waitForURL(/\/studio\/course\/$/);
  await page.goBack(); await page.waitForURL(/\/studio\/$/); await restored();
  await page.reload(); await restored();
  assert.deepEqual(await saved(), expected, "Refresh never overwrites saved filters with defaults");
  await screenshot(page, `studio-filters-${label}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  const otherTab = await context.newPage();
  await otherTab.goto(`${base}/studio/`);
  await otherTab.getByRole("link", { name: t(bi("Course a")), exact: true }).waitFor();
  assert.equal(await otherTab.getByRole("searchbox").inputValue(), "", "Another tab starts with its own session preferences");
  await otherTab.close();
  await choose(S.instructor.track, snapshot.tracks.find((track) => track.id === "deepen").title);
  assert((await select(S.dash.module).textContent()).includes(t(S.library.allModules)), "Changing journey clears its module");
  await page.locator(".studio-reset").click(); await defaults();
  await page.waitForFunction((key) => sessionStorage.getItem(key) === null, key);
  await page.reload(); await defaults();
  await page.locator(".metric-draft").click();
  await page.waitForFunction((key) => JSON.parse(sessionStorage.getItem(key))?.statusFilter === "draft", key);
  await page.reload();
  assert((await select(S.instructor.statusFilter).textContent()).includes(t(S.instructor.status.draft)), "Status shortcuts are also remembered");

  for (const raw of ["{bad JSON", JSON.stringify({ trackFilter: {}, moduleFilter: [], subjectFilter: {}, levelFilter: "1", statusFilter: "unknown", search: {} }), JSON.stringify({ trackFilter: "first-steps", moduleFilter: "deleted", subjectFilter: "deleted", levelFilter: 999 })]) {
    await client("/studio/course/");
    await page.waitForURL(/\/studio\/course\/$/);
    await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key, raw });
    await client("/studio/"); await search().waitFor();
    assert.equal(await search().inputValue(), "");
    await page.getByRole("link", { name: t(bi("Course a")), exact: true }).waitFor();
  }
  await page.locator(".studio-reset").click(); await defaults();
  await page.evaluate(() => {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function(key, ...args) {
        if (key.startsWith("yaqin.studio.filters.")) throw new DOMException("Storage blocked", "SecurityError");
        return original.call(this, key, ...args);
      };
    }
  });
  await client("/studio/course/"); await page.waitForURL(/\/studio\/course\/$/);
  await client("/studio/"); await defaults();
  await search().fill("Course a");
  await page.getByRole("link", { name: t(bi("Course a")), exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: t(bi("Course b")), exact: true }).count(), 0, "Blocked storage still allows in-memory filtering");
  await page.reload(); await defaults();
  await search().fill("Course a");
  await page.waitForFunction((key) => JSON.parse(sessionStorage.getItem(key))?.search === "Course a", key);
  const firstAccount = await saved();
  await button(S.nav.signOut).click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/signin/");
  await goto("/signin/");
  await page.getByRole("textbox", { name: t(S.auth.email), exact: true }).fill("second@example.test");
  await page.getByLabel(t(S.auth.password), { exact: true }).fill("fixture-password");
  await button(S.auth.signIn).click(); await page.waitForURL(/\/learn\//);
  await goto("/studio/"); await defaults();
  assert.deepEqual(await saved(), firstAccount, "Another account never inherits or overwrites the first account's filters");
  assert.deepEqual(errors, []);
  console.log(`PASS Studio filters ${label}: navigation, refresh, reset, journey/module dependency, per-tab/account isolation, malformed/stale/blocked storage`);
}

async function checkPractice(f) {
  const { page, state, errors, t, button, field, goto } = f;
  await goto("/course/?id=a&track=explore");
  const panel = page.locator("#companion");
  const action = (name) => panel.getByRole("button", { name: t(name), exact: true }).last();
  await action(S.lesson.testMe).waitFor();
  const source = Object.values(snapshot.sources).find((s) => s.kind === "quran");
  const hint = { en: "Think about the distinction on the page.", ar: "فكّر في الفرق الموضّح في الصفحة." };
  const explanation = { en: "A short source-supported explanation.", ar: "شرح موجز تدعمه المصادر." };
  const items = [0, 1].map((i) => ({ id: `practice:${i}`, question: { en: `Fresh practice question ${i + 1}?`, ar: `سؤال تدريب جديد ${i + 1}؟` },
    options: [{ en: "First option", ar: "الخيار الأول" }, { en: "Second option", ar: "الخيار الثاني" }, { en: "Third option", ar: "الخيار الثالث" }],
    answer: i === 0 ? 0 : 2, hint, explanation, source: source.id }));
  state.askResponse = { ...answer(""), answer: [], practice: items, sources: { [source.id]: source } };
  state.askFails = true;
  await action(S.lesson.testMe).click();
  await panel.getByRole("alert").waitFor();
  await button(S.lesson.continue).click();
  state.askFails = false;
  await action(S.ask.retry).click();
  await panel.getByText(t(items[0].question), { exact: true }).waitFor();
  assert.equal(await action(S.lesson.testMe).count(), 0, "Quick practice also hides the welcome shortcuts after a reply");
  assert.equal(state.asked, 2, "Failed quick practice can be retried after page navigation");
  assert.deepEqual(state.asks.at(-1).practice_avoid, []);
  assert.equal(await panel.getByText(t(bi("Question a 1")), { exact: true }).count(), 0);
  assert.equal(state.asks.at(-1).practice, true);
  assert.equal(state.asks.at(-1).card_id, "a-one");
  assert.equal(state.asks.at(-1).track, "explore");
  await button(S.lesson.previous).click();
  const before = await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`) ?? "{}").lessons, firstId);
  await panel.getByText(t(S.lesson.aiPractice), { exact: true }).waitFor();
  const choices = panel.getByRole("group", { name: t(S.lesson.answerChoices), exact: true });
  const help = panel.getByRole("group", { name: t(S.lesson.practiceHelp), exact: true });
  assert.equal(await choices.getByRole("button").count(), items[0].options.length, "Answer choices form their own group");
  assert.equal(await help.getByRole("button").count(), 2, "Hint and reveal belong to a separate help group");
  assert.equal(await choices.getByRole("button", { name: t(S.lesson.showHint), exact: true }).count(), 0);
  assert.equal(await panel.getByText(t(hint), { exact: true }).count(), 0);
  assert.equal(await panel.getByText(t(explanation), { exact: true }).count(), 0);
  const askCount = state.asked;
  assert.equal(await action(S.lesson.showHint).getAttribute("aria-expanded"), "false");
  await action(S.lesson.showHint).click();
  await panel.getByText(t(hint), { exact: true }).waitFor();
  assert.equal(await action(S.lesson.hideHint).getAttribute("aria-expanded"), "true");
  await action(S.lesson.hideHint).press("Enter");
  await panel.getByText(t(hint), { exact: true }).waitFor({ state: "hidden" });
  assert.equal(await action(S.lesson.showHint).getAttribute("aria-expanded"), "false");
  await field(S.lesson.companionPlaceholder).fill(t(S.lesson.showHint));
  await action(S.ask.send).click();
  await panel.getByText(t(hint), { exact: true }).waitFor();
  await action(S.lesson.hideHint).click();
  await panel.getByText(t(hint), { exact: true }).waitFor({ state: "hidden" });
  await action(S.lesson.showHint).click();
  await panel.getByText(t(hint), { exact: true }).waitFor();
  assert.equal(state.asked, askCount, "Hint uses the checked candidate without another model request");
  assert.equal(await panel.getByText(t(explanation), { exact: true }).count(), 0);
  await field(S.lesson.companionPlaceholder).fill(t(S.lesson.showPracticeAnswer));
  await action(S.ask.send).click();
  await panel.getByText(t(S.lesson.practiceAnswerShown), { exact: true }).waitFor();
  await panel.getByText(t(explanation), { exact: true }).waitFor();
  assert.equal(await panel.getByRole("log").locator("footer[aria-label], details").count(), 0, "Mariam's practice stays source-free");
  await action(S.lesson.nextQuestion).click();
  assert.equal(await panel.getByRole("heading", { name: t(items[1].question), exact: true }).evaluate((el) => el === document.activeElement), true,
    "Next question gives keyboard focus to the new question");
  assert.equal(await action(S.lesson.showHint).getAttribute("aria-expanded"), "false", "Each question starts with its hint hidden");
  assert.equal(await panel.getByText(t(hint), { exact: true }).count(), 0);
  const wrong = panel.getByRole("button", { name: t(items[1].options[0]), exact: true });
  await wrong.click();
  assert.match(await wrong.getAttribute("class"), /rose/);
  assert.match(await panel.getByRole("button", { name: t(items[1].options[2]), exact: true }).getAttribute("class"), /brand-400/);
  assert.deepEqual(await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`) ?? "{}").lessons, firstId), before,
    "Practice answers and reveals do not write course progress");
  await field(S.lesson.companionPlaceholder).fill("Draft while moving between pages");
  await button(S.lesson.continue).click();
  await panel.getByText(t(items[1].question), { exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: t(items[1].options[2]), exact: true }).isDisabled(), true,
    "Moving to another page preserves the current practice question and answer");
  await button(S.lesson.previous).click();
  assert.equal(await field(S.lesson.companionPlaceholder).inputValue(), "Draft while moving between pages");
  await field(S.lesson.companionPlaceholder).fill("");
  const afterNavigation = await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`) ?? "{}").lessons, firstId);
  await action(S.lesson.seeScore).click();
  await panel.getByText(`${t(S.lesson.practiceScore)} 0 ${t(S.lesson.of)} 2`, { exact: true }).waitFor();
  await action(S.ask.retry).click();
  assert.equal(await panel.getByText(t(explanation), { exact: true }).count(), 0, "Try again hides the answer");
  assert.deepEqual(await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`) ?? "{}").lessons, firstId), afterNavigation,
    "Practice scores and reveals do not write assessment scores or course progress");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await panel.screenshot({ path: `${output}/practice-${t({ en: "en", ar: "ar" })}.png` });
  state.askResponse = { ...answer("Fresh generation unavailable. Please try again."), ai_generated: false, practice_fallback: true };
  await button(S.lesson.continue).click();
  await action(S.lesson.morePractice).click();
  await panel.getByText("Fresh generation unavailable. Please try again.", { exact: true }).waitFor();
  assert.equal(state.asks.at(-1).card_id, "a-one", "More practice retains the original topic after page navigation");
  await button(S.lesson.previous).click();
  assert.deepEqual(state.asks.at(-1).practice_avoid, items.flatMap((item) => [item.question.en, item.question.ar]),
    "All prior session questions are excluded from further generation in either language");
  assert.equal(await panel.getByText(t(S.lesson.reviewedPractice), { exact: true }).count(), 0,
    "A generation failure never substitutes stored questions");
  state.askResponse = { ...answer("The tutor is temporarily unavailable."), tier: "NONE", ai_generated: false, safety_outcome: "safety_unavailable" };
  await action(S.lesson.morePractice).click();
  await panel.getByText(t(S.ask.unavailable), { exact: true }).waitFor();
  assert.equal(await panel.getByText(t(S.ask.tier.NONE), { exact: true }).count(), 0,
    "Safety service unavailability is labelled accurately instead of as missing approved sources");
  await action(S.ask.newChat).click();
  state.askResponse = { ...answer(""), answer: [], practice: items, sources: { [source.id]: source } };
  await action(S.lesson.testMe).click();
  await panel.getByText(t(items[0].question), { exact: true }).waitFor();
  assert.deepEqual(state.asks.at(-1).practice_avoid, [], "New chat starts a new in-memory practice session");
  for (let n = 0; n < 8; n++) {
    await panel.getByRole("button", { name: t(items[0].options[0]), exact: true }).last().click();
    const fresh = items.map((item, index) => ({ ...item, question: { en: `Session batch ${n + 2}, question ${index + 1}?`, ar: `مجموعة الجلسة ${n + 2}، سؤال ${index + 1}؟` } }));
    state.askResponse = { ...answer(""), answer: [], practice: fresh, sources: { [source.id]: source } };
    await action(S.lesson.morePractice).click();
    await panel.getByText(t(fresh[0].question), { exact: true }).waitFor();
    assert.equal(await panel.getByRole("button", { name: t(items[0].options[0]), exact: true }).last().isEnabled(), true,
      "Fresh batches start unanswered even after the eight-exchange display cap rotates");
    assert.equal(await panel.getByText(`${t(S.lesson.question)} 1 ${t(S.lesson.of)} 2`, { exact: true }).count(), Math.min(n + 2, 8));
    assert.equal(await panel.getByText(t(S.lesson.practiceScore), { exact: true }).count(), 0);
  }
  assert(state.asks.at(-1).practice_avoid.includes(items[0].question.en), "Session novelty retains questions removed from the visible chat log");
  await button(S.lesson.continue).click();
  await button(S.lesson.startQuiz).click();
  assert.equal(await panel.getByText(t(S.lesson.aiPractice), { exact: true }).first().isVisible(), false);
  assert.equal(await panel.getByRole("button", { name: t(S.lesson.morePractice), exact: true }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: t(S.lesson.testMe), exact: true }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: t(S.lesson.showPracticeAnswer), exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS practice: fresh generation, session exclusions/reset, separate bilingual answer/help groups, hint/reveal, score/retry, no stored fallback or progress writes, assessment isolation");
}

async function checkFirstSteps(f, label) {
  const { page, context, errors, t, button, goto } = f;
  await goto("/compare/?tab=why");
  await page.waitForURL(/\/first-steps\//);
  await page.locator(".first-path").waitFor();
  assert.equal(await page.locator('nav a[href="/compare/"]').count(), 0);
  assert(await page.locator('nav a[href="/first-steps/"][aria-current="page"]').count());
  const learningBefore = await page.evaluate(uid => localStorage.getItem(`yaqin.progress.${uid}`), firstId);
  const practiceBefore = await page.evaluate(uid => localStorage.getItem(`yaqin.first-steps.${uid}`), firstId);
  const path = page.locator(".first-path");
  await path.getByRole("link", { name: new RegExp(t(PRACTICE_STAGES[1].title)) }).click();
  await page.getByRole("heading", { name: t(PRACTICE_STAGES[1].activities[0].steps[0].title), exact: true }).waitFor();
  const detail = page.locator("#first-practice-detail");
  await detail.getByRole("button", { name: t(F.next), exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: t(PRACTICE_STAGES[1].activities[0].steps[1].title), exact: true }).waitFor();
  await detail.locator(".first-walkthrough button").last().click();
  assert.equal(await detail.getByRole("button", { name: /I practised this|Practise again|تدرّبت على هذا|تدرّب مجددًا/ }).count(), 0);
  await screenshot(page, `first-steps-wudu-${label}`);
  await page.reload();
  await page.getByRole("heading", { name: t(PRACTICE_STAGES[1].activities[0].steps[0].title), exact: true }).waitFor();
  await goto("/first-steps/?step=prayer");
  await page.getByRole("button", { name: new RegExp(t(PRACTICE_STAGES[2].activities[2].title)) }).click();
  const prayerDetail = page.locator("#daily-prayer-walkthrough");
  for (const prayer of DAILY_PRAYERS) {
    await detail.getByRole("button", { name: new RegExp(`^${t(prayer.title)}`) }).click();
    await prayerDetail.getByRole("heading", { name: t(prayer.title), exact: true }).waitFor();
    const steps = dailyPrayerSteps(prayer);
    await prayerDetail.getByRole("heading", { name: t(steps[0].title), exact: true }).waitFor();
    assert(await prayerDetail.getByRole("button", { name: t(F.back), exact: true }).isDisabled());
    for (const phase of [...new Set(steps.map(s => t(s.phase)))]) {
      await prayerDetail.locator("nav").getByRole("button", { name: phase, exact: true }).click();
      const start = steps.find(s => t(s.phase) === phase);
      await prayerDetail.getByRole("heading", { name: t(start.title), exact: true }).waitFor();
    }
    assert(await prayerDetail.getByRole("button", { name: t(F.next), exact: true }).isDisabled());
    await prayerDetail.getByRole("button", { name: t(F.back), exact: true }).click();
    await prayerDetail.getByRole("heading", { name: t(steps.at(-2).title), exact: true }).waitFor();
  }
  await screenshot(page, `first-steps-prayers-${label}`);
  await goto("/first-steps/?step=foundations");
  for (const card of PRACTICE_STAGES[0].activities[0].cards) {
    await page.getByText(t(card.body), { exact: true }).waitFor();
    assert(await detail.getByText(t(card.meaning), { exact: true }).isVisible());
    assert(await detail.getByText(card.pronunciation, { exact: true }).isVisible());
    assert(await detail.locator('p[lang="ar"]').filter({ hasText: card.words }).isVisible());
  }
  assert.equal(await detail.getByRole("button").count(), 0);
  const askKhaled = page.getByRole("link", { name: t(F.askKhaled), exact: true });
  assert.equal(await askKhaled.getAttribute("href"), "/ask/?track=first-steps");
  await screenshot(page, `first-steps-shahada-${label}`);
  await askKhaled.click();
  await page.waitForURL(/\/ask\/\?track=first-steps$/);
  await page.getByText(t(PERSONAS.khaled.welcome), { exact: true }).waitFor();
  await goto("/first-steps/?step=everyday-life");
  await page.getByRole("button", { name: t(PRACTICE_STAGES[4].activities[0].options[0].title), exact: true }).click();
  await page.getByText(t(PRACTICE_STAGES[4].activities[0].options[0].feedback), { exact: true }).waitFor();
  await screenshot(page, `first-steps-family-${label}`);
  await goto("/first-steps/?step=community");
  for (const item of PRACTICE_STAGES[5].activities[0].items) await page.getByText(t(item), { exact: true }).waitFor();
  assert.equal(await detail.getByRole("checkbox").count(), 0);
  assert.equal(await detail.getByRole("button").count(), 0);
  const centerLink = detail.getByRole("link", { name: t({ en: "Find a center near me", ar: "ابحث عن مركز قريب مني" }), exact: true });
  assert.equal(await centerLink.getAttribute("href"), `https://dawa.center/islamic_centers?lang=${f.lang}`);
  assert.equal(await centerLink.getAttribute("target"), "_blank");
  await screenshot(page, `first-steps-community-${label}`);
  await page.reload();
  await centerLink.waitFor();
  const arabic = "quran/ar/kfgqpc-hafs-v30", english = "quran/en/sahih-international-13638", reciter = "quran/audio/alafasy-hafs-mp3quran-123";
  let unavailable = true;
  await context.route("**/data/quran/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (unavailable) return route.fulfill({ status: 503, json: {} });
    if (path.endsWith("index.json")) return route.fulfill({ json: { surahs: [], editions: { [arabic]: { title: "Arabic snapshot" }, [english]: { title: "Published translation snapshot" } }, recitations: { [reciter]: { surahs: [1], reciter: "Mishary Alafasy", reciter_ar: "مشاري العفاسي", provider: "mp3quran.net" } } } });
    if (path.endsWith("/surahs/1.json")) return route.fulfill({ json: Array.from({ length: 7 }, (_, i) => ({ id: `verse-${i + 1}`, verse_key: `1:${i + 1}`, surah_number: 1, ayah_number: i + 1, text: snapshot.sources[`quran:1:${i + 1}`][path.includes("/ar/") ? "text_ar" : "text_en"] })) });
    if (path.endsWith("/timings/1.json")) return route.fulfill({ json: Array.from({ length: 7 }, (_, i) => [i * 1000, (i + 1) * 1000]) });
    return route.fallback();
  });
  // Silent native media exercises playback, seeking and cleanup without contacting a service.
  const pcm = Buffer.alloc(44 + 8000 * 2 * 10); pcm.write("RIFF"); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write("WAVEfmt ", 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(pcm.length - 44, 40);
  await context.route("**/resources/quran/audio/**", route => route.fulfill({ contentType: "audio/wav", body: pcm }));
  await goto("/first-steps/?step=recitation");
  await button(F.retry).waitFor();
  unavailable = false;
  await button(F.retry).click();
  await detail.locator('.first-verse .quran').waitFor();
  await page.getByRole("button", { name: t({ en: "Listen to this verse", ar: "استمع إلى الآية" }), exact: true }).click();
  await page.waitForFunction(() => document.querySelector("audio") && !document.querySelector("audio").paused);
  await page.getByRole("button", { name: t({ en: "Next verse", ar: "الآية التالية" }), exact: true }).click();
  assert(await page.locator("audio").evaluate(audio => audio.paused), "Changing verses pauses the previous recitation");
  assert.equal(await detail.getByRole("button", { name: /Hide the meaning|أخفِ المعنى/ }).count(), 0);
  assert.equal(await detail.getByRole("button", { name: t({ en: "Practise from memory", ar: "تدرّب من الذاكرة" }), exact: true }).count(), 0);
  assert.equal(await detail.getByRole("link", { name: t({ en: "Go to Quran & practise", ar: "انتقل إلى القرآن وتدرّب" }), exact: true }).getAttribute("href"), "/quran/?s=1&v=2");
  assert.equal(await detail.locator('.first-verse .quran').textContent(), snapshot.sources['quran:1:2'].text_ar, "Scripture comes directly from the published dataset");
  assert.equal(await page.evaluate(uid => localStorage.getItem(`yaqin.progress.${uid}`), firstId), learningBefore, "Practice never completes a course or changes assessment progress");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
  await goto("/first-steps/?step=unknown");
  await page.getByRole("heading", { name: t(PRACTICE_STAGES[0].title), exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(uid => localStorage.getItem(`yaqin.first-steps.${uid}`), firstId), practiceBefore);
  console.log(`PASS first steps ${label}: journey redirect, keyboard walkthrough, five prayers, optional community/center link, meaning/scenario, recitation recovery/playback/cleanup, no progress writes`);
}

async function checkBranding(f, label, routes) {
  const { page, goto, errors } = f;
  for (const path of routes) {
    await goto(path);
    const logo = page.locator(".brand-logo:visible img").first();
    await logo.waitFor();
    await logo.evaluate(img => img.decode());
    const horizontal = await logo.evaluate(img => !!img.closest(".site-header, aside"));
    assert.equal(await logo.getAttribute("src"), horizontal ? "/yaqeen-logo-horizontal.png" : "/yaqeen-logo.png");
    const box = await logo.boundingBox();
    const ratio = await logo.evaluate(img => img.naturalWidth / img.naturalHeight);
    assert(Math.abs(box.width - box.height * ratio) < 1, "The logo keeps its aspect ratio");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#075aab");
    const icons = await page.locator('link[rel="icon"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("sizes")));
    const appleIcons = await page.locator('link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("sizes")));
    assert(icons.length && icons.every(size => size === "256x256"));
    assert(appleIcons.length && appleIcons.every(size => size === "180x180"));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: no horizontal overflow`);
    if (["/", "/signin/", "/first-steps/", "/studio/"].includes(path)) await screenshot(page, `branding-${path.replaceAll("/", "") || "home"}-${label}`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS branding ${label}: rectangular header/sidebar logo, compact square logo, browser/home-screen icons, theme colour and responsive layouts`);
}

async function checkWorship(f, label) {
  const { page, goto, t, errors, state } = f;
  await goto("/learn/");
  const openPlan = page.getByRole("link", { name: new RegExp(t({ en: "Open my daily plan", ar: "افتح خطتي اليومية" })) });
  await openPlan.waitFor();
  assert.equal(await page.locator('nav a[href="/worship/"]').count(), 2);
  await openPlan.click();
  await page.getByRole("heading", { name: t(W.prayers), exact: true }).waitFor();
  const step = async index => {
    const editDay = page.getByRole("button", { name: t(W.editDay), exact: true });
    if (await editDay.count()) await editDay.click();
    await page.locator(".worship-step-nav button").nth(index).click();
  };
  const checkbox = id => page.getByRole("checkbox", { name: t(HABITS.find(h => h.id === id).title), exact: true });
  const reflection = id => page.getByRole("textbox", { name: t(REFLECTIONS.find(p => p.id === id).title), exact: true });
  const counter = id => page.getByRole("region", { name: t(COUNTERS.find(c => c.id === id).title), exact: true });
  const count = id => counter(id).getByRole("spinbutton");
  const prayer = id => page.getByRole("group", { name: t(PRAYERS.find(p => p.id === id).title), exact: true });
  const days = page.getByRole("group", { name: t(W.week), exact: true }).getByRole("button");
  const date = await page.locator(".worship-hero time").getAttribute("datetime");
  const key = `yaqin.worship.${firstId}.${date}`;
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} fits mobile and RTL`);
    await screenshot(page, `worship-${name}-${label}`);
  }
  assert.equal(await page.getByRole("radio").count(), 15, "Exactly three options for each of five prayers");
  await prayer("fajr").getByRole("radio", { name: t(W.prayed), exact: true }).check();
  await prayer("dhuhr").getByRole("radio", { name: t(W.notYet), exact: true }).check();
  await prayer("asr").getByRole("radio", { name: t(W.missed), exact: true }).check();
  const nawafil = page.getByRole("spinbutton", { name: t(W.nawafilCount), exact: true });
  await nawafil.fill("2");
  await page.getByRole("button", { name: `+${(1).toLocaleString(f.lang === "ar" ? "ar" : "en")} · ${t(W.nawafil)}`, exact: true }).click();
  assert.equal(await nawafil.inputValue(), "3");
  await page.getByRole("button", { name: `${t(W.fewer)} · ${t(W.nawafil)}`, exact: true }).click();
  assert.equal(await nawafil.inputValue(), "2");
  assert.equal(await page.locator("#worship-history-title").count(), 0, "There is no separate history section");
  await page.getByRole("textbox", { name: t(W.intention), exact: true }).fill("Be present today");
  assert.equal(await saved(), null, "Draft answers do not register an entry");
  await capture("prayers");
  await page.getByRole("button", { name: t(W.next), exact: true }).click();
  await page.getByRole("heading", { name: t(W.checklist), exact: true }).waitFor();
  await checkbox("morning").check(); await checkbox("quran").check();
  assert.equal(await page.getByRole("spinbutton").count(), 3, "Only istighfar, tasbih and salawat have counters");
  const amount = n => `+${n.toLocaleString(f.lang === "ar" ? "ar" : "en")}`;
  await counter("istighfar").getByRole("button", { name: amount(10), exact: true }).click();
  await counter("istighfar").getByRole("button", { name: amount(1), exact: true }).click();
  await counter("tasbih").getByRole("button", { name: amount(100), exact: true }).click();
  await count("salawat").fill("7");
  assert.equal(await count("istighfar").inputValue(), "11");
  assert.equal(await count("tasbih").inputValue(), "100");
  assert.equal(await checkbox("salawat").isChecked(), true);
  const minus = counter("istighfar").getByRole("button", { name: `${t(W.fewer)} · ${t(COUNTERS[0].title)}`, exact: true });
  await minus.click();
  assert.equal(await count("istighfar").inputValue(), "10");
  assert((await minus.locator("svg").boundingBox()).width >= 16);
  await page.getByRole("group", { name: t(W.sadaqah), exact: true }).getByRole("radio", { name: t(W.yes), exact: true }).check();
  await capture("worship");
  await page.reload();
  await prayer("fajr").waitFor();
  assert.equal(await prayer("fajr").getByRole("radio", { name: t(W.prayed), exact: true }).isChecked(), true);
  assert.equal(await nawafil.inputValue(), "2", "Voluntary prayers survive a refresh");
  await step(1);
  assert.equal(await checkbox("morning").isChecked(), true);
  assert.equal(await count("salawat").inputValue(), "7", "Draft counters survive a refresh");
  await step(2);
  await reflection("gratitude").fill("A peaceful morning");
  await reflection("care").fill("Support from my family");
  await reflection("tomorrow").fill("Help someone");
  await capture("gratitude");
  await step(3);
  await page.getByRole("textbox", { name: t(W.note), exact: true }).fill("A day to remember");
  assert.equal(await saved(), null);
  await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByText(t(W.savedMessage), { exact: true }).waitFor();
  assert.equal((await saved()).counts.tasbih, 100);
  assert.equal((await saved()).sadaqah, true);
  assert.equal((await saved()).prayers.asr, "missed");
  assert.equal((await saved()).nawafil, 2);
  assert.equal((await saved()).reflections.gratitude, "A peaceful morning");
  assert.equal(await page.evaluate(key => localStorage.getItem(`${key}.draft`), key), null);
  await capture("review");
  // Saving again updates one registered day; interim edits remain a draft.
  await step(1); await checkbox("morning").uncheck();
  assert((await saved()).checked.includes("morning"));
  await days.last().click();
  await page.getByRole("heading", { name: t(W.results), exact: true }).waitFor();
  assert.equal(await page.getByText(t(HABITS.find(h => h.id === "morning").title), { exact: true }).count(), 1, "Saved results do not display unsaved draft changes");
  assert.equal(await page.getByRole("textbox").count(), 0, "The saved day is displayed without form fields");
  await step(3); await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByText(t(W.savedMessage), { exact: true }).waitFor();
  assert(!(await saved()).checked.includes("morning"));
  assert.equal(await page.locator(".worship-day-dot.is-saved").count(), 1);
  await page.reload();
  await prayer("fajr").waitFor();
  await days.last().click();
  await page.getByRole("heading", { name: t(W.results), exact: true }).waitFor();
  assert.equal(await page.getByText("A day to remember", { exact: true }).count(), 1);
  await page.getByRole("button", { name: `${t(W.edit)} · ${t(W.noteLabel)}`, exact: true }).click();
  const noteEditor = page.getByRole("textbox", { name: t(W.note), exact: true });
  assert.equal(await noteEditor.inputValue(), "A day to remember", "The note Edit action opens the existing note");
  await page.waitForFunction(() => document.activeElement?.id === "worship-note");
  await capture("note-edit");
  await step(0);
  await days.last().click();
  await page.getByRole("heading", { name: t(W.results), exact: true }).waitFor();
  await step(3);
  // A storage write failure retains the current text so it can be saved again.
  await page.evaluate(() => {
    window.originalStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("yaqin.worship.") && key.endsWith(".draft")) throw new DOMException("Storage full", "QuotaExceededError"); return window.originalStorageWrite.call(this, key, value); };
  });
  await page.getByRole("textbox", { name: t(W.note), exact: true }).fill("Kept through a save error");
  await page.getByText(t(W.saveError), { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: t(W.note), exact: true }).inputValue(), "Kept through a save error");
  await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageWrite; });
  await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByText(t(W.savedMessage), { exact: true }).waitFor();
  assert.equal((await saved()).note, "Kept through a save error");
  // A failed backend write never registers the draft or erases its answers.
  state.worshipSaveFails = true;
  await page.getByRole("textbox", { name: t(W.note), exact: true }).fill("Retry this cloud save");
  await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByText(t(W.saveError), { exact: true }).waitFor();
  assert.equal(state.worship.get(`${firstId}:${date}`).note, "Kept through a save error");
  assert.equal(await page.getByRole("textbox", { name: t(W.note), exact: true }).inputValue(), "Retry this cloud save");
  state.worshipSaveFails = false;
  state.worshipGate = gate();
  await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByRole("button", { name: t(W.saving), exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: t(W.note), exact: true }).isDisabled(), true);
  state.worshipGate.release(); state.worshipGate = null;
  await page.getByText(t(W.savedMessage), { exact: true }).waitFor();
  assert.equal(state.worship.size, 1, "Repeated saves update one database row");
  // A fresh browser cache loads the account's database record.
  await page.evaluate(key => localStorage.removeItem(key), key);
  await page.reload(); await prayer("fajr").waitFor();
  assert.equal(await nawafil.inputValue(), "2");
  await days.last().click();
  await page.getByRole("heading", { name: t(W.results), exact: true }).waitFor();
  assert.equal(await page.getByText("Retry this cloud save", { exact: true }).count(), 1);
  state.worshipLoadFails = true;
  await page.reload(); await page.getByText(t(W.loadError), { exact: true }).waitFor();
  state.worshipLoadFails = false;
  await page.getByRole("button", { name: t(W.retry), exact: true }).click();
  await prayer("fajr").waitFor();
  await days.nth(5).click();
  assert.equal(await nawafil.inputValue(), "0", "Voluntary prayer counts belong to the selected day");
  await step(1);
  assert.equal(await count("istighfar").inputValue(), "0");
  await checkbox("evening").check();
  await page.getByRole("group", { name: t(W.sadaqah), exact: true }).getByRole("radio", { name: t(W.no), exact: true }).check();
  await step(3);
  await page.getByRole("button", { name: t(W.save), exact: true }).click();
  await page.getByText(t(W.savedMessage), { exact: true }).waitFor();
  assert.equal(await page.locator(".worship-day-dot.is-saved").count(), 2);
  await days.last().click();
  await days.nth(5).click();
  await page.getByRole("heading", { name: t(W.results), exact: true }).waitFor();
  assert.equal(await page.locator(".worship-review-chip").getByText(t(HABITS.find(h => h.id === "evening").title), { exact: true }).count(), 1);
  await capture("saved-day");
  await days.last().click(); await step(1);
  assert.equal(await checkbox("evening").isChecked(), false);
  assert.equal(await count("istighfar").inputValue(), "10");
  // Midnight changes the local day while leaving authentication clocks untouched.
  await page.evaluate(() => {
    const NativeDate = window.Date;
    const nextDay = new NativeDate(); nextDay.setDate(nextDay.getDate() + 1);
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [nextDay.getTime()])); } };
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByRole("heading", { name: t(W.prayers), exact: true }).waitFor();
  await step(1);
  assert.equal(await count("istighfar").inputValue(), "0");
  await days.nth(5).click(); await step(1);
  assert.equal(await count("istighfar").inputValue(), "10");
  await page.evaluate(() => { localStorage.removeItem("sb-127-auth-token"); sessionStorage.setItem("fixture-seeded", "1"); });
  await goto("/signin/");
  await page.getByRole("textbox", { name: t(S.auth.email), exact: true }).fill("second@example.test");
  await page.getByLabel(t(S.auth.password), { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: t(S.auth.signIn), exact: true }).click();
  await page.waitForURL(/\/(?:app|learn|journey)\//);
  await goto("/worship/");
  await prayer("fajr").waitFor();
  assert.equal(await prayer("fajr").getByRole("radio", { name: t(W.prayed), exact: true }).isChecked(), false);
  await step(1); assert.equal(await count("istighfar").inputValue(), "0");
  await step(2); assert.equal(await reflection("gratitude").inputValue(), "");
  assert.equal(await page.locator(".worship-day-dot.is-saved").count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS worship ${label}: prayers/Nawafil/dhikr, private drafts, database save/update/reload, date-selected results, cloud failure/retry, midnight and account/layout boundaries`);
}

async function checkAsk(f, label, track = "explore", companion = false) {
  const { page, state, t, goto } = f;
  const persona = companion ? PERSONAS.mariam : PERSONAS[track === "explore" ? "rayen" : track === "first-steps" ? "khaled" : "ibrahim"];
  await goto(companion ? `/course/?id=a&track=${track}` : `/ask/?track=${track}`);
  const chat = companion ? page.locator("#companion") : page.locator("main");
  const field = () => chat.getByRole("textbox", { name: t(companion ? S.lesson.companionPlaceholder : S.ask.placeholder), exact: true });
  const send = () => chat.getByRole("button", { name: t(S.ask.send), exact: true });
  await chat.getByText(t(companion ? S.lesson.companionWelcome : persona.welcome), { exact: true }).waitFor();
  if (companion) {
    for (const name of [S.lesson.explainAction, S.lesson.keyPointsAction, S.lesson.wordAction, S.lesson.testMe]) {
      assert(await chat.getByRole("button", { name: t(name), exact: true }).isVisible(), "The welcome view offers the four shortcuts");
    }
    const header = chat.locator(":scope > header");
    assert((await header.boundingBox()).height <= 64, "Mariam has a compact single-line header");
    assert.equal(await header.getByText(t(S.lesson.companion), { exact: true }).count(), 0, "The role subtitle is removed");
    assert.equal(await header.getByText(t(bi("Page a")), { exact: false }).count(), 0, "The page context row is removed");
    assert.equal(await header.locator("abbr").isVisible(), true, "The AI badge remains visible on mobile");
  }
  if (!companion && page.viewportSize().width >= 1024) {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector("#ask-sources").hidden);
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => !document.querySelector("#ask-sources").hidden);
  }
  const startingHeight = (await chat.boundingBox()).height;
  const source = Object.values(snapshot.sources).find((s) => s.kind === "quran");
  const unused = Object.values(snapshot.sources).find((s) => s.kind === "hadith");
  const response = (title) => ({ ...answer(""),
    answer: [{ type: "text", text: `## ${title}\n\nHere is a **clear explanation** with *emphasis*.\n\n- First point\n- Second point\n\n${Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}. A longer explanation that you can read at your own pace.`).join("\n\n")}` }, { type: "source", id: source.id }, { type: "source", id: source.id }, { type: "source", id: "missing" }],
    sources: { [source.id]: source, [unused.id]: unused }, follow_ups: ["Tell me more"] });
  state.askResponse = response("Start of the first reply");
  await field().fill("What is Islam?");
  await send().click();
  await page.getByRole("heading", { name: "Start of the first reply", exact: true }).waitFor();
  const log = chat.getByRole("log");
  const portrait = await (companion ? chat : page).locator(`img[src="${persona.avatar}"]`).first().boundingBox();
  assert.equal(portrait.width, 32, "The chat uses a small guide portrait");
  const atStart = () => log.evaluate((el, companion) => {
    const reply = el.querySelector("h3").closest(companion ? "[data-chat-reply]" : "[role=log] > div");
    const top = reply.getBoundingClientRect().top - el.getBoundingClientRect().top;
    return Math.abs(top - parseFloat(getComputedStyle(el).paddingTop)) < 2;
  }, companion);
  assert.equal(await atStart(), true, "A long reply starts at its beginning");
  const wordDelays = await log.locator(".answer-word").evaluateAll((words) => words.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
  assert(wordDelays.length > 100 && wordDelays[1] > wordDelays[0], "New replies reveal words in order");
  assert(Math.max(...wordDelays) < 2, "Long replies finish their reveal promptly");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert(await log.locator(".answer-word").evaluateAll((words) => words.every((el) => getComputedStyle(el).animationName === "none" && getComputedStyle(el).opacity === "1")), "Reduced motion displays the complete reply immediately");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await page.getByText(t(S.ask.tier.A), { exact: true }).count(), 0);
  assert.equal(await log.locator("footer[aria-label], details").count(), 0, "Sources stay separate from the reply");
  if (!companion) {
    const sourcesButton = page.getByRole("button", { name: t(S.ask.related), exact: true });
    const sidebar = chat.getByRole("complementary", { name: t(S.ask.related), exact: true });
    if (page.viewportSize().width < 1024) {
      assert.equal(await sidebar.isVisible(), false, "Mobile sources start closed");
      await sourcesButton.click();
    }
    await sidebar.waitFor();
    const evidence = sidebar.locator(":scope > div details");
    assert.equal(await evidence.count(), 1, "Only known cited sources appear once");
    assert.equal(await evidence.getAttribute("open"), null, "Evidence starts collapsed");
    await evidence.locator("summary").click();
    assert(await sidebar.getByText(source.text_ar, { exact: false }).isVisible(), "Original evidence opens on demand");
    await sidebar.locator("summary").click();
    const panelBox = await sidebar.boundingBox();
    const chatBox = await log.locator("..").boundingBox();
    const header = page.locator("main").locator("..").locator(":scope > header");
    assert((await header.boundingBox()).height <= 72, "The compact header leaves room for the conversation");
    assert.equal(await log.locator("h3 + p").first().evaluate((el) => getComputedStyle(el).fontSize), "16px", "Reply text uses a readable 16px size");
    if (page.viewportSize().width >= 1024) {
      assert(Math.abs(panelBox.y - chatBox.y) < 2, "Sources sit beside the chat on desktop");
      assert(panelBox.x >= chatBox.x + chatBox.width, "Sources stay on the right in both languages");
      assert(panelBox.width <= 224, "The sources rail stays narrow");
      assert(chatBox.width > panelBox.width * 2, "The conversation gets most of the available width");
      const name = await header.getByRole("heading", { level: 2 }).boundingBox();
      const role = await header.getByText(t(persona.role), { exact: false }).boundingBox();
      assert(Math.abs(name.y - role.y) < 10, "Guide name and journey share one line on desktop");
    } else {
      assert(panelBox.x >= chatBox.x && panelBox.x + panelBox.width <= chatBox.x + chatBox.width + 1, "Mobile sources overlay the workspace");
      await screenshot(page, `ask-sources-${label}`);
    }
    // Header controls work with the keyboard and return the rail's width to the chat.
    await sourcesButton.focus();
    await page.keyboard.press("Enter");
    assert.equal(await sourcesButton.getAttribute("aria-expanded"), "false");
    assert.equal(await evidence.isVisible(), false);
    if (page.viewportSize().width >= 1024) assert((await log.locator("..").boundingBox()).width >= chatBox.width + 220, "Collapsing sources widens the conversation");
    await page.keyboard.press("Enter");
    assert.equal(await sourcesButton.getAttribute("aria-expanded"), "true");
    await sidebar.getByRole("button", { name: t(S.ask.closeSources), exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal(await sidebar.isVisible(), false);
    assert(await sourcesButton.evaluate((el) => el === document.activeElement), "Closing sources restores focus to its trigger");
    const notice = chat.locator("form details");
    assert.equal(await notice.getAttribute("open"), null, "The full AI notice starts collapsed");
    await notice.locator("summary").click();
    assert(await notice.getByText(t(S.ask.disclaimer), { exact: true }).isVisible(), "The full notice remains available");
    await notice.locator("summary").click();
    assert(await field().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom < innerHeight && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
    }), "The composer is visible without scrolling the page");
    if (page.viewportSize().width >= 1024) await sourcesButton.click();
  }
  assert.equal(await log.locator("ul li").count(), 2);
  await screenshot(page, `ask-reply-${label}`);
  if (companion) await chat.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const documentTop = await page.evaluate(() => window.scrollY);
  await log.evaluate((el) => { el.scrollTop += 180; });
  const scrolled = await log.evaluate((el) => el.scrollTop);
  await field().fill("Another question");
  assert.equal(await log.evaluate((el) => el.scrollTop), scrolled, "Typing does not move the reply");
  state.askResponse = response("Start of the second reply");
  await send().click();
  await page.getByRole("heading", { name: "Start of the second reply", exact: true }).waitFor();
  assert.equal(state.asks.at(-1).history.length, 2, "Follow-ups retain context during the current visit");
  const secondTop = await log.evaluate((el, companion) => {
    const reply = el.querySelectorAll("h3")[1].closest(companion ? "[data-chat-reply]" : "[role=log] > div");
    return reply.getBoundingClientRect().top - el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).paddingTop);
  }, companion);
  assert(Math.abs(secondTop) < 2, "The next reply also starts at its beginning");
  assert.equal(await page.evaluate(() => window.scrollY), documentTop, "Only the chat scrolls when a reply arrives");
  await log.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  assert(await log.evaluate((el) => el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 2), "The reader can scroll to the end");
  await log.getByRole("button", { name: "Tell me more", exact: true }).last().waitFor({ state: "visible" });
  if (!companion) {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width < 1024 ? 320 : viewport.width, height: 600 });
    assert(await field().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
    }), "The workspace composer stays visible on short and narrow screens");
    assert((await send().boundingBox()).height >= 44, "Send remains easy to tap");
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, "The chat owns vertical scrolling");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "The compact header fits at 320px");
    const nameBox = await page.locator("main").locator("..").locator(":scope > header h2").boundingBox();
    const sourcesBox = await page.getByRole("button", { name: t(S.ask.related), exact: true }).boundingBox();
    assert(nameBox.x + nameBox.width <= sourcesBox.x || sourcesBox.x + sourcesBox.width <= nameBox.x, "Guide text does not overlap header controls");
    if (viewport.width < 1024) {
      const account = page.locator("main").locator("..").locator(":scope > header details");
      await account.locator("summary").click();
      assert(await account.getByRole("link", { name: t(S.settings.title), exact: true }).isVisible(), "Mobile settings remain accessible");
      assert(await account.getByRole("button", { name: t(S.nav.signOut), exact: true }).isVisible(), "Mobile sign-out remains accessible");
      await account.locator("summary").click();
      await screenshot(page, `ask-narrow-${label}`);
    }
    await page.setViewportSize(viewport);
  }
  if (companion) {
    assert(Math.abs((await chat.boundingBox()).height - startingHeight) < 2, "Long replies do not grow Mariam's panel");
    for (const name of [S.lesson.explainAction, S.lesson.keyPointsAction, S.lesson.wordAction, S.lesson.testMe]) {
      assert.equal(await chat.getByRole("button", { name: t(name), exact: true }).count(), 0, "The four shortcuts disappear after a reply");
    }
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width < 1024 ? 320 : viewport.width, height: 600 });
    await chat.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await log.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const composerVisible = () => field().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
    });
    assert(await composerVisible(), "The composer stays visible on a short screen");
    assert((await field().boundingBox()).height <= 60, "The resting composer uses one compact row");
    assert((await send().boundingBox()).height >= 44, "Send has a comfortable touch target");
    const notice = chat.locator('[aria-describedby="companion-ai-notice"]');
    const tooltip = chat.getByRole("tooltip");
    assert.equal(await chat.locator("details").count(), 0, "The notice is not an accordion");
    assert.equal(await tooltip.isVisible(), false, "The notice is quiet at rest");
    const panelHeight = (await chat.boundingBox()).height;
    const logHeight = (await log.boundingBox()).height;
    await notice.hover();
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await tooltip.textContent(), t(S.ask.disclaimer), "Hover shows the complete notice");
    assert.equal((await chat.boundingBox()).height, panelHeight);
    assert.equal((await log.boundingBox()).height, logHeight, "The tooltip does not consume reading space");
    const tipBox = await tooltip.boundingBox(), chatBox = await chat.boundingBox();
    assert(tipBox.x >= chatBox.x && tipBox.x + tipBox.width <= chatBox.x + chatBox.width, "The tooltip fits narrow and RTL panels");
    assert(tipBox.y + tipBox.height <= (await field().boundingBox()).y, "The tooltip keeps the composer clear");
    await chat.locator(":scope > header").hover();
    await tooltip.waitFor({ state: "hidden" });
    await notice.focus();
    await tooltip.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await tooltip.isVisible(), false, "Escape dismisses the tooltip without leaving keyboard focus");
    await field().focus();
    await field().fill("First line");
    await field().press("Shift+Enter");
    await field().press("a");
    assert.equal(await field().inputValue(), "First line\na", "Shift+Enter adds a new line");
    await field().fill("");
    await field().evaluate((el) => el.blur());
    assert.equal(await field().evaluate((el) => getComputedStyle(el).outlineStyle), "none", "The resting composer has no focus outline");
    await page.screenshot({ path: `${output}/companion-composer-${label}.png`, animations: "disabled" });
    state.askGate = gate();
    state.askFails = true;
    const requested = state.asked;
    await field().fill("Question that will fail");
    await field().press("Enter");
    await until(() => state.asked === requested + 1);
    await field().fill("My next question draft");
    state.askGate.release(); state.askGate = null;
    await chat.getByRole("alert").waitFor();
    assert.equal(await field().inputValue(), "My next question draft", "A failed reply preserves the new draft");
    state.askFails = false;
    state.askResponse = answer("Recovered reply");
    await chat.getByRole("button", { name: t(S.ask.retry), exact: true }).click();
    await chat.getByText("Recovered reply", { exact: true }).waitFor();
    assert.equal(state.asks.at(-1).question, "Question that will fail", "Retry sends the original failed question");
    assert.equal(state.asks.at(-1).card_id, "a-one");
    assert.equal(await field().inputValue(), "My next question draft", "Retry also preserves the new draft");
    await chat.getByRole("button", { name: t(S.ask.newChat), exact: true }).click();
    assert.equal(await log.evaluate((el) => el.scrollTop), 0, "New chat returns the welcome view to its beginning");
    for (const name of [S.lesson.explainAction, S.lesson.keyPointsAction, S.lesson.wordAction, S.lesson.testMe]) {
      assert(await chat.getByRole("button", { name: t(name), exact: true }).isVisible(), "New chat restores the four shortcuts");
    }
    await chat.getByRole("button", { name: t(S.lesson.wordAction), exact: true }).click();
    assert.equal(await send().isDisabled(), true, "Explaining a word waits for the learner to supply it");
    assert.equal(await chat.evaluate((el) => el.scrollWidth > el.clientWidth), false, "The composer and tooltip fit at 320px");
    await page.setViewportSize(viewport);
  } else {
    // Send real SSE events through the fetch boundary, with a final event held until the reader scrolls.
    const draft = response("Streamed reply");
    await page.evaluate((draft) => {
      const original = window.fetch;
      window.fetch = (url, init) => {
        if (!String(url).endsWith("/api/tutor/ask/stream")) return original(url, init);
        const encoder = new TextEncoder();
        return Promise.resolve(new Response(new ReadableStream({ start(stream) {
          stream.enqueue(encoder.encode(`event: draft\ndata: ${JSON.stringify(draft)}\n\n`));
          window.finishChatStream = () => {
            stream.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify({ ...draft, follow_ups: ["Verification finished"] })}\n\n`));
            stream.close();
            window.fetch = original;
          };
        } }), { headers: { "Content-Type": "text/event-stream" } }));
      };
    }, draft);
    await field().fill("A streamed question");
    await send().click();
    await log.getByText(t(S.ask.verifying), { exact: true }).waitFor();
    assert.equal(await log.getByText(t(S.ask.thinking), { exact: true }).count(), 0, "A visible draft uses only the verification status");
    await log.evaluate((el) => { el.scrollTop += 160; });
    const readingPosition = await log.evaluate((el) => el.scrollTop);
    await page.evaluate(() => window.finishChatStream());
    await log.getByRole("button", { name: "Verification finished", exact: true }).waitFor();
    assert(Math.abs(await log.evaluate((el) => el.scrollTop) - readingPosition) < 2, "Verification preserves a reader's manual scroll position");
    assert.equal(await log.locator(".answer-word").count(), 0, "Verified edits do not replay the reveal or older replies");
    const fresh = async () => {
      await chat.getByText(t(persona.welcome), { exact: true }).waitFor();
      assert.equal(await field().inputValue(), "", "A new visit also discards the draft question");
      assert.equal(await page.getByRole("button", { name: t(S.ask.newChat), exact: true }).count(), 0);
      const trusted = chat.getByRole("complementary", { name: t(S.ask.trusted), exact: true });
      if (!await trusted.isVisible()) await page.getByRole("button", { name: t(S.ask.trusted), exact: true }).click();
      await trusted.waitFor();
      assert.equal(await trusted.locator(":scope > div details").count(), 0, "A new conversation clears its sources");
      if (page.viewportSize().width < 1024) await trusted.getByRole("button", { name: t(S.ask.closeSources), exact: true }).click();
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("yaqin.ask."))), false, "No conversations remain in browser storage");
    };
    const question = async () => {
      state.askResponse = answer("Reply for this visit");
      await field().fill("Question for this visit");
      await send().click();
      await chat.getByText("Reply for this visit", { exact: true }).waitFor();
      assert.deepEqual(state.asks.at(-1).history, [], "A fresh conversation sends no previous history");
    };
    await field().fill("Unsent draft");
    await page.reload();
    await fresh();
    await question();
    await page.getByRole("button", { name: t(S.ask.newChat), exact: true }).click();
    await fresh();
    await question();
    await field().fill("Draft before leaving");
    await page.getByRole("link", { name: t(S.nav.library), exact: true }).first().click();
    await page.waitForURL(/\/library\//);
    await page.goBack();
    await fresh();
    // A delayed reply from the discarded visit must not reappear after returning.
    state.askGate = gate();
    const requested = state.asked;
    await field().fill("Pending question before leaving");
    await send().click();
    await until(() => state.asked === requested + 1);
    await page.getByRole("link", { name: t(S.nav.library), exact: true }).first().click();
    await page.waitForURL(/\/library\//);
    await page.goBack();
    await fresh();
    state.askGate.release();
    state.askGate = null;
    await question();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await fresh();
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Replies fit mobile and RTL");
  assert.deepEqual(f.errors, []);
  console.log(`PASS Ask ${label}: welcome, formatting, reply start and manual scrolling${companion ? ", compact header/composer, shortcut reset, hover/focus/Escape tooltip, multiline input and draft-safe retry" : ", separate sources panel, fresh chats after reload/navigation/Back, legacy storage removal and aborted replies"}`);
}

try {
  if (process.env.STUDIO_ACTIONS_ONLY === "1" || !["ASK_ONLY", "WORSHIP_ONLY", "BRANDING_ONLY", "FIRST_STEPS_ONLY", "PRACTICE_ONLY", "STUDIO_FILTERS_ONLY"].some((key) => process.env[key] === "1")) {
    for (const lang of ["en", "ar"]) for (const width of [1440, 1280, 390]) {
      const f = await setup(lang, width < 640, { seedTrack: "first-steps" });
      await f.page.setViewportSize({ width, height: 1000 });
      activePage = f.page; activeLabel = `${lang}-${width}`;
      await checkStudioActions(f, activeLabel); await f.context.close();
    }
  }
  if (!process.env.ASK_ONLY && !process.env.BRANDING_ONLY && !process.env.FIRST_STEPS_ONLY && !process.env.PRACTICE_ONLY && !process.env.STUDIO_FILTERS_ONLY && !process.env.STUDIO_ACTIONS_ONLY) {
    for (const [lang, mobile] of [["en", false], ["ar", false], ["en", true], ["ar", true]]) {
      const f = await setup(lang, mobile, { role: "learner", seedTrack: "deepen" });
      activePage = f.page; activeLabel = `${lang}-${mobile ? "mobile" : "desktop"}`;
      await checkWorship(f, activeLabel);
      await f.context.close();
    }
  }
  if (process.env.STUDIO_FILTERS_ONLY === "1" || !["ASK_ONLY", "WORSHIP_ONLY", "BRANDING_ONLY", "FIRST_STEPS_ONLY", "PRACTICE_ONLY", "STUDIO_ACTIONS_ONLY"].some((key) => process.env[key] === "1")) {
    for (const [lang, mobile] of [["en", false], ["ar", true]]) {
      const f = await setup(lang, mobile, { seedTrack: "first-steps" });
      activePage = f.page; activeLabel = `studio-filters-${lang}-${mobile ? "mobile" : "desktop"}`;
      await checkStudioFilters(f, activeLabel); await f.context.close();
    }
  }
  if (process.env.STUDIO_ACTIONS_ONLY === "1") {
    console.log("Studio action browser checks passed.");
  } else if (process.env.STUDIO_FILTERS_ONLY === "1") {
    console.log("Studio filter browser checks passed.");
  } else if (process.env.ASK_ONLY === "1") {
    for (const lang of ["en", "ar"]) for (const mobile of [false, true]) for (const guide of ["explore", "first-steps", "deepen", "companion"]) {
      const f = await setup(lang, mobile, { role: "learner", seedTrack: "explore" });
      activePage = f.page; activeLabel = `ask-${guide}-${mobile ? "mobile" : "desktop"}-${lang}`;
      await checkAsk(f, activeLabel, guide === "companion" ? "explore" : guide, guide === "companion");
      await f.context.close();
    }
  } else if (process.env.WORSHIP_ONLY === "1") {
    console.log("Worship browser checks passed.");
  } else if (process.env.BRANDING_ONLY === "1") {
    for (const lang of ["en", "ar"]) for (const mobile of [false, true]) for (const signedIn of [false, true]) {
      const f = await setup(lang, mobile, { signedIn, seedTrack: "first-steps" });
      activePage = f.page; activeLabel = `${signedIn ? "app" : "public"}-${mobile ? "mobile" : "desktop"}-${lang}`;
      await checkBranding(f, activeLabel, signedIn ? ["/first-steps/", "/studio/", "/shahada/", "/settings/"] : ["/", "/signin/", "/start/", "/start/explore/", "/reset-password/", "/privacy/"]);
      await f.context.close();
    }
  } else if (process.env.FIRST_STEPS_ONLY === "1") {
    for (const lang of ["en", "ar"]) for (const mobile of [false, true]) {
      const f = await setup(lang, mobile, { role: "learner", seedTrack: "first-steps" });
      activePage = f.page; activeLabel = `first-steps-${mobile ? "mobile" : "desktop"}-${lang}`;
      await checkFirstSteps(f, activeLabel);
      await f.context.close();
    }
    const exploring = await setup("en", false, { role: "learner", seedTrack: "explore" });
    // The account sync fixture agrees with the learner's selected journey.
    await exploring.context.route("**:8798/**profiles**", route => route.fulfill({ json: { role: "learner", preferred_track: "explore", daily_minutes: 10, onboarded: true, known_lessons: [], lang: "en" } }));
    await exploring.goto("/compare/?tab=why");
    await exploring.page.getByRole("heading", { name: "Faith & Evidence", exact: true }).first().waitFor();
    await exploring.page.locator(".faith-question").waitFor();
    assert.equal(await exploring.page.locator('nav a[href="/first-steps/"]').count(), 0);
    await exploring.context.close();
    console.log("PASS exploring journey retains Faith & Evidence");
  } else if (process.env.PRACTICE_ONLY === "1") {
    for (const lang of ["en", "ar"]) {
      const f = await setup(lang, true, { role: "learner", seedTrack: "explore" });
      activePage = f.page; activeLabel = `practice-${lang}`;
      await checkPractice(f);
      await f.context.close();
    }
  } else {
  for (const lang of ["en", "ar"]) for (const mobile of [false, true]) {
    const f = await setup(lang, mobile, { seedTrack: "first-steps" });
    const { context, page, state, errors, t, button, field, goto, client } = f;
    const label = `${mobile ? "mobile" : "desktop"}-${lang}`;
    activePage = page; activeLabel = label;
    await checkFirstSteps(f, label);
    await goto("/ask/?track=invalid");
    await field(S.ask.placeholder).waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
    await page.getByRole("heading", { name: new RegExp(t(PERSONAS.khaled.name)), level: 2 }).waitFor().catch(async (error) => {
      await page.screenshot({ path: `${output}/failure-initial-guide-${label}.png`, fullPage: true });
      console.error("Initial Guide headings:", await page.locator("h2").allTextContents());
      console.error("Fixture preference:", await page.evaluate((uid) => localStorage.getItem(`yaqin.prefs.${uid}`), firstId));
      throw error;
    });
    const scripture = Object.values(snapshot.sources).find((source) => source.kind === "quran");
    const hadith = Object.values(snapshot.sources).find((source) => source.kind === "hadith");
    const library = { id: "library:fixture", kind: "library", ref_en: "The Pillars of Faith, pp. 12–13", ref_ar: "أركان الإيمان، ص 12–13",
      text_en: "Exact library evidence with the original conditions.", text_ar: "", review_status: "unreviewed", resource_id: "a".repeat(32) };
    const citedSources = [scripture, hadith, library];
    state.askResponse = { ...answer("OLD RESPONSE"),
      answer: [{ type: "text", text: "OLD RESPONSE" }, ...[...citedSources, scripture].map((source) => ({ type: "source", id: source.id }))],
      sources: Object.fromEntries(citedSources.map((source) => [source.id, source])) };
    await field(S.ask.placeholder).fill("First steps question"); await button(S.ask.send).click();
    await page.getByText("OLD RESPONSE", { exact: true }).waitFor();
    assert.equal(state.asks.at(-1).track, "first-steps");
    assert.equal(await page.locator("footer[aria-label]").count(), 0, "Sources appear in the separate panel");
    const sources = page.getByRole("complementary", { name: t(S.ask.related), exact: true });
    if (!await sources.isVisible()) await page.getByRole("button", { name: t(S.ask.related), exact: true }).click();
    assert.equal(await sources.locator(":scope > div details").count(), citedSources.length);
    assert.equal(await sources.getByText(library.text_en, { exact: false }).isVisible(), false);
    await screenshot(page, `ask-response-${label}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Short references do not overflow in mobile or RTL");
    state.askResponse = answer("OLD RESPONSE");
    await client("/ask/?track=explore");
    await page.getByRole("heading", { name: new RegExp(t(PERSONAS.rayen.name)), level: 2 }).waitFor();
    assert.equal(await page.getByText("OLD RESPONSE", { exact: true }).count(), 0, "Journey Guide has a separate conversation per journey");
    await screenshot(page, `guide-${label}`);
    state.askGate = gate();
    const asksBeforeSwitch = state.asked;
    await field(S.ask.placeholder).fill("Explore question"); await button(S.ask.send).click();
    await until(() => state.asked > asksBeforeSwitch);
    await client("/ask/?track=deepen");
    await page.getByRole("heading", { name: new RegExp(t(PERSONAS.ibrahim.name)), level: 2 }).waitFor();
    state.askGate.release(); state.askGate = null;
    await page.waitForTimeout(100);
    assert.equal(await page.getByText("OLD RESPONSE", { exact: true }).count(), 0, "An old journey's pending answer never enters a new persona's conversation");
    await button(S.ask.voice).click();
    await page.getByRole("link", { name: t(S.nav.library), exact: true }).click();
    await page.waitForURL(/\/library\//);
    await page.waitForFunction(() => window.recognitions.every((r) => r.stopped && r.onresult === null && r.onend === null && r.onerror === null));
    assert.equal(await page.evaluate(() => window.recognitions.every((r) => r.stopped && r.onresult === null && r.onend === null && r.onerror === null)), true, "Dictation stops and detaches on real unmount");

    await goto("/studio/course/?id=a&part=course");
    await field(S.editor.titlePlaceholder).fill("Unsaved navigation draft");
    await button(S.editor.view).click();
    assert.equal(await page.locator("article strong").textContent(), "page text", "HTML-only pages retain formatting in preview");
    await button(S.editor.keepEditing).click();
    await button(S.editor.details).click();
    await button(S.editor.partCourse).click();
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), "Unsaved navigation draft");
    await page.goBack(); await page.goForward();
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), "Unsaved navigation draft");
    await page.getByRole("link", { name: t(S.settings.title), exact: true }).click();
    await page.waitForURL(/\/settings\//);
    await goto("/studio/course/?id=a&part=course");
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), "Unsaved navigation draft", "Sidebar exits recover the draft");
    state.saveGate = gate();
    await button(S.instructor.saveDraft).click();
    await until(() => state.saves.length > 0);
    await field(S.editor.titlePlaceholder).fill("New text typed during save");
    state.saveGate.release(); state.saveGate = null;
    await page.getByText(lang === "en" ? "The submitted version was saved. Your newer edits are still unsaved." : "حُفظت النسخة المرسلة. تغييراتك الأحدث لم تُحفظ بعد.").waitFor();
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), "New text typed during save");
    assert(page.url().includes("/studio/course/"), "New edits keep the editor open");
    await button(S.instructor.saveDraft).click();
    await page.waitForURL(/\/studio\/$/);
    assert.equal(state.saves.at(-1).title[lang], "New text typed during save");
    assert.equal(state.saves.at(-1).audience_track, "deepen", "Saving retains the writing audience independently of membership");
    assert.equal(await page.evaluate((uid) => sessionStorage.getItem(`yaqin.studio.draft.${uid}.a`), firstId), null);

    // Obsolete load completes after a different course was selected in the same route.
    state.loadGate = gate();
    const oldLoads = state.loaded;
    await goto("/studio/course/?id=a&part=course");
    await until(() => state.loaded > oldLoads);
    await client("/studio/course/?id=b&part=course");
    await field(S.editor.titlePlaceholder).waitFor();
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), course("b").title[lang]);
    state.loadGate.release(); state.loadGate = null;
    await page.waitForTimeout(100);
    assert(state.loaded > oldLoads);
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), course("b").title[lang]);

    // Finishing a background job must not replace a manual draft started while it ran.
    await goto("/studio/course/");
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.ai)}`) }).click();
    await page.locator("p").filter({ hasText: new RegExp(`^${t(PERSONAS.hassan.name)}\\s`) }).waitFor();
    await screenshot(page, `creator-${label}`);
    await field(S.editor.aiTitle).fill("Generate a test draft");
    assert.equal(await button(S.editor.generate).isDisabled(), true, "Generation requires an explicit audience");
    const selectedTrack = lang === "ar" ? "deepen" : mobile ? "first-steps" : "explore";
    await page.getByRole("combobox", { name: new RegExp(`^${t(S.editor.aiAudience)}`) }).click();
    await page.getByRole("option", { name: t(snapshot.tracks.find((track) => track.id === selectedTrack).title), exact: true }).click();
    state.jobGate = gate();
    await button(S.editor.generate).click();
    await until(() => state.polled > 0);
    assert.equal(state.drafts.at(-1).track, selectedTrack);
    assert.equal(state.drafts.at(-1).lang, lang);
    await button(S.editor.manual).click();
    await field(S.editor.titlePlaceholder).fill("Active manual draft");
    state.jobGate.release(); state.jobGate = null;
    await page.waitForTimeout(150);
    assert.equal(await field(S.editor.titlePlaceholder).inputValue(), "Active manual draft");
    assert.equal(new URL(page.url()).searchParams.get("id"), null);

    await goto("/course/?id=a&step=quiz");
    await button(bi("Correct")).click();
    await field(S.lesson.companionPlaceholder).fill("Course A question");
    state.askGate = gate();
    const asksBeforeCourse = state.asked;
    await page.locator("#companion").getByRole("button", { name: t(S.ask.send), exact: true }).click();
    await until(() => state.asked > asksBeforeCourse);
    await client("/course/?id=b&step=quiz");
    await page.getByRole("heading", { name: bi("Question b 1")[lang], exact: true }).waitFor();
    assert.equal(await button(bi("Correct")).isEnabled(), true, "Quiz answer state resets for another course");
    assert.equal(await field(S.lesson.companionPlaceholder).inputValue(), "");
    state.askGate.release(); state.askGate = null;
    await page.waitForTimeout(100);
    assert.equal(await page.getByText("OLD RESPONSE", { exact: true }).count(), 0, "Course A response never appears under B");
    await button(bi("Correct")).click(); await button(S.lesson.continue).click();
    await button(bi("Correct")).click(); await button(S.lesson.continue).click();
    await page.getByRole("heading", { name: t(S.lesson.doneTitle), exact: true }).waitFor();
    const progress = await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)), firstId);
    assert.equal(progress.lessons.b.quizScore, 1);
    await field(S.lesson.notes).fill("Saved course B note");
    await field(S.lesson.notes).blur();
    // A forced document reload must wait for the mocked Supabase save, rather than abort it mid-flight.
    await page.waitForFunction((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)).pending.length === 0, firstId);
    await goto("/lesson/?id=b");
    assert.equal(await field(S.lesson.notes).inputValue(), "Saved course B note");
    await page.getByText(bi("Legacy page text")[lang], { exact: true }).waitFor();

    // The companion sends the viewed page, keeps recent history, and old-page follow-ups retain their referent.
    await goto("/course/?id=a&track=explore");
    await page.getByRole("heading", { name: new RegExp(t(PERSONAS.mariam.name)), level: 2 }).waitFor();
    await screenshot(page, `companion-welcome-${label}`);
    if (mobile) {
      await page.locator("#companion").evaluate((panel) => panel.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.locator("#companion").screenshot({ path: `${output}/companion-welcome-${label}.png`, animations: "disabled" });
    }
    if (await page.getByText("TypeError: Failed to fetch", { exact: true }).count()) console.error("Fixture sync failures:", state.failedRequests.filter((request) => request.method !== "HEAD" && request.path !== "/api/tutor/ask"));
    state.askResponse = { ...answer("OLD RESPONSE"), follow_ups: ["Explain this idea further"] };
    let askedBefore = state.asked;
    await field(S.lesson.companionPlaceholder).fill("What does this page mean?");
    await page.locator("#companion").getByRole("button", { name: t(S.ask.send), exact: true }).click();
    await until(() => state.asked > askedBefore);
    await page.locator("#companion").getByText("OLD RESPONSE", { exact: true }).waitFor();
    assert.equal(state.asks.at(-1).course_id, "a");
    assert.equal(state.asks.at(-1).card_id, "a-one");
    assert.equal(state.asks.at(-1).track, "explore");
    assert.equal(state.asks.at(-1).history.length, 0);
    await button(S.lesson.continue).click();
    await page.getByRole("heading", { name: bi("Second a")[lang], exact: true }).waitFor();
    askedBefore = state.asked;
    await field(S.lesson.companionPlaceholder).fill("How does this relate to the last page?");
    await page.locator("#companion").getByRole("button", { name: t(S.ask.send), exact: true }).click();
    await until(() => state.asked > askedBefore);
    await page.locator("#companion").getByText("OLD RESPONSE", { exact: true }).nth(1).waitFor();
    assert.equal(state.asks.at(-1).card_id, "a-two");
    assert.equal(state.asks.at(-1).history.length, 2);
    assert.equal(state.asks.at(-1).history[0].content, "What does this page mean?");
    askedBefore = state.asked;
    await page.locator("#companion").getByRole("button", { name: "Explain this idea further", exact: true }).first().click();
    await until(() => state.asked > askedBefore);
    await page.locator("#companion").getByText("OLD RESPONSE", { exact: true }).nth(2).waitFor();
    assert.equal(state.asks.at(-1).card_id, "a-one", "An old-page follow-up uses the original page, even after navigating forward");
    assert.equal(state.asks.at(-1).history.length, 4);
    await screenshot(page, `companion-${label}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Persona course layout does not overflow on mobile or RTL");
    await client("/course/?id=a&track=deepen");
    await field(S.lesson.companionPlaceholder).waitFor();
    assert.equal(await page.getByText("OLD RESPONSE", { exact: true }).count(), 0, "A new course journey resets the companion conversation");

    await goto("/studio/knowledge-base/");
    await page.getByRole("button", { name: state.resource.title, exact: true }).waitFor();
    await page.getByText(state.resource.description, { exact: true }).waitFor();
    assert.equal(await page.locator("tbody").getByText(state.resource.resourceId, { exact: false }).count(), 0);
    await screenshot(page, `knowledge-resources-${label}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Admin resources fit mobile and RTL");
    await page.getByRole("button", { name: state.resource.title, exact: true }).click();
    const resourceDialog = page.getByRole("dialog");
    await resourceDialog.getByRole("textbox", { name: t(K.bookTitle), exact: true }).fill(lang === "ar" ? "أركان الإيمان" : "Faith resources");
    await resourceDialog.getByRole("textbox", { name: t(K.summary), exact: true }).fill(lang === "ar" ? "مقدمة موجزة عن الإيمان." : "A short resource description.");
    await resourceDialog.getByRole("button", { name: t(K.saveMetadata), exact: true }).click();
    await page.getByText(t(K.metadataSaved), { exact: true }).waitFor();
    assert.equal(state.resource.resourceId, "a".repeat(32), "Editing labels preserves resource identity");
    await resourceDialog.getByRole("button", { name: t(K.close), exact: true }).click();
    await page.getByRole("button", { name: state.resource.title, exact: true }).waitFor();
    await page.getByRole("searchbox", { name: t(K.search), exact: true }).fill(state.resource.description);
    await page.getByRole("button", { name: state.resource.title, exact: true }).waitFor();
    const deleteButton = page.getByRole("button", { name: `${t(K.delete)}: ${state.resource.title}`, exact: true });
    await deleteButton.click();
    const deleteDialog = page.getByRole("dialog", { name: t(K.deleteTitle), exact: true });
    await deleteDialog.getByRole("button", { name: t(K.cancel), exact: true }).click();
    assert.equal(state.deleteCalls, 0, "Cancel never deletes the resource");
    await deleteButton.click();
    await screenshot(page, `knowledge-delete-${label}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Deletion confirmation fits mobile and RTL");
    state.deleteFails = true;
    await deleteDialog.getByRole("button", { name: t(K.delete), exact: true }).click();
    await deleteDialog.getByRole("alert").waitFor();
    assert.equal(state.resourceDeleted, false, "Failed deletion does not report success");
    state.deleteFails = false;
    await deleteDialog.getByRole("button", { name: t(K.delete), exact: true }).click();
    await page.getByText(t(K.deleted), { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: state.resource.title, exact: true }).count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0, "Successful deletion closes confirmation");

    await goto("/first-steps/?step=community");
    await screenshot(page, label);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    state.logoutFails = true;
    await button(S.nav.signOut).click();
    await page.getByText(lang === "en" ? "Sign-out failed. Please try again." : "تعذّر تسجيل الخروج. حاول مجددًا.", { exact: true }).waitFor();
    assert(page.url().includes("/first-steps/"), "Failed sign-out keeps the current page");
    state.logoutFails = false;
    await button(S.nav.signOut).click();
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/signin/");
    await goto("/signin/");
    await page.getByRole("textbox", { name: t(S.auth.email), exact: true }).fill("second@example.test");
    await page.getByLabel(t(S.auth.password), { exact: true }).fill("fixture-password");
    await button(S.auth.signIn).click();
    await page.waitForURL(/\/learn\//);
    await goto("/course/?id=b");
    assert.equal(await field(S.lesson.notes).inputValue(), "", "Another account cannot inherit notes");
    assert.equal(await page.evaluate((uid) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)).notes.b, firstId), "Saved course B note");
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: editor recovery/save/load/generation races; HTML + legacy preview; course/quiz/chat/notes/account boundaries; invalid persisted data; dictation; sign-out; RTL/layout`);
    await context.close();
  }

  // Invalid pending local preferences must stay identity-neutral, rather than adopt the remote journey.
  for (const lang of ["en", "ar"]) {
    const f = await setup(lang, true, { seedTrack: "invalid" });
    await f.goto("/ask/?track=invalid");
    await f.page.getByRole("heading", { name: new RegExp(f.t(PERSONAS.rayen.name)), level: 2 }).waitFor();
    await f.field(S.ask.placeholder).fill("What is Islam?"); await f.button(S.ask.send).click();
    await f.page.getByText("OLD RESPONSE", { exact: true }).waitFor();
    assert.equal(f.state.asks.at(-1).track, "explore", "An invalid journey does not assume the learner is Muslim");
    assert.deepEqual(f.errors, []);
    await f.context.close();
  }

  const f = await setup("en", false, { outage: true });
  await f.goto("/settings/");
  await f.page.getByRole("heading", { name: S.settings.title.en, exact: true }).waitFor();
  await f.page.getByText("Courses are currently unavailable. Please try again.").waitFor();
  f.state.outage = false; f.state.empty = true;
  await f.page.getByRole("button", { name: "Retry", exact: true }).click();
  await f.page.getByText("No courses are available yet.", { exact: true }).waitFor();
  f.state.empty = false;
  await f.goto("/library/?view=browse&track=first-steps");
  await f.page.getByRole("link", { name: /Course a/ }).first().waitFor();
  assert.deepEqual(f.errors, []);
  await f.context.close();
  for (const role of ["learner", "teacher", "admin", "super_admin"]) {
    const f = await setup("en", false, { role });
    await f.goto("/studio/users/");
    await f.page.getByText(role === "super_admin" ? S.users.title.en : role === "learner" ? S.instructor.restricted.en : S.users.restricted.en, { exact: true }).first().waitFor();
    assert.deepEqual(f.errors, []);
    await f.context.close();
  }
  const signedOut = await setup("en", true, { signedIn: false });
  await signedOut.goto("/studio/course/?id=a");
  await signedOut.page.waitForURL(/\/signin\//);
  assert.equal(signedOut.state.loaded, 0, "Signed-out clients never load staff content");
  assert.deepEqual(signedOut.errors, []);
  await signedOut.context.close();
  console.log("PASS content outage, empty catalog, recovery, role restrictions and signed-out redirect");
  for (const lang of ["en", "ar"]) {
    const f = await setup(lang, true, { role: "learner", seedTrack: "explore" });
    activePage = f.page; activeLabel = `practice-${lang}`;
    await checkPractice(f);
    await f.context.close();
  }
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failure-${activeLabel}.png`, fullPage: true });
    console.error("Browser failure page:", activePage.url());
    console.error("Recognition cleanup:", await activePage.evaluate(() => (window.recognitions ?? []).map((r) => ({ stopped: r.stopped, resultDetached: r.onresult === null, endDetached: r.onend === null, errorDetached: r.onerror === null }))));
  }
  throw error;
} finally { await browser.close(); }
