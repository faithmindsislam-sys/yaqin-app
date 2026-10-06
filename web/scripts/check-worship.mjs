import assert from "node:assert/strict";
import { loadSource } from "./load-source.mjs";

const { parseDay, emptyDay, localDay, dayDate, recentDays, worshipKey } = loadSource(new URL("../src/features/worship/data.ts", import.meta.url), {}, { Date });
const plain = value => JSON.parse(JSON.stringify(value));
for (const bad of [null, "invalid JSON", "null", "[]", "42"]) assert.deepEqual(plain(parseDay(bad)), plain(emptyDay()));
const entry = parseDay(JSON.stringify({ checked: ["quran", "quran", "unknown", null], counts: { istighfar: -5, tasbih: 1000000, salawat: 12.8 },
  prayers: { fajr: "prayed", dhuhr: "not-yet", asr: "missed", maghrib: "not-applicable", isha: {} }, nawafil: 2.9, sadaqah: false,
  savedAt: "2026-10-05T12:00:00Z", note: "n".repeat(2000), intention: "x".repeat(500), reflections: { gratitude: "A peaceful morning", care: {}, tomorrow: "y".repeat(2000) } }));
assert.deepEqual(plain(entry.checked), ["quran", "tasbih", "salawat"]);
assert.deepEqual(plain(entry.counts), { istighfar: 0, tasbih: 99999, salawat: 12 });
assert.deepEqual(plain(entry.prayers), { fajr: "prayed", dhuhr: "not-yet", asr: "missed", maghrib: null, isha: null });
assert.equal(entry.sadaqah, false); assert.equal(entry.savedAt, "2026-10-05T12:00:00Z"); assert.equal(entry.note.length, 1200);
assert.equal(entry.nawafil, 2);
for (const bad of [-4, null, "2", {}, Infinity]) assert.equal(parseDay(JSON.stringify({ nawafil: bad })).nawafil, 0);
assert.equal(parseDay('{"nawafil":100000}').nawafil, 99999);
assert.equal(entry.intention.length, 240); assert.equal(entry.reflections.gratitude, "A peaceful morning");
assert.equal(entry.reflections.care, ""); assert.equal(entry.reflections.tomorrow.length, 1200);
for (const bad of [null, {}, "100", Infinity]) assert.equal(parseDay(JSON.stringify({ count: bad })).counts.istighfar, 0);
const legacy = parseDay('{"count":12.8,"checked":["prayer","morning"],"reflections":{"gratitude":"A previous blessing"}}');
assert.equal(legacy.counts.istighfar, 12);
assert.deepEqual(plain(legacy.checked), ["morning", "istighfar"]);
assert.equal(legacy.prayers.fajr, null, "An old aggregate prayer checkbox never invents a Fajr answer");
assert.equal(legacy.nawafil, 0);
assert.equal(legacy.reflections.gratitude, "A previous blessing");
assert.equal(parseDay('{"sadaqah":"yes","savedAt":"invalid"}').sadaqah, null);
assert.equal(parseDay('{"savedAt":"invalid"}').savedAt, null);

