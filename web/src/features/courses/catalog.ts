import catalog from "@/lib/course-catalog.json";
const { subjects: subjectCatalog, migration } = catalog;
import type { Bi, ContentBundle, Course, Subject, Track, TrackId } from "@/lib/types";

export const SUBJECTS = subjectCatalog;
export const DEFAULT_LEVELS = catalog.levels;
export const FIRST_STEPS_TITLE: Bi = { en: "First Steps as a Muslim", ar: "خطواتي الأولى كمسلم" };

/** Track names stay consistent for older saved and live content. */
export function normalizeTracks(tracks: Track[]): Track[] {
  return tracks.map((track) => track.id === "first-steps" ? { ...track, title: FIRST_STEPS_TITLE } : track);
}
// Enable once course image resources are ready.
export const COURSE_IMAGES_ENABLED = false;
const seedSubjects: Record<string, string> = migration.courses;

/** Plain-language names for someone exploring Islam; registry labels remain editable. */
export function subjectTitle(subject: Subject | undefined, track?: TrackId | "all"): Bi | undefined {
  const plain: Record<string, Bi> = {
    aqidah: { en: "Belief", ar: "الإيمان" },
    fiqh: { en: "Worship and Practice", ar: "العبادة والعمل" },
    seerah: { en: "The Prophet’s Life", ar: "حياة النبي ﷺ" },
    hadith: { en: "The Prophet’s Teachings", ar: "تعاليم النبي ﷺ" },
  };
  const original = SUBJECTS.find((s) => s.id === subject?.id);
  return subject && track === "explore" && subject.title.en === original?.title.en && subject.title.ar === original?.title.ar
    ? plain[subject.id] ?? subject.title : subject?.title;
}

/** Read old saved snapshots at the boundary without migrating progress keys or prose. */
export function normalizeCourse(value: Course, tracks: Track[] = []): Course {
  const { track, module, tags: _tags, ...course } = value as Course & { track?: TrackId; module?: string; tags?: string[] };
  void _tags;
  const subjects: Record<string, string> = migration.modules;
  return { ...course, subject: course.subject ?? seedSubjects[course.id] ?? subjects[module ?? ""] ?? "islam",
    tracks: (course.tracks ?? [...new Set([...(track ? [track] : []), ...tracks.filter((t) => t.modules.some((m) => m.lessons.includes(course.id))).map((t) => t.id)])]).slice(0, 1) };
}

export function normalizeBundle(data: ContentBundle): ContentBundle {
  const old = data as ContentBundle & { lessons?: Record<string, Course> };
  const courses = Object.fromEntries(Object.entries(data.courses ?? old.lessons ?? {}).map(([id, c]) => [id, normalizeCourse(c, data.tracks)]));
  return { tracks: normalizeTracks(data.tracks), subjects: (data.subjects ?? SUBJECTS).map((s) => ({ ...s, levels: s.levels ?? DEFAULT_LEVELS.map((l) => l.id) })), levels: data.levels ?? DEFAULT_LEVELS, courses, coming_soon: data.coming_soon ?? {}, sources: data.sources };
}

/** Membership is course metadata; module IDs are retained solely for journey ordering. */
export function coursesInTrack(trackId: TrackId, tracks: Track[], courses: Record<string, Course>): Course[] {
  const order = tracks.find((t) => t.id === trackId)?.modules.flatMap((m) => m.lessons) ?? [];
  return [...new Set([...order, ...Object.keys(courses)])].map((id) => courses[id])
    .filter((course): course is Course => !!course && course.status === "published" && course.tracks.includes(trackId));
}

export function allCourses(courses: Record<string, Course>): Course[] {
  return Object.values(courses).filter((c) => c.status === "published");
}
