import { request } from "@/lib/http";
import { normalizeTracks } from "@/features/courses/catalog";
import type { Lesson, Subject, Level, Track, Module, TrackId } from "@/lib/types";

export type CurriculumCourse = Pick<Lesson, "id" | "title" | "subject" | "level" | "tracks" | "status">;
export type Curriculum = {
  subjects: Subject[]; levels: Level[]; tracks: Track[]; courses: CurriculumCourse[];
  updated_at: Record<"subjects" | "levels" | "tracks", string | null>;
};
function normalizeCurriculum(data: Curriculum): Curriculum { return { ...data, tracks: normalizeTracks(data.tracks) }; }
export function curriculum(signal?: AbortSignal) { return request<Curriculum>("/curriculum", undefined, signal).then(normalizeCurriculum); }
export function saveSubjects(subjects: Subject[], updated_at: string | null) {
  return request<Curriculum>("/curriculum/subjects", { subjects, updated_at }).then(normalizeCurriculum);
}
export function saveLevels(levels: Level[], updated_at: string | null) {
  return request<Curriculum>("/curriculum/levels", { levels, updated_at }).then(normalizeCurriculum);
}
export function saveTrackModules(track: TrackId, modules: Module[], updated_at: string | null) {
  return request<Curriculum>(`/curriculum/tracks/${track}`, { modules, updated_at }).then(normalizeCurriculum);
}
