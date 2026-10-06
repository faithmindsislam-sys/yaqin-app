// Exercise the merged request handler without live API calls or a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/ask/Ask.tsx", import.meta.url), "utf8");
const handler = source.match(/  async function send[\s\S]+?(?=\n  const lastAnswer)/)?.[0];
assert(handler, "The real chat request handler must be present");
const compiled = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const draft = { answer: [{ type: "text", text: "Draft" }] };
const final = { answer: [{ type: "text", text: "Verified" }] };
function scenario(stream, plain = () => assert.fail("Unexpected fallback")) {
  const state = { msgs: [], busy: false, active: { current: true }, controller: { current: null },
    AbortController, lang: "en", track: "explore", dictation: { stop() {} }, chatHistory: () => [],
    setQ() {}, setBusy: (value) => { state.busy = value; },
    setMsgs: (value) => { state.msgs = typeof value === "function" ? value(state.msgs) : value; },
    askStream: (...args) => stream(state, ...args), ask: plain };
  return { state, send: vm.runInNewContext(compiled + "\nsend;", state) };
}
const streamed = scenario(async (state, params, handlers) => {
  handlers.onDraft(draft);
  assert.equal(state.msgs.at(-1).data.verifying, true);
  handlers.onFinal(final);
});
await streamed.send("Question");
assert.equal(streamed.state.msgs.length, 2, "Final replaces the draft");
assert.equal(streamed.state.msgs.at(-1).data.answer[0].text, "Verified");
assert.equal(streamed.state.msgs.at(-1).data.verifying, false);
assert.equal(streamed.state.busy, false);

const fallback = scenario(async (state, params, handlers) => {
  handlers.onDraft(draft);
  throw new Error("Stream interrupted");
}, async () => final);
await fallback.send("Question");
assert.equal(fallback.state.msgs.length, 2);
assert.equal(fallback.state.msgs.at(-1).data.answer[0].text, "Verified");
assert.equal(fallback.state.msgs.at(-1).data.verifying, false);

const failed = scenario(async (state, params, handlers) => {
  handlers.onDraft(draft);
  throw new Error("Stream interrupted");
}, async () => { throw new Error("API unavailable"); });
await failed.send("Question");
assert.equal(failed.state.msgs.length, 2);
assert.equal(failed.state.msgs.at(-1).role, "error", "Failed drafts are removed");

const aborted = scenario(async (state, params, handlers) => {
  state.controller.current.abort();
  state.msgs = [];
  state.busy = false;
  handlers.onDraft(draft);
  handlers.onFinal(final);
  throw new Error("Aborted");
});
await aborted.send("Question");
assert.equal(aborted.state.msgs.length, 0, "Replies cannot reappear after leaving");
assert.equal(aborted.state.busy, false);
console.log("PASS Ask merge: streamed draft/final, fallback, errors and aborted replies.");
