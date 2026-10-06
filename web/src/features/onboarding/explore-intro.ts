"use client";

import { useSession } from "@/features/auth/SessionProvider";
import { useContent } from "@/features/courses/ContentProvider";
import { useProgress } from "@/features/learning/progress";

/** The Explore introduction is shown once: before the learner's first time on the Explore track. */
export function useExploreIntroSeen(): boolean {
  const { prefs } = useSession();
  const { trackLessons } = useContent();
  const progress = useProgress();
  // ponytail: derived from the saved track and progress, no stored flag. Someone who picked Explore,
  // opened no lesson and switched away sees the introduction once more; add a profile column if that matters.
  return prefs.track === "explore" || trackLessons("explore").some((lesson) => progress.lessons[lesson.id]);
}
