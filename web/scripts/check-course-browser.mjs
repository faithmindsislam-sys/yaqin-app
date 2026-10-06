import { loadSource } from "./load-source.mjs";
// Real UI + FastAPI workflows with isolated identity/storage and deterministic local AI.
// Run api/scripts/course_browser_fixture.py and the dev server described in docs/COURSE_STRUCTURE.md.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { S } = loadSource(new URL("../src/lib/strings.ts", import.meta.url));
const tracks = JSON.parse(readFileSync("../content/tracks.json", "utf8"));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.COURSE_CHROME_PATH ? { executablePath: process.env.COURSE_CHROME_PATH } : {}) });
const base = process.env.COURSE_TEST_URL || "http://127.0.0.1:3107";
assert.equal(new URL(base).hostname, "127.0.0.1", "Use the isolated localhost fixture only");
const api = "http://127.0.0.1:8797";
const output = process.env.COURSE_SCREENSHOTS || "/tmp/yaqin-course-ui";
mkdirSync(output, { recursive: true });
const uid = "00000000-0000-0000-0000-000000000001";
const user = { id: uid, email: "admin@example.test", role: "authenticated", aud: "authenticated", created_at: "2026-10-01T00:00:00Z", user_metadata: { name: "Test Admin" }, app_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: uid, exp: expires, aud: "authenticated", role: "authenticated" })).toString("base64url"), "offline-signature"].join(".");
const session = { access_token: token, refresh_token: "offline-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
const only = process.env.COURSE_CASE;
try {
  for (const lang of ["en", "ar"]) for (const mobile of [false, true]) {
    const label = `${mobile ? "mobile" : "desktop"}-${lang}`;
    if (only && only !== label) continue;
    const t = (bi) => bi[lang];
    const trackTitle = (id) => t(tracks.find((track) => track.id === id).title);
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 } });
    let profile = { role: "admin", preferred_track: "first-steps", daily_minutes: 10, onboarded: true, known_lessons: [], lang, display_name: "Test Admin" };
    const saved = new Map();
    const errors = [];
    await context.addInitScript(({ session, lang }) => {
      if (!localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      localStorage.setItem("yaqin.lang", lang);
    }, { session, lang });
    await context.route("http://127.0.0.1:8798/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postData() ? request.postDataJSON() : {};
      let data = [];
      if (path.includes("profiles")) {
        if (request.method() === "PATCH") profile = { ...profile, ...body };
        data = profile;
      } else if (path.endsWith("/user")) data = user;
      else if (path.endsWith("/save_learning_progress")) {
        saved.set(body.p_lesson, { user_id: uid, lesson_id: body.p_lesson, card: body.p_card, cards_done: body.p_cards_done, explained: body.p_explained, quiz_score: body.p_quiz_score, completed_at: body.p_completed_at, note: body.p_note });
        data = null;
      } else if (path.endsWith("/progress")) data = [...saved.values()];
      await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", (error) => errors.push(error.message));
    const screenshot = async (name) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${label}-${name}.png`, fullPage: true, animations: "disabled" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    };
    const button = (text) => page.getByRole("button", { name: text, exact: true });
    const select = async (label, option) => {
      await page.getByRole("combobox", { name: new RegExp(`^${label}`) }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    const source = async (locator) => {
      await locator.click();
      await page.getByRole("dialog").getByRole("searchbox", { name: t(S.editor.pickerSearch), exact: true }).fill("5:6");
      await page.locator("dialog .source-picker-item").first().click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    };
    const classify = async () => {
      await button(t(S.editor.details)).click();
      await select(t(S.instructor.subject), lang === "ar" ? "الفقه" : "Fiqh");
      await select(t(S.instructor.track), trackTitle("explore"));
      await select(t(S.instructor.track), trackTitle("first-steps"));
      assert.equal(await page.getByRole("radio").count(), 0);
      assert.equal(await page.getByRole("combobox", { name: new RegExp(`^${t(S.dash.module)} `) }).count(), 1);
      await select(t(S.instructor.level), t(S.library.levels[3]));
    };
    const title = `${lang === "ar" ? "دورة التحقق" : "Verification course"} ${label} ${Date.now()}`;
    await page.goto(`${base}/studio/course/`);
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.manual)}`) }).click();
    await page.locator(".editor-langs").getByRole("button", { name: lang === "ar" ? "العربية" : "English" }).click();
    await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).fill(title);
    await page.getByRole("textbox", { name: t(S.editor.summaryPlaceholder), exact: true }).fill(lang === "ar" ? "محتوى مؤقت لاختبار هيكل الدورة." : "Temporary content for verifying course structure.");
    for (let i = 1; i <= 2; i++) {
      if (i === 2) await button(t(S.editor.addSection)).click();
      await page.getByRole("textbox", { name: t(S.editor.sectionTitle), exact: true }).fill(`${lang === "ar" ? "صفحة التحقق" : "Verification page"} ${i}`);
      await page.getByRole("textbox", { name: `${t(S.editor.section)} ${i}`, exact: true }).fill(lang === "ar" ? "نص مؤقت لاختبار حفظ الصفحة." : "Temporary text for checking page persistence.");
      await source(page.getByRole("button", { name: t(S.editor.addSource), exact: true }).first());
    }
    await classify();
    await page.getByRole("spinbutton", { name: t(S.editor.minutes), exact: true }).fill("5");
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.questions)}`) }).click();
    await button(t(S.editor.addQuestion)).click();
    await page.getByRole("textbox", { name: t(S.editor.question), exact: true }).fill(lang === "ar" ? "هل هذا اختبار للهيكل؟" : "Is this a structure check?");
    await page.getByRole("group", { name: t(S.editor.choices), exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await page.getByLabel(`${t(S.editor.option)} 1`, { exact: true }).fill(lang === "ar" ? "نعم" : "Yes");
    await page.getByLabel(`${t(S.editor.option)} 2`, { exact: true }).fill(lang === "ar" ? "لا" : "No");
    assert.equal(await page.getByRole("button", { name: t(S.editor.addSource), exact: true }).count(), 0, "Activities use the course references, with two explicitly selected answer choices");
    assert.equal(await page.getByRole("textbox", { name: /tags|وسوم/i }).count(), 0);
    await screenshot("editor");
    await button(t(S.instructor.saveDraft)).click();
    await page.waitForURL(`${base}/studio/`);
    const drafts = await (await page.request.get(`${api}/api/review/courses`)).json();
    const course = drafts.find((course) => course.title[lang] === title);
    assert.ok(course, JSON.stringify(drafts).slice(0, 300));
    assert.equal(course.subject, "fiqh");
    assert.deepEqual(course.tracks, ["first-steps"]);
    // Curriculum cannot put a course into a second journey.
    const config = await (await page.request.get(`${api}/api/curriculum`)).json();
    const deepen = config.tracks.find((track) => track.id === "deepen");
    const shared = await page.request.post(`${api}/api/curriculum/tracks/deepen`, { data: { modules: deepen.modules.map((module, index) => ({ ...module, lessons: index === 0 ? [...module.lessons, course.id] : module.lessons })), updated_at: config.updated_at.tracks } });
    assert.equal(shared.status(), 409);
    assert.equal(course.level, 3);
    const id = course.id;
    await page.goto(`${base}/studio/course/?id=${id}&part=course`);
    await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).waitFor();
    await page.locator(".editor-langs").getByRole("button", { name: lang === "ar" ? "العربية" : "English" }).click();
    assert.equal(await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).inputValue(), title);
    await button(t(S.editor.view)).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await button(t(S.editor.keepEditing)).click();
    await button(t(S.instructor.submit)).click();
    await page.waitForURL(`${base}/studio/`);
    await page.getByRole("searchbox", { name: t(S.instructor.searchTitle), exact: true }).fill(title);
    const row = page.locator("tbody tr").filter({ has: page.getByText(title, { exact: true }) });
    const editLink = row.getByRole("link", { name: title, exact: true });
    assert.equal(await editLink.getAttribute("href"), `/studio/course/?id=${id}`);
    await editLink.click();
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.details)}`) }).waitFor();
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.partCourse)}`) }).waitFor();
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.questions)}`) }).waitFor();
    await page.goto(`${base}/studio/`);
    await page.getByRole("searchbox", { name: t(S.instructor.searchTitle), exact: true }).fill(title);
    await row.getByRole("button", { name: t(S.instructor.publish), exact: true }).click();
    await row.getByText(t(S.instructor.status.published), { exact: true }).waitFor();
    const published = await (await page.request.get(`${api}/api/courses/${id}`)).json();
    assert.equal(published.status, "published");
    assert.equal(published.cards.length, 2);
    assert.ok(!("tags" in published));
    await page.goto(`${base}/library/?view=browse&track=first-steps`);
    await page.getByRole("textbox", { name: t(S.library.search), exact: true }).fill(title);
    const link = page.locator(`a[href^="/course/?id=${id}"]`);
    await link.waitFor();
    assert.equal(await link.count(), 1);
    await screenshot("library");
    await link.click();
    for (let i = 0; i < published.cards.length; i++) await page.getByRole("button", { name: new RegExp(`^(${t(S.lesson.continue)}|${t(S.lesson.startQuiz)})`) }).click();
    for (const q of published.quiz) {
      await button(q.options[q.answer][lang] || q.options[q.answer].en).click();
      await page.getByRole("button", { name: new RegExp(`^${t(S.lesson.continue)}`) }).click();
    }
    await page.getByRole("heading", { name: t(S.lesson.doneTitle), exact: true }).waitFor();
    await screenshot("complete");
    const progress = () => page.evaluate(({ uid, id }) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)).lessons[id], { uid, id });
    const before = await progress();
    assert.equal(before.quizScore, 1);
    assert.ok(before.completedAt && before.cardsDone);
    await page.goto(`${base}/settings/`);
    const trackForm = page.locator("section").filter({ has: page.getByRole("heading", { name: t(S.settings.track), exact: true }) }).locator("form");
    await trackForm.locator("label").filter({ hasText: trackTitle("deepen") }).click();
    await trackForm.getByRole("button", { name: t(S.settings.saveTrack), exact: true }).click();
    await trackForm.getByRole("status").waitFor();
    assert.equal(profile.preferred_track, "deepen");
    await page.goto(`${base}/learn/`);
    await page.getByRole("heading", { name: trackTitle("deepen"), exact: true }).waitFor();
    assert.equal(await page.locator(`a[href^="/course/?id=${id}"]`).count(), 0);
    await screenshot("journey");
    assert.deepEqual(await progress(), before);
    await page.goto(`${base}/library/?view=browse&track=deepen`);
    await page.getByRole("textbox", { name: t(S.library.search), exact: true }).fill(title);
    assert.equal(await page.locator(`a[href^="/course/?id=${id}"]`).count(), 0);
    await page.goto(`${base}/lesson/?id=${id}&step=quiz`);
    await page.getByRole("heading", { name: published.quiz[0].question[lang], exact: true }).waitFor();
    await page.goto(`${base}/studio/lesson/?id=${id}&part=course`);
    await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).waitFor();
    await page.locator(".editor-langs").getByRole("button", { name: lang === "ar" ? "العربية" : "English" }).click();
    assert.equal(await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).inputValue(), title);

    // Same editor, real background AI job, edit and publish using the new classification.
    await page.goto(`${base}/studio/course/`);
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.ai)}`) }).click();
    await select(t(S.editor.aiAudience), trackTitle("first-steps"));
    await page.getByRole("textbox", { name: t(S.editor.aiTitle), exact: true }).fill("Generate a course about wudu and purification using Quran 5:6");
    await button(t(S.editor.generate)).click();
    await page.waitForURL(/\/studio\/course\/\?id=/, { timeout: 60000 });
    await page.getByRole("button", { name: new RegExp(`^${t(S.editor.partCourse)}`) }).click();
    await page.getByRole("textbox", { name: t(S.editor.titlePlaceholder), exact: true }).waitFor();
    const generatedId = new URL(page.url()).searchParams.get("id");
    await page.locator(".editor-langs").getByRole("button", { name: lang === "ar" ? "العربية" : "English" }).click();
    await page.getByRole("textbox", { name: t(S.editor.sectionTitle), exact: true }).fill(lang === "ar" ? "عنوان صفحة التحقق" : "Verification page title");
    await classify();
    await button(t(S.instructor.publishDirect)).click();
    await page.waitForURL(`${base}/studio/`, { timeout: 60000 });
    const generated = await (await page.request.get(`${api}/api/courses/${generatedId}`)).json();
    assert.equal(generated.status, "published");
    assert.equal(generated.subject, "fiqh");
    assert.deepEqual(generated.tracks, ["first-steps"]);
    assert.equal(generated.level, 3);
    await page.goto(`${base}/library/?view=browse&track=first-steps`);
    const generatedLink = page.locator(`a[href^="/course/?id=${generatedId}"]`);
    await generatedLink.waitFor();
    assert.equal(await generatedLink.count(), 1);
    assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await generatedLink.click();
    for (let i = 0; i < generated.cards.length; i++) await page.getByRole("button", { name: new RegExp(`^(${t(S.lesson.continue)}|${t(S.lesson.startQuiz)})`) }).click();
    for (const q of generated.quiz) {
      await button(q.options[q.answer][lang] || q.options[q.answer].en).click();
      await page.getByRole("button", { name: new RegExp(`^${t(S.lesson.continue)}`) }).click();
    }
    await page.getByRole("heading", { name: t(S.lesson.doneTitle), exact: true }).waitFor();
    const generatedBefore = await page.evaluate(({ uid, generatedId }) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)).lessons[generatedId], { uid, generatedId });
    assert.equal(generatedBefore.quizScore, 1);
    assert.ok(generatedBefore.completedAt);
    await page.goto(`${base}/settings/`);
    const firstStepsForm = page.locator("section").filter({ has: page.getByRole("heading", { name: t(S.settings.track), exact: true }) }).locator("form");
    await firstStepsForm.locator("label").filter({ hasText: trackTitle("first-steps") }).click();
    await firstStepsForm.getByRole("button", { name: t(S.settings.saveTrack), exact: true }).click();
    await firstStepsForm.getByRole("status").waitFor();
    await page.goto(`${base}/learn/`);
    await page.getByRole("link", { name: `${title} · ${t(S.dash.road.done)}`, exact: true }).waitFor();
    assert.match(await page.locator(".chip").filter({ hasText: t(S.dash.lessonsDone) }).first().textContent(), /^\s*2\//);
    assert.deepEqual(await progress(), before);
    assert.deepEqual(await page.evaluate(({ uid, generatedId }) => JSON.parse(localStorage.getItem(`yaqin.progress.${uid}`)).lessons[generatedId], { uid, generatedId }), generatedBefore);
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: manual/AI → pages + subject/level/track placement → save/review/publish → Library → completion → switch track → unchanged progress; old URLs`);
    await context.close();
  }
} finally { await browser.close(); }
