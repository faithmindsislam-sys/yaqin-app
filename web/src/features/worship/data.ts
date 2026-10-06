import type { Bi } from "@/lib/types";

const b = (en: string, ar: string): Bi => ({ en, ar });
export const W = {
  title: b("Plan Your Worship", "خطّط لعبادتك"),
  sub: b("A daily check-in. A moment of gratitude. One small step forward.", "وقفة يومية، ولحظة امتنان، وخطوة صغيرة إلى الأمام."),
  eyebrow: b("YOUR DAILY CHECK-IN", "وقفتك اليومية"),
  hero: b("A little time. A little reflection.", "قليل من الوقت، ولحظة تأمّل."),
  week: b("Your past seven days", "أيامك السبعة الأخيرة"),
  today: b("Today", "اليوم"),
  steps: b("Daily check-in steps", "خطوات الوقفة اليومية"),
  prayers: b("My prayers", "صلواتي"),
  prayersSub: b("Reflect on each prayer for this day. You can update your answers later.", "تأمّل كل صلاة في هذا اليوم. يمكنك تحديث إجاباتك لاحقًا."),
  prayed: b("Prayed", "صلّيت"),
  notYet: b("Not yet", "ليس بعد"),
  missed: b("Didn’t pray", "لم أصلِّ"),
  nawafil: b("Voluntary prayers · Nawafil", "صلوات النوافل"),
  nawafilCount: b("How many voluntary prayers did I pray?", "كم صلاة نافلة صلّيت؟"),
  nawafilHint: b("Count prayers, rather than individual rak’ahs.", "سجّل عدد الصلوات، لا عدد الركعات."),
  unanswered: b("Not answered", "دون إجابة"),
  checklist: b("My daily worship", "عباداتي اليومية"),
  checklistSub: b("Check what you did. Add a count for your dhikr if you wish.", "ضع علامة أمام ما فعلته. وأضف عددًا لذكرك إن شئت."),
  gratitude: b("My gratitude", "امتناني"),
  reflection: b("Pause. Notice. Say alhamdulillah.", "توقّف. تأمّل. قل الحمد لله."),
  reflectionSub: b("A few words are enough. You can leave any answer blank.", "تكفي كلمات قليلة. يمكنك ترك أي إجابة فارغة."),
  reflectionHint: b("Something small counts, too…", "حتى الأمور الصغيرة تستحق الامتنان…"),
  review: b("Review & save", "راجع واحفظ"),
  reviewSub: b("Here is your day at a glance. Revisit any step before saving.", "هذه لمحة عن يومك. يمكنك العودة إلى أي خطوة قبل الحفظ."),
  intention: b("My intention for this day (optional)", "نيّتي لهذا اليوم (اختياري)"),
  intentionHint: b("For example: be more present in my prayer.", "مثلًا: أحضر بقلبي أكثر في صلاتي."),
  note: b("A personal note (optional)", "ملاحظة شخصية (اختياري)"),
  noteHint: b("Anything else you would like to remember about this day…", "أي شيء آخر تودّ تذكّره من هذا اليوم…"),
  sadaqah: b("Did I give sadaqah on this day?", "هل قدّمت صدقة في هذا اليوم؟"),
  yes: b("Yes", "نعم"),
  no: b("No", "لا"),
  charity: b("Sadaqah", "الصدقة"),
  counters: b("My dhikr", "أذكاري"),
  countOptional: b("Counting is optional. You can simply tick that you did it.", "العدّ اختياري. يمكنك الاكتفاء بعلامة أنك فعلته."),
  fewer: b("Remove one", "أنقص واحدًا"),
  next: b("Continue", "متابعة"),
  back: b("Back", "رجوع"),
  edit: b("Edit", "تعديل"),
  save: b("Save my day", "احفظ يومي"),
  saved: b("Saved", "محفوظ"),
  savedMessage: b("Your day is saved to your account. Revisit it using the dates above.", "حُفظ يومك في حسابك. يمكنك الرجوع إليه من التواريخ أعلاه."),
  draft: b("Draft", "مسوّدة"),
  draftHint: b("Your draft stays on this device. Register it with “Save my day” in the final step.", "تبقى مسوّدتك على هذا الجهاز. سجّلها بزر «احفظ يومي» في الخطوة الأخيرة."),
  savedHint: b("You can edit this entry and save it again whenever you wish.", "يمكنك تعديل هذا السجل وحفظه مجددًا متى شئت."),
  local: b("Saved days are private to your account and available across devices. Drafts stay on this device.", "الأيام المحفوظة خاصة بحسابك ومتاحة عبر أجهزتك. تبقى المسوّدات على هذا الجهاز."),
  saveError: b("Your changes could not be saved. Your current answers are still on this page. Please try again.", "تعذّر حفظ تغييراتك. إجاباتك الحالية ما زالت في الصفحة. حاول مجددًا."),
  saving: b("Saving…", "جارٍ الحفظ…"),
  loadError: b("Your saved days could not be loaded. Your drafts are still on this device. Please try again.", "تعذّر تحميل أيامك المحفوظة. ما زالت مسوّداتك على هذا الجهاز. حاول مجددًا."),
  retry: b("Try again", "حاول مجددًا"),
  results: b("Your saved day", "يومك المحفوظ"),
  resultsSub: b("Your saved check-in for this day. Choose another date above to view it.", "وقفتك المحفوظة لهذا اليوم. اختر تاريخًا آخر أعلاه لعرضه."),
  editDay: b("Edit this day", "عدّل هذا اليوم"),
  lastSaved: b("Last saved", "آخر حفظ"),
  journal: b("DAILY JOURNAL", "دفتر يومي"),
  intentionLabel: b("My intention", "نيّتي"),
  noteLabel: b("A note to remember", "ملاحظة أتذكّرها"),
  done: b("Done", "تمّ"),
  notChecked: b("Not checked", "غير محدّد"),
  prayedCount: b("prayed", "صلوات أدّيتها"),
  noneChecked: b("No practices checked yet.", "لم تحدّد ممارسات بعد."),
  emptyReflection: b("No reflection added.", "لم تُضف تأمّلًا."),
  openQuran: b("Open Quran", "افتح القرآن"),
  loading: b("Preparing your daily plan…", "جارٍ تجهيز خطتك اليومية…"),
};

