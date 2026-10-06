import type { StaffLesson } from "@/features/studio/api";

export type EditorDraft = { lesson: StaffLesson; saved: string; modules: Record<string, string> };
export const draftKey = (uid: string, id: string | null) => `yaqin.studio.draft.${uid}.${id || "new"}`;

export function readDraft(key: string): EditorDraft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const lesson = draft?.lesson;
    return lesson && typeof lesson.id === "string" && ["en", "ar"].every((lang) => typeof lesson.title?.[lang] === "string" && typeof lesson.summary?.[lang] === "string")
      && Array.isArray(lesson.cards) && lesson.cards.every((card: { id?: unknown; title?: unknown }) => typeof card?.id === "string" && !!card.title)
      && Array.isArray(lesson.tracks) && typeof draft.saved === "string"
      && draft.modules && typeof draft.modules === "object" && Object.values(draft.modules).every((value) => typeof value === "string") ? draft : null;
  } catch { return null; }
}

export function keepDraft(key: string, draft: EditorDraft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch { /* beforeunload still protects the draft when browser storage is blocked. */ }
}
