"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ContentBundle, TrackId } from "@/lib/types";
import { apiEnabled } from "@/lib/http";
import { contentBundle } from "@/features/courses/api";
import { allCourses, coursesInTrack, normalizeBundle } from "@/features/courses/catalog";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import routes from "@/lib/routes.json";

const initial: ContentBundle = { tracks: [], courses: {}, subjects: [], levels: [], sources: {} };
function checkedContent(data: ContentBundle): ContentBundle {
  if (!data || !Array.isArray(data.tracks) ||
    ![data.courses ?? (data as ContentBundle & { lessons?: unknown }).lessons, data.sources].every((value) => value && typeof value === "object" && !Array.isArray(value))) {
    throw new Error("Invalid content response");
  }
  return normalizeBundle(data);
}
let savedContent: Promise<ContentBundle> | null = null;
function loadSavedContent() {
  return savedContent ??= fetch("/data/content.json").then((res) => {
    if (!res.ok) throw new Error(`Saved content ${res.status}`);
    return res.json() as Promise<ContentBundle>;
  }).then(checkedContent).catch((e) => { savedContent = null; throw e; });
}
type ContentStatus = "loading" | "ready" | "empty" | "error";
const Ctx = createContext({ bundle: initial, status: "loading" as ContentStatus, refresh: async () => {} });

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user } = useSession();
  const pathname = usePathname().replace(/\/$/, "");
  const authPage = ["/signin", "/auth/callback", "/auth/bridge", "/reset-password"].includes(pathname);
  const sitePage = (routes as Record<string, { surface: string }>)[pathname + "/"]?.surface === "site";
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    let saved: ContentBundle | null = null;
    try {
      const snapshot = await loadSavedContent();
      if (version !== request.current) return;
      saved = snapshot;
      // Keep newer live lessons when a later refresh cannot reach the API.
      setBundle((current) => current.tracks.length ? current : snapshot);
    } catch { /* The live API can still provide content if the snapshot is missing. */ }
    if (version !== request.current) return;
    if (!apiEnabled || !user) { setError(!saved); setLoading(false); return; }
    try {
      // Display the saved snapshot while checking for newer live lessons.
      const data = checkedContent(await contentBundle());
      if (version !== request.current) return;
      setBundle(data); setError(false);
    } catch { if (version === request.current) setError(true); }
    finally { if (version === request.current) setLoading(false); }
  }, [user]);
  useEffect(() => {
    if (sitePage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh reads an external API asynchronously.
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const pending = request;
    return () => { pending.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh, sitePage]);
  const status: ContentStatus = loading ? "loading" : error ? "error" : Object.keys(bundle.courses).length ? "ready" : "empty";
  const value = useMemo(() => ({ bundle, status, refresh }), [bundle, status, refresh]);
  return <Ctx.Provider value={value}>
    {error && !authPage && !sitePage && <div role="status" className="bg-amber-50 px-5 py-2 text-center text-sm text-amber-900">
      {t(bundle.tracks.length
        ? { en: "Live courses are unavailable. Showing saved content.", ar: "الدورات المباشرة غير متاحة. نعرض المحتوى المحفوظ." }
        : { en: "Courses are currently unavailable. Please try again.", ar: "الدورات غير متاحة حاليًا. حاول مرة أخرى." })} {" "}
      <button className="underline" onClick={() => void refresh()}>{t({ en: "Retry", ar: "إعادة المحاولة" })}</button>
    </div>}
    {!authPage && !sitePage && !error && status !== "ready" && <p role="status" className="bg-sky-50 px-5 py-2 text-center text-sm text-muted">
      {t(status === "loading" ? { en: "Loading courses…", ar: "جارٍ تحميل الدورات…" }
        : { en: "No courses are available yet.", ar: "لا توجد دورات متاحة بعد." })}
    </p>}
    {children}
  </Ctx.Provider>;
}

export function useContent() {
  const { bundle, status, refresh } = useContext(Ctx);
  return useMemo(() => {
    const { tracks, courses: lessons, subjects, levels, sources, coming_soon: comingSoon = {} } = bundle;
    const getTrack = (id: string | null | undefined) => tracks.find((t) => t.id === id);
    const getLesson = (id: string | null | undefined) => id ? lessons[id] : undefined;
    const trackLessons = (trackId: TrackId) => coursesInTrack(trackId, tracks, lessons);
    const allLessons = () => allCourses(lessons);
    const nextLessonAfter = (id: string, trackId?: TrackId) => {
      const lesson = lessons[id];
      if (!lesson) return undefined;
      const list = trackLessons(trackId && lesson.tracks.includes(trackId) ? trackId : lesson.tracks[0]);
      const index = list.findIndex((course) => course.id === id);
      return [...list.slice(index + 1), ...list.slice(0, index)];
    };
    return { tracks, subjects, levels, lessons, comingSoon, sources, getTrack, getLesson, trackLessons, allLessons, nextLessonAfter, status, refresh };
  }, [bundle, status, refresh]);
}
