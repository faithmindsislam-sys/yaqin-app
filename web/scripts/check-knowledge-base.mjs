// Exercise the shipped parser, file validation, transfer handling and resource eligibility.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadSource } from "./load-source.mjs";
import * as jsx from "react/jsx-runtime";

let resourceRequest;
const api = loadSource(new URL("../src/features/studio/knowledge-base/api.ts", import.meta.url), {
  "@/lib/http": { request: (...args) => { resourceRequest = args; } },
}, { URLSearchParams });
const listSignal = new AbortController().signal;
api.knowledgeResources({ page: 22, page_size: 25, q: "نص%_.pdf", status: "COMPLETED" }, listSignal);
const listUrl = new URL(resourceRequest[0], "https://example.test");
assert.equal(listUrl.pathname, "/admin/rag/resources");
assert.deepEqual(Object.fromEntries(listUrl.searchParams), { page: "22", page_size: "25", q: "نص%_.pdf", status: "COMPLETED" });
assert.equal(resourceRequest[1], undefined);
assert.equal(resourceRequest[2], listSignal);
api.knowledgeResources({ page: 1, page_size: 100, q: "" });
assert.equal(new URL(resourceRequest[0], "https://example.test").searchParams.has("status"), false);

let latestXHR;
class Transfer {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Exposes the fake transport to drive browser events.
  constructor() { latestXHR = this; this.upload = {}; this.headers = {}; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  send(file) { this.file = file; }
  abort() { this.onabort(); }
}
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/features/studio/knowledge-base/model.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, XMLHttpRequest: Transfer, TextDecoder });
const kb = mod.exports;
assert.equal(kb.resourceLabel({ title: " Book ", description: "Summary", filename: "publisher-id.pdf" }), "Book");
assert.equal(kb.resourceLabel({ title: "", description: "Summary", filename: "publisher-id.pdf" }), "Summary");
assert.equal(kb.resourceLabel({ filename: "notes.pdf" }), "notes.pdf");
api.saveResourceMetadata("a".repeat(32), { title: "Book", description: "Short summary" });
assert.equal(resourceRequest[0], `/admin/rag/resources/${"a".repeat(32)}/metadata`);
assert.deepEqual(resourceRequest[1], { title: "Book", description: "Short summary" });
api.deleteResource("a".repeat(32));
assert.equal(resourceRequest[0], `/admin/rag/resources/${"a".repeat(32)}/delete`);
assert.equal(JSON.stringify(resourceRequest[1]), "{}");
const records = kb.jsonRecords('[{"title":"عنوان","body":"نص عربي","extra":"hidden"},{"body":"Second"}]');
assert.equal(kb.extractJson(records, { textField: "body", titleField: "title" }), "عنوان\n\nنص عربي\n\n---\n\nSecond");
for (const json of ["{", "[]", "null", "[1]", '"text"']) assert.throws(() => kb.jsonRecords(json));
for (const json of ['{"body":12}', '{"body":""}', '{"body":"text","title":12}']) {
  assert.throws(() => kb.extractJson(kb.jsonRecords(json), { textField: "body", titleField: "title" }));
}
const text = new File(["Source text"], "source.txt", { type: "text/plain" });
assert.equal(await kb.validateResourceFile(text), "text/plain");
assert.equal(await kb.validateResourceFile(new File(["%PDF-1.7\nbytes"], "source.pdf")), "application/pdf");
assert.equal(await kb.validateResourceFile(new File(['{"body":"text"}'], "source.json"), true), "application/json");
for (const file of [new File([], "empty.txt"), new File(["wrong"], "a.pdf"), new File(["text"], "a.exe"),
  new File([Uint8Array.from([0xff])], "a.txt"), new File(["text"], "../a.txt"), new File(["{}"], "a.json")]) {
  await assert.rejects(kb.validateResourceFile(file));
}
const registration = { documentId: "a".repeat(32), resourceId: "a".repeat(32), uploadUrl: "https://storage.test/temporary", method: "PUT", expiresIn: 900 };
const progress = [];
const signal = new AbortController();
const uploading = kb.uploadResource(registration, text, "text/plain", (p) => progress.push(p), signal.signal);
assert.equal(latestXHR.method, "PUT");
assert.equal(latestXHR.headers["Content-Type"], "text/plain");
assert.deepEqual(Object.keys(latestXHR.headers), ["Content-Type"], "No auth or permanent storage credentials sent to storage");
latestXHR.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
latestXHR.status = 200; latestXHR.onload(); await uploading;
assert.deepEqual(progress, [50, 100]);
for (const scenario of ["expired", "network", "abort", "timeout"]) {
  const controller = new AbortController();
  const promise = kb.uploadResource(registration, text, "text/plain", () => {}, controller.signal);
  const rejection = assert.rejects(promise, /expired|interrupted|uploadFailed/);
  if (scenario === "expired") { latestXHR.status = 403; latestXHR.onload(); }
  if (scenario === "network") latestXHR.onerror();
  if (scenario === "abort") controller.abort();
  if (scenario === "timeout") latestXHR.ontimeout();
  await rejection;
}
await assert.rejects(kb.uploadResource({ ...registration, expiresIn: 0 }, text, "text/plain", () => {}, signal.signal), /expired/);
const rows = [
  { status: "COMPLETED", enabled: true }, { status: "COMPLETED", enabled: false },
  { status: "IN_PROGRESS", enabled: true }, { status: "WAITING_UPLOAD", enabled: false },
  { status: "PENDING", enabled: true }, { status: "FAILED", enabled: true },
];
assert.equal(rows.filter(kb.eligibleResource).length, 1);
assert.equal(rows.filter(kb.pendingResource).length, 3);

