import { supabase } from "@/lib/supabase";
import { readStored, writeStored } from "@/lib/store";
import { parseDay, worshipKey, type WorshipDay } from "./data";

type WorshipRow = {
  user_id: string; day: string;
  fajr: WorshipDay["prayers"]["fajr"]; dhuhr: WorshipDay["prayers"]["dhuhr"];
  asr: WorshipDay["prayers"]["asr"]; maghrib: WorshipDay["prayers"]["maghrib"]; isha: WorshipDay["prayers"]["isha"];
  nawafil: number; checked: WorshipDay["checked"];
  istighfar: number; tasbih: number; salawat: number; sadaqah: boolean | null;
  intention: string; gratitude: string; care: string; tomorrow: string; note: string; saved_at: string;
};
export function toRow(uid: string, day: string, entry: WorshipDay): WorshipRow {
  const value = parseDay(JSON.stringify(entry));
  return { user_id: uid, day, ...value.prayers, nawafil: value.nawafil, checked: value.checked,
    ...value.counts, sadaqah: value.sadaqah, intention: value.intention, ...value.reflections,
    note: value.note, saved_at: value.savedAt ?? new Date().toISOString() };
}
export function fromRow(row: WorshipRow): WorshipDay {
  return parseDay(JSON.stringify({ prayers: { fajr: row.fajr, dhuhr: row.dhuhr, asr: row.asr, maghrib: row.maghrib, isha: row.isha },
    nawafil: row.nawafil, checked: row.checked, counts: { istighfar: row.istighfar, tasbih: row.tasbih, salawat: row.salawat },
    sadaqah: row.sadaqah, intention: row.intention, reflections: { gratitude: row.gratitude, care: row.care, tomorrow: row.tomorrow },
    note: row.note, savedAt: row.saved_at }));
}
function client() {
  const sb = supabase();
  if (!sb) throw new Error("Worship storage is unavailable.");
  return sb;
}
function cache(uid: string, day: string, entry: WorshipDay) {
  // The database save remains successful even when browser storage is full.
  try { writeStored(worshipKey(uid, day), JSON.stringify(entry)); } catch { /* Keep the confirmed result in React state. */ }
}
export async function loadWorship(uid: string, days: string[]): Promise<Record<string, WorshipDay>> {
  const sb = client();
  const read = () => sb.from("worship_entries").select("*").eq("user_id", uid).gte("day", days[0]).lte("day", days.at(-1)!);
  let result = await read();
  if (result.error) throw result.error;
  // Import entries from the earlier local-only UI without overwriting another device's saved day.
  const existing = new Set((result.data as WorshipRow[]).map(row => row.day));
  const imports = days.flatMap(day => {
    if (existing.has(day)) return [];
    let raw: string | null = null;
    try { raw = readStored(worshipKey(uid, day)); } catch { return []; }
    const entry = parseDay(raw);
    return entry.savedAt ? [toRow(uid, day, entry)] : [];
  });
  if (imports.length) {
    const { error } = await sb.from("worship_entries").upsert(imports, { onConflict: "user_id,day", ignoreDuplicates: true });
    if (error) throw error;
    result = await read();
    if (result.error) throw result.error;
  }
  return Object.fromEntries((result.data as WorshipRow[]).map(row => {
    const entry = fromRow(row); cache(uid, row.day, entry); return [row.day, entry];
  }));
}
export async function saveWorship(uid: string, day: string, entry: WorshipDay): Promise<WorshipDay> {
  const { data, error } = await client().from("worship_entries")
    .upsert(toRow(uid, day, { ...entry, savedAt: new Date().toISOString() }), { onConflict: "user_id,day" }).select("*").single();
  if (error) throw error;
  const saved = fromRow(data as WorshipRow);
  cache(uid, day, saved);
  return saved;
}