const calendar = new Date(2026, 9, 5, 0, 1);
assert.equal(localDay(calendar), "2026-10-05");
assert.equal(localDay(dayDate("2026-10-05")), "2026-10-05");
assert.deepEqual(plain(recentDays("2026-03-02")), ["2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
assert.equal(new Set(recentDays("2026-10-27")).size, 7, "DST never duplicates a day");
assert.notEqual(worshipKey("alice", "2026-10-05"), worshipKey("bob", "2026-10-05"));
assert.notEqual(worshipKey("alice", "2026-10-05"), worshipKey("alice", "2026-10-06"));
const saved = new Map([[worshipKey("alice", "2026-10-05"), JSON.stringify(entry)]]);
assert.equal(parseDay(saved.get(worshipKey("alice", "2026-10-05"))).reflections.gratitude, "A peaceful morning");
assert.equal(parseDay(saved.get(worshipKey("alice", "2026-10-05"))).nawafil, 2);
assert.equal(parseDay(saved.get(worshipKey("alice", "2026-10-06"))).checked.length, 0);
assert.equal(parseDay(saved.get(worshipKey("bob", "2026-10-05"))).checked.length, 0);
console.log("PASS worship: prayer states, independent counters, sadaqah, legacy migration, bounded notes, malformed storage, local dates/DST and account/day isolation.");

const local = new Map();
const rows = new Map();
let fails = false, cacheFails = false;
const calls = [];
const sb = { from(table) {
  assert.equal(table, "worship_entries");
  let uid, start, end, single = false, payload, options;
  const query = {
    select() { return query; }, eq(key, value) { assert.equal(key, "user_id"); uid = value; return query; },
    gte(key, value) { assert.equal(key, "day"); start = value; return query; },
    lte(key, value) { assert.equal(key, "day"); end = value; return query; },
    upsert(value, opts) { payload = value; options = opts; return query; }, single() { single = true; return query; },
    then(resolve, reject) {
      calls.push({ uid, start, end, payload, options });
      if (fails) return Promise.resolve({ data: null, error: new Error("Database unavailable") }).then(resolve, reject);
      if (payload) for (const row of Array.isArray(payload) ? payload : [payload]) {
        const key = `${row.user_id}:${row.day}`;
        if (!options.ignoreDuplicates || !rows.has(key)) rows.set(key, row);
      }
      const data = payload ? single ? rows.get(`${payload.user_id}:${payload.day}`) : null : [...rows.values()].filter(row => row.user_id === uid && row.day >= start && row.day <= end);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  }; return query;
} };
const api = loadSource(new URL("../src/features/worship/api.ts", import.meta.url), {
  "@/lib/supabase": { supabase: () => sb },
  "@/lib/store": { readStored: key => local.get(key) ?? null, writeStored: (key, value) => { if (cacheFails) throw Error("Full"); local.set(key, value); } },
});
assert.deepEqual(plain(api.fromRow(api.toRow("alice", "2026-10-05", entry))), plain(entry));
const savedRemote = await api.saveWorship("alice", "2026-10-05", entry);
assert.equal(savedRemote.nawafil, 2);
assert.equal(calls.at(-1).options.onConflict, "user_id,day");
await api.saveWorship("alice", "2026-10-05", { ...entry, note: "Updated" });
assert.equal(rows.size, 1, "Re-saving updates a single day");
cacheFails = true;
assert.equal((await api.saveWorship("alice", "2026-10-05", { ...entry, note: "Cloud saved" })).note, "Cloud saved");
cacheFails = false;
local.set(worshipKey("alice", "2026-10-04"), JSON.stringify(entry));
local.set(worshipKey("alice", "2026-10-03") + ".draft", JSON.stringify(entry));
const remoteDays = await api.loadWorship("alice", recentDays("2026-10-05"));
assert.equal(remoteDays["2026-10-05"].note, "Cloud saved", "Cloud entry wins over stale local cache");
assert.equal(remoteDays["2026-10-04"].nawafil, 2, "Existing registered entries migrate");
assert.equal(remoteDays["2026-10-03"], undefined, "Drafts are never imported");
assert(calls.some(call => call.options?.ignoreDuplicates), "Legacy import cannot overwrite a racing remote save");
assert.equal(Object.keys(await api.loadWorship("bob", recentDays("2026-10-05"))).length, 0);
fails = true;
await assert.rejects(api.saveWorship("alice", "2026-10-05", entry), /Database unavailable/);
await assert.rejects(api.loadWorship("alice", recentDays("2026-10-05")), /Database unavailable/);
assert.equal(rows.get("alice:2026-10-05").note, "Cloud saved", "Failed saves preserve the registered entry");
console.log("PASS worship cloud: round-trip fields, daily upsert, bounded account/date reads, local imports, draft privacy and failed-save/cache recovery.");