// Render the actual screen with a small filtered page and larger server totals.
// This catches using the loaded rows for Statistics, including missing upstream totals.
const states = [];
let stateIndex = 0;
let reload;
let listData = { resources: [{ documentId: "a".repeat(32), filename: "book.pdf", status: "COMPLETED", enabled: true }],
  total: 1, page: 1, pageSize: 25,
  statistics: { loaded: 156, completed: 146, eligible: 140, waiting: 0, queued: 10, processing: 0, failed: 0 } };
const screen = loadSource(new URL("../src/features/studio/knowledge-base/KnowledgeBase.tsx", import.meta.url), {
  "react/jsx-runtime": jsx,
  react: { useState: initial => {
    const i = stateIndex++;
    if (i === states.length) states.push(initial);
    return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
  }, useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => { reload = fn; return fn; } },
  "lucide-react": Object.fromEntries(["BarChart3", "CheckCircle2", "ChevronRight", "CircleAlert", "Eye", "FileText", "Info", "LibraryBig", "LoaderCircle", "Plus", "Power", "RefreshCw", "Search", "Trash2", "X"].map(name => [name, "icon"])),
  "@/components/AppShell": { AppShell: "shell" }, "@/components/Scenery": { PageBanner: "banner" },
  "@/components/Select": { Select: "select" },
  "@/features/studio/knowledge-base/AddResource": { AddResource: "upload" },
  "@/lib/http": { apiEnabled: true },
  "@/features/studio/knowledge-base/api": { knowledgeResources: async () => listData },
  "@/lib/i18n": { useI18n: () => ({ t: value => value.en, lang: "en", dir: "ltr" }) },
  "@/features/auth/roles": { canReview: () => true },
  "@/features/auth/SessionProvider": { useSession: () => ({ user: { id: "admin" }, role: "admin" }) },
}, { AbortController, setTimeout, clearTimeout, document: { getElementById: () => ({ focus() {} }) } });
const access = screen.default().props.children;
const workspace = access.type(access.props);
const render = () => { stateIndex = 0; return workspace.type(workspace.props); };
const nodes = tree => !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const textOf = tree => !tree ? "" : Array.isArray(tree) ? tree.map(textOf).join("") : typeof tree === "object" ? textOf(tree.props?.children) : String(tree);
render(); await reload();
const actions = () => nodes(nodes(render()).find(node => node.props?.className === "kb-row-actions")).filter(node => node.type === "button");
assert.deepEqual(actions().map(node => node.props["data-tip"]), ["Details", "Disable", "Delete"]);
assert.ok(actions().every(node => node.props.className.includes("tip") && !node.props.title && node.props["aria-label"]));
let panel = nodes(render()).find(node => node.props?.id === "kb-panel-statistics");
const metrics = nodes(panel).filter(node => node.props?.className?.includes("studio-metric-count"));
assert.deepEqual(metrics.map(textOf), ["156", "146", "140"]);
const queued = nodes(panel).find(node => node.type === "button" && textOf(node) === "Queued10");
assert.ok(queued, "Queued count must include resources beyond the loaded page");
queued.props.onClick();
assert.equal(nodes(render()).find(node => node.type === "select" && node.props.label === "Ingestion status").props.value, "PENDING");
listData = { ...listData, resources: listData.resources.map(row => ({ ...row, enabled: false })), statistics: undefined };
await reload();
assert.equal(actions()[1].props["data-tip"], "Enable");
panel = nodes(render()).find(node => node.props?.id === "kb-panel-statistics");
assert.match(textOf(panel), /Whole-library statistics are unavailable/);
assert.equal(nodes(panel).filter(node => node.props?.className?.includes("studio-metric-count")).length, 0);
console.log("Knowledge Base: paginated request/filter encoding, JSON extraction, PDF/text validation, upload progress/errors/abort/expiry and eligibility passed.");
console.log("Statistics: whole-library server totals, status drill-down and missing-statistics handling passed.");
