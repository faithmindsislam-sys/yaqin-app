// Mirrors docs/CONTRACT.md.

export type Lang = "en" | "ar";
/** One side may be empty: a lesson can be written in English, Arabic, or both. */
export type Bi = { en: string; ar: string };

export type TrackId = "explore" | "first-steps" | "deepen";

export function isTrackId(value: unknown): value is TrackId {
  return value === "explore" || value === "first-steps" || value === "deepen";
}

export type SourceKind = "quran" | "hadith" | "tafsir" | "fiqh" | "aqidah" | "faq" | "dictionary" | "library";

export interface Source {
  id: string;
  kind: SourceKind;
  ref_en: string;
  ref_ar: string;
  text_ar: string;
  text_en: string;
  translation?: string | null;
  provider?: string | null;
  translation_status_en?: "published" | "unavailable" | "unsupported_provider";
  origin?: string | null;
  url?: string | null;
  grading?: string | null;
  review_status: "pending" | "approved" | "unreviewed";
  eligibility?: "rag_access_eligible";
  resource_id?: string;
  document_id?: string;
  passage_id?: string;
  original_text?: string;
  uri?: string;
  title?: string | null;
  description?: string | null;
  page_count?: number | null;
  page_start?: number | null;
  page_end?: number | null;
}

export type CardKind = "concept" | "quote" | "practice" | "check";
export type CardLabel = "obligatory" | "recommended" | "suggestion";

export interface Card {
  id: string;
  kind: CardKind;
  title: Bi;
  body?: Bi;
  /** Formatted body from the Studio editor, cleaned by the API. `body` is its plain text. */
  html?: Bi;
  takeaway?: Bi;
  image?: string | null;
  visual?: string;
  sources?: string[];
  /** Author-entered citations, separate from stored source IDs. */
  references?: string[];
  label?: CardLabel;
  audio?: Partial<Bi>;
}

export interface KeyIdea {
  id: string;
  en: string;
  ar: string;
  source?: string | null;
}

export interface QuizItem {
  id: string;
  question: Bi;
  options: Bi[];
  answer: number;
  explanation?: Bi;
  hint?: Bi;
  source?: string | null;
}

export interface Course {
  id: string;
  subject: string;
  tracks: TrackId[];
  /** Writing audience; membership and difficulty remain independent. */
  audience_track?: TrackId | "mixed" | null;
  level: number | "foundation" | "deeper";
  minutes: number;
  title: Bi;
  summary: Bi;
  cover?: string | null;
  /** Names credited for the lesson. */
  contributors?: string[];
  status: "draft" | "in_review" | "published" | "archived";
  /** Course setting, staff only: learners see the title locked ("Coming soon") and cannot open the course, whatever its status. Admins change it in the course details. */
  coming_soon?: boolean;
  cards: Card[];
  /** Legacy content metadata; no longer a course activity. */
  explain_back?: { prompt: Bi; key_ideas: KeyIdea[] };
  quiz?: QuizItem[];
}

/** Compatibility name for existing editor/player components; courses contain pages directly. */
export type Lesson = Course;

/** A course with the Coming soon setting on: learners see a locked title. It carries no content. */
export type ComingSoon = Pick<Course, "id" | "title" | "subject" | "level" | "tracks">;

/** Old cached drafts remain readable; new drafts use numbered levels. */
export function lessonLevel(level: Course["level"]): number {
  return level === "foundation" ? 1 : level === "deeper" ? 2 : level;
}

/** A recommended module of a track, independent of subject and course difficulty. */
export interface Module {
  id: string;
  title: Bi;
  goal?: Bi;
  lessons: string[];
}

export interface Track {
  id: TrackId;
  title: Bi;
  tagline: Bi;
  audience: Bi;
  modules: Module[];
}

export interface Subject { id: string; title: Bi; levels: number[] }
export interface Level { id: number; title: Bi }

export interface ContentBundle {
  tracks: Track[];
  courses: Record<string, Course>;
  /** Keyed by course id. The saved snapshot and older API versions do not send it. */
  coming_soon?: Record<string, ComingSoon>;
  subjects: Subject[];
  levels: Level[];
  sources: Record<string, Source>;
}

export type Tier = "A" | "B" | "C" | "D" | "OUT" | "NONE";

export type AnswerBlock = { type: "text"; text: string } | { type: "source"; id: string };

export interface AskResponse {
  tier: Tier;
  answer: AnswerBlock[];
  sources: Record<string, Source>;
  referral: Bi | null;
  follow_ups: string[];
  ai_generated: boolean;
  safety_outcome?: "allowed" | "safety_blocked" | "safety_unavailable";
  /** Set on a streamed draft while its evidence review is still running. */
  verifying?: boolean;
  /** Temporary practice only; never course content or assessment progress. */
  practice?: QuizItem[];
  practice_fallback?: boolean;
}
