// Real-browser checks against isolated auth/API/storage fixtures. No live infrastructure is contacted.
// Set PLAYWRIGHT_MODULE to an installed Playwright module and run against the documented test dev server.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.KB_CHROME_PATH ? { executablePath: process.env.KB_CHROME_PATH } : {}) });
const output = process.env.KB_SCREENSHOTS || "/tmp/yaqin-knowledge-base";
mkdirSync(output, { recursive: true });
const userId = "00000000-0000-0000-0000-000000000001";
const user = { id: userId, email: "admin@example.test", role: "authenticated", aud: "authenticated", created_at: "2026-10-01T00:00:00Z", user_metadata: { name: "Test Admin" }, app_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: userId, exp: expires, iat: expires - 3600, aud: "authenticated", role: "authenticated" })).toString("base64url"), "offline-signature"].join(".");
const session = { access_token: token, refresh_token: "offline-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
const id = (n) => n.toString(16).padStart(32, "0");
const baseRows = [
  { documentId: id(1), filename: "Foundations.pdf", status: "COMPLETED", enabled: true },
  { documentId: id(2), filename: "Arabic source.txt", status: "COMPLETED", enabled: false },
  { documentId: id(3), filename: "Queued notes.md", status: "PENDING", enabled: true },
  { documentId: id(4), filename: "Scanned source.pdf", status: "FAILED", enabled: false },
  { documentId: id(5), filename: "Waiting.csv", status: "WAITING_UPLOAD", enabled: false },
].map((row) => ({ ...row, resourceId: row.documentId, ocrUsed: null, pages: null, createdAt: "2026-10-04T09:00:00Z", updatedAt: "2026-10-04T10:00:00Z", error: row.status === "FAILED" ? "OCR produced no text" : null }));
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
await context.addInitScript(({ session }) => {
  localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  localStorage.setItem("yaqin.lang", "en");
  const timeout = window.setTimeout;
  window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 8000 ? 100 : delay, ...args);
}, { session });
let rows = structuredClone(baseRows);
let nextId = 10;
let failUpload = false;
let partial = false;
let failList = false;
const registrations = [];
const transfers = [];
const toggles = [];
const queries = [];
const statusRequests = [];
let listRequests = 0;
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("http://127.0.0.1:8798/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const data = path.includes("profiles") ? { role: "super_admin", preferred_track: "explore", daily_minutes: 10, onboarded: true, known_lessons: [], lang: "en" }
    : path.endsWith("/user") ? user : [];
  await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
});
await page.route("http://127.0.0.1:8797/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const body = request.method() === "POST" ? request.postDataJSON() : undefined;
  let data;
  let status = 200;
  if (path === "/api/content") data = { tracks: [{ id: "explore", title: { en: "Explore Islam", ar: "اكتشف الإسلام" }, modules: [] }], lessons: {}, sources: {} };
  else if (path.endsWith("/resources")) {
    listRequests++;
    data = failList ? { error: { code: "rag_unavailable", message: "Resource list unavailable in fixture" } } : { resources: rows };
    status = failList ? 503 : 200;
  }
  else if (path.endsWith("/documents") && body) {
    const did = id(nextId++);
    registrations.push(body);
    rows.unshift({ documentId: did, resourceId: did, filename: body.filename, enabled: true, status: "WAITING_UPLOAD", ocrUsed: null });
    data = { documentId: did, resourceId: did, uploadUrl: `http://127.0.0.1:8799/upload/${did}`, method: "PUT", expiresIn: 900 };
    status = 201;
  } else if (path.endsWith("/status")) {
    statusRequests.push(path.split("/").at(-2));
    data = rows.find((row) => row.documentId === path.split("/").at(-2));
  } else if (path.endsWith("/toggle")) {
    toggles.push(body);
    const updated = partial ? body.documentIds.slice(0, 1) : body.documentIds;
    rows = rows.map((row) => updated.includes(row.documentId) ? { ...row, enabled: body.enabled } : row);
    data = { documentIds: updated, updated: updated.length, enabled: body.enabled };
  } else if (path.endsWith("/retrieval/test")) {
    queries.push(body);
    const eligible = rows.filter((row) => row.enabled && row.status === "COMPLETED" && (!body.documentId || body.documentId === row.documentId));
    data = { eligibleResourceCount: eligible.length, passages: body.query === "no match" ? [] : eligible.slice(0, 1).map((row) => ({
      id: "P1", documentId: row.documentId, resourceId: row.resourceId, filename: row.filename, text: "A matching passage from the source.", score: 0.876,
    })) };
  } else { data = { error: { code: "test_unhandled", message: path } }; status = 404; }
  await route.fulfill({ status, json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
});
await page.route("http://127.0.0.1:8799/upload/**", async (route) => {
  if (route.request().method() !== "OPTIONS") {
    transfers.push({ contentType: route.request().headers()["content-type"], data: route.request().postDataBuffer() });
    if (!failUpload) rows.find((row) => row.documentId === new URL(route.request().url()).pathname.split("/").at(-1)).status = "PENDING";
  }
  await route.fulfill({ status: failUpload ? 403 : 200, body: "", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "PUT,OPTIONS" } });
});
try {
  await page.goto(process.env.KB_TEST_URL || "http://127.0.0.1:3110/studio/knowledge-base/");
  await page.getByRole("heading", { name: "Knowledge Base", exact: true }).waitFor();
  await page.getByRole("button", { name: "Foundations.pdf", exact: true }).waitFor();
  assert.equal(await page.locator('a[href="/studio/knowledge-base/"][aria-current="page"]').count(), 2);
  await page.screenshot({ path: `${output}/desktop-en.png`, fullPage: true });
  await page.getByRole("button", { name: "Foundations.pdf", exact: true }).click();
  const details = page.getByRole("dialog");
  await details.getByText("Unavailable", { exact: true }).first().waitFor();
  await details.getByRole("button", { name: "Test retrieval", exact: true }).click();
  await page.getByRole("textbox", { name: "Search query", exact: true }).fill("prayer");
  await page.getByRole("button", { name: "Search passages", exact: true }).click();
  await page.getByText("A matching passage from the source.", { exact: true }).waitFor();
  assert.equal(queries.at(-1).documentId, id(1));
  await page.getByRole("textbox", { name: "Search query", exact: true }).fill("no match");
  await page.getByRole("button", { name: "Search passages", exact: true }).click();
  await page.getByText("No matching passages. Try a different query.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await page.getByRole("button", { name: "Disable: Foundations.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Enable: Foundations.pdf", exact: true }).waitFor();
  await page.getByLabel("Select resource: Foundations.pdf", { exact: true }).check();
  await page.getByLabel("Select resource: Arabic source.txt", { exact: true }).check();
  await page.getByRole("button", { name: "Enable selected", exact: true }).click();
  await page.getByRole("button", { name: "Disable: Arabic source.txt", exact: true }).waitFor();
  assert.equal(toggles.at(-1).documentIds.length, 2);
  await page.getByLabel("Search by filename", { exact: true }).fill("Scanned");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "Scanned source.pdf", exact: true }).click();
  await page.getByRole("dialog").getByText("OCR produced no text").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Upload replacement", exact: true }).click();
  await page.getByRole("dialog").getByText("A replacement creates a new resource and keeps this failed record.", { exact: false }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Search by filename", { exact: true }).fill("");
  await page.getByRole("button", { name: "Add resource", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: "Text", exact: true }).check();
  await page.getByLabel("Resource name", { exact: true }).fill("Pasted source");
  await page.getByRole("textbox", { name: "Source text", exact: true }).fill("A pasted passage with Arabic: نص عربي");
  await page.getByLabel("Enable for retrieval when ready", { exact: true }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByText("Upload complete. Ingestion is tracked in Resources.", { exact: true }).waitFor();
  assert.equal(registrations.at(-1).filename, "Pasted source.txt");
  assert.equal(transfers.at(-1).contentType, "text/plain");
  assert.match(transfers.at(-1).data.toString(), /نص عربي/);
  assert.equal(rows.find((row) => row.filename === "Pasted source.txt").enabled, false);
  await page.getByRole("button", { name: "Add resource", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: "JSON", exact: true }).check();
  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill("[1]");
  await page.getByText("JSON must be an object or a nonempty array of objects.", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill('[{"title":"Heading","body":"Extracted source text","other":"hidden"}]');
  await page.getByLabel("Resource name", { exact: true }).fill("Selected fields");
  await page.getByRole("combobox", { name: /^Source text field/ }).click();
  await page.getByRole("option", { name: "body", exact: true }).click();
  await page.getByRole("combobox", { name: /^Title field/ }).click();
  await page.getByRole("option", { name: "title", exact: true }).click();
  assert.match(await page.locator(".kb-preview").textContent(), /Heading\s+Extracted source text/);
  assert.doesNotMatch(await page.locator(".kb-preview").textContent(), /hidden/);
  await page.getByRole("dialog").getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByRole("button", { name: "Selected fields.json", exact: true }).waitFor();
  assert.deepEqual(registrations.at(-1).jsonExtraction, { textField: "body", titleField: "title" });
  await page.getByRole("button", { name: "Add resource", exact: true }).first().click();
  await page.getByLabel("Choose file", { exact: true }).setInputFiles({ name: "Upload.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\ntest") });
  failUpload = true;
  await page.getByRole("dialog").getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByText("The upload URL expired or was rejected. Try again to create a fresh upload.", { exact: true }).waitFor();
  await page.getByText("The registered resource is preserved.", { exact: false }).waitFor();
  failUpload = false;
  await page.getByRole("dialog").getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByRole("button", { name: "Upload.pdf", exact: true }).first().waitFor();
  assert.equal(registrations.at(-1).content_type, "application/pdf");
  assert.equal(transfers.at(-1).contentType, "application/pdf");
  await page.getByLabel("Select resource: Foundations.pdf", { exact: true }).check();
  await page.getByLabel("Select resource: Arabic source.txt", { exact: true }).check();
  partial = true;
  await page.getByRole("button", { name: "Disable selected", exact: true }).click();
  await page.getByText("Some resources were not updated. The list has been refreshed; check their current state.", { exact: true }).waitFor();
  partial = false;
  await page.getByRole("tab", { name: "Statistics", exact: true }).click();
  await page.getByText("Statistics for loaded resources only (up to 500), not the entire knowledge base.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  // Status polling reads completion and failure from the server, without refreshing the list.
  rows.find((row) => row.documentId === id(3)).status = "COMPLETED";
  rows.find((row) => row.filename === "Selected fields.json").status = "FAILED";
  rows.find((row) => row.filename === "Selected fields.json").error = "Ingestion failed in fixture";
  await page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Queued notes.md", exact: true }) }).getByText("Ready", { exact: true }).waitFor();
  await page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Selected fields.json", exact: true }) }).getByText("Failed", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Queued notes.md", exact: true }).click();
  await page.getByRole("dialog").getByText("Ready", { exact: true }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const langButton = page.getByRole("button", { name: /العربية/ });
  await langButton.click();
  await page.locator('html[dir="rtl"]').waitFor();
  await page.getByRole("heading", { name: "قاعدة المعرفة", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/desktop-ar.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/mobile-ar.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "No mobile overflow");
  assert.equal(await page.locator('nav.lg\\:hidden a[href="/studio/knowledge-base/"]').count(), 1);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator('html[dir="ltr"]').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/mobile-en.png`, fullPage: true });
  await page.getByRole("tab", { name: "Resources", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "Test retrieval", exact: true }).getAttribute("aria-selected"), "true");
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await page.getByRole("combobox", { name: /^Ingestion status/ }).click();
  await page.getByRole("option", { name: "Failed", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 2);
  await page.getByRole("combobox", { name: /^Ingestion status/ }).click();
  await page.getByRole("option", { name: "All statuses", exact: true }).click();
  failList = true;
  await page.getByRole("button", { name: "Refresh resources", exact: true }).last().click();
  await page.getByText("Resource list unavailable in fixture", { exact: true }).waitFor();
  failList = false;
  await page.getByRole("alert").getByRole("button", { name: "Refresh resources", exact: true }).click();
  rows = rows.map((row) => ({ ...row, enabled: false }));
  await page.getByRole("button", { name: "Refresh resources", exact: true }).last().click();
  await page.getByRole("tab", { name: "Test retrieval", exact: true }).click();
  await page.getByText("No ready, enabled resources", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  rows = [];
  await page.getByRole("button", { name: "Refresh resources", exact: true }).last().click();
  await page.getByText("No resources yet", { exact: true }).waitFor();
  await page.waitForTimeout(150);
  const before = statusRequests.length + listRequests;
  await page.waitForTimeout(350);
  assert.equal(statusRequests.length + listRequests, before, "Polling stops once no pending resources remain");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Knowledge Base browser: real controls, PDF/text/JSON flows, failure/replacement, individual/batch/partial toggles, retrieval/no-match, details, statistics, English/Arabic and mobile navigation passed.");
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser state:", page.url(), (await page.locator("body").innerText()).slice(0, 2000));
  console.error("Page errors:", errors);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