export const PRAYERS = [
  { id: "fajr", title: b("Fajr", "الفجر"), icon: "sunrise" },
  { id: "dhuhr", title: b("Dhuhr", "الظهر"), icon: "sun" },
  { id: "asr", title: b("Asr", "العصر"), icon: "sun" },
  { id: "maghrib", title: b("Maghrib", "المغرب"), icon: "sunset" },
  { id: "isha", title: b("Isha", "العشاء"), icon: "moon" },
] as const;
export const PRAYER_STATES = [
  { id: "prayed", label: W.prayed }, { id: "not-yet", label: W.notYet }, { id: "missed", label: W.missed },
] as const;
export const DAILY_HABITS = [
  { id: "morning", icon: "sunrise", title: b("Morning adhkar", "أذكار الصباح"), question: b("Did I read my morning adhkar?", "هل قرأت أذكار الصباح؟") },
  { id: "evening", icon: "moon", title: b("Evening adhkar", "أذكار المساء"), question: b("Did I read my evening adhkar?", "هل قرأت أذكار المساء؟") },
  { id: "quran", icon: "book", title: b("Quran", "القرآن"), question: b("Did I read some Quran?", "هل قرأت شيئًا من القرآن؟") },
  { id: "hifz", icon: "hifz", title: b("Hifz & revision", "الحفظ والمراجعة"), question: b("Did I memorize or revise?", "هل حفظت أو راجعت؟") },
  { id: "dua", icon: "heart", title: b("Dua", "الدعاء"), question: b("Did I take a moment to make dua?", "هل خصّصت لحظة للدعاء؟") },
] as const;
export const COUNTERS = [
  { id: "istighfar", icon: "sparkles", title: b("Istighfar", "الاستغفار"), question: b("How many times did I make istighfar?", "كم مرة استغفرت؟") },
  { id: "tasbih", icon: "sun", title: b("Tasbih", "التسبيح"), question: b("How many times did I make tasbih?", "كم مرة سبّحت؟") },
  { id: "salawat", icon: "heart", title: b("Salawat on the Prophet ﷺ", "الصلاة على النبي ﷺ"), question: b("How many times did I send salawat on the Prophet ﷺ?", "كم مرة صلّيت على النبي ﷺ؟") },
] as const;
export const HABITS = [...DAILY_HABITS, ...COUNTERS] as const;
export const REFLECTIONS = [
  { id: "gratitude", title: b("What am I grateful for today?", "ما الذي أشكر الله عليه اليوم؟"), hint: b("A person, a moment, or a blessing you noticed.", "شخص، أو لحظة، أو نعمة انتبهت إليها."), label: b("NOTICE A BLESSING", "لاحظ نعمة") },
  { id: "care", title: b("Where did I notice Allah’s care today?", "أين لمست لطف الله بي اليوم؟"), hint: b("Support, relief, or something you usually take for granted.", "عون، أو فرج، أو شيء اعتدت عليه ولم تنتبه له."), label: b("REFLECT ON YOUR DAY", "تأمّل يومك") },
  { id: "tomorrow", title: b("What small good action will I take tomorrow?", "ما عمل الخير الصغير الذي سأفعله غدًا؟"), hint: b("One small action you would like to carry forward.", "خطوة صغيرة تودّ أن تبدأ بها غدًا."), label: b("CARRY IT FORWARD", "حوّل الامتنان إلى عمل") },
] as const;
export const STEPS = [W.prayers, W.checklist, W.gratitude, W.review];
export type HabitId = typeof HABITS[number]["id"];
export type CounterId = typeof COUNTERS[number]["id"];
export type PrayerId = typeof PRAYERS[number]["id"];
export type PrayerState = typeof PRAYER_STATES[number]["id"];
export type ReflectionId = typeof REFLECTIONS[number]["id"];
export type WorshipDay = {
  prayers: Record<PrayerId, PrayerState | null>;
  nawafil: number;
  checked: HabitId[];
  counts: Record<CounterId, number>;
  sadaqah: boolean | null;
  intention: string;
  reflections: Record<ReflectionId, string>;
  note: string;
  savedAt: string | null;
};
export const emptyDay = (): WorshipDay => ({ prayers: { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null }, nawafil: 0, checked: [], counts: { istighfar: 0, tasbih: 0, salawat: 0 }, sadaqah: null, intention: "", reflections: { gratitude: "", care: "", tomorrow: "" }, note: "", savedAt: null });
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
export const boundedCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(99999, Math.floor(value))) : 0;
export function parseDay(raw: string | null): WorshipDay {
  let value: Record<string, unknown>;
  try { value = record(JSON.parse(raw ?? "null")); } catch { return emptyDay(); }
  const prayers = record(value.prayers), counts = record(value.counts), reflections = record(value.reflections);
  const prayer = (id: PrayerId): PrayerState | null => PRAYER_STATES.find(state => state.id === prayers[id])?.id ?? null;
  // Preserve the first version's istighfar count and reflections when opening old entries.
  const normalizedCounts = { istighfar: boundedCount(counts.istighfar ?? value.count), tasbih: boundedCount(counts.tasbih), salawat: boundedCount(counts.salawat) };
  return {
    prayers: { fajr: prayer("fajr"), dhuhr: prayer("dhuhr"), asr: prayer("asr"), maghrib: prayer("maghrib"), isha: prayer("isha") },
    nawafil: boundedCount(value.nawafil),
    checked: HABITS.filter(h => (Array.isArray(value.checked) && value.checked.includes(h.id)) || (h.id in normalizedCounts && normalizedCounts[h.id as CounterId] > 0)).map(h => h.id),
    counts: normalizedCounts, sadaqah: typeof value.sadaqah === "boolean" ? value.sadaqah : null,
    intention: text(value.intention, 240), note: text(value.note, 1200),
    reflections: { gratitude: text(reflections.gratitude, 1200), care: text(reflections.care, 1200), tomorrow: text(reflections.tomorrow, 1200) },
    savedAt: typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt)) ? value.savedAt : null,
  };
}
// Use the learner's local calendar day, including across timezone and DST changes.
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const dayDate = (day: string) => new Date(`${day}T12:00:00`);
export function recentDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => { const date = dayDate(today); date.setDate(date.getDate() - 6 + i); return localDay(date); });
}
export const worshipKey = (uid: string, day: string) => `yaqin.worship.${uid}.${day}`;
