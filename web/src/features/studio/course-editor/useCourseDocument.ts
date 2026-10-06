"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { apiEnabled } from "@/lib/http";
import { curriculum, saveTrackModules } from "@/features/studio/curriculum/api";
import { lessonHistory, reviewDecision, saveDraft, staffLesson, submitDraft, unpublishLesson, updatePublished, type LessonEvent, type StaffLesson } from "@/features/studio/api";
import { draftKey, keepDraft, readDraft } from "./drafts";
import { useContent } from "@/features/courses/ContentProvider";
import { normalizeCourse } from "@/features/courses/catalog";
import { useI18n } from "@/lib/i18n";
import { canReview, isStaff } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";
import { lessonLevel, type Card, type Lesson } from "@/lib/types";
import { content, empty, filled, gaps, newSection, payload } from "./model";
const E = S.editor;

/** The editable document, browser recovery, and its save/review/publish transitions. */
export function useCourseDocument(id: string | null) {
  const { t } = useI18n();
  const { role, user } = useSession();
  const { tracks, subjects, refresh } = useContent();
  const router = useRouter();
  const [lesson, setLesson] = useState<StaffLesson | null>(null);
  const saved = useRef("");
  const revision = useRef(0);
  const [moduleChoices, setModuleChoices] = useState<Record<string, string>>({});
  const dirty = !!lesson && (content(lesson) !== saved.current || lesson.tracks.some((trackId) => !!moduleChoices[trackId]
    && tracks.find((track) => track.id === trackId)?.modules.find((module) => module.lessons.includes(lesson.id))?.id !== moduleChoices[trackId]));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [recovered, setRecovered] = useState(false);
  const opened = useRef<string | null>(null);
  const [history, setHistory] = useState<LessonEvent[] | "loading" | "error">("loading");
  const alive = useRef(true);
  const staff = isStaff(role) && !!user && apiEnabled;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!staff || !user) return;
    let active = true;
    const cached = readDraft(draftKey(user.id, id));
    const restore = () => {
      if (!cached) return false;
      saved.current = cached.saved;
      setLesson(normalizeCourse(cached.lesson)); setModuleChoices(cached.modules); setRecovered(true);
      return true;
    };
    if (!id) { restore(); return; }
    if (opened.current === id) return;
    setLoadFailed(false);
    if (restore()) { opened.current = id; showLastEdit(id); return; }
    staffLesson(id).then(({ sources_by_id: _sources, ...data }) => {
      if (!active) return;
      void _sources; saved.current = content(data); opened.current = id; setLesson(data);
    }, () => { if (active) setLoadFailed(true); });
    lessonHistory(id).then((events) => { if (active) setHistory(events); }, () => { if (active) setHistory("error"); });
    return () => { active = false; };
  }, [id, staff, user, loadRetry]);

  function showLastEdit(lessonId: string) {
    lessonHistory(lessonId).then((events) => { if (alive.current) setHistory(events); }, () => { if (alive.current) setHistory("error"); });
  }

  useEffect(() => {
    if (!user || !lesson) return;
    keepDraft(draftKey(user.id, id), dirty ? { lesson, saved: saved.current, modules: moduleChoices } : null);
  }, [dirty, lesson, moduleChoices, user, id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);


  const fail = (e: unknown) => setNotice({ ok: false, text: e instanceof Error ? e.message : t(S.ask.error) });
  const edit = (update: (current: StaffLesson) => StaffLesson) => { revision.current++; setLesson((current) => current && update(current)); };
  const change = (patch: Partial<StaffLesson>) => edit((current) => ({ ...current, ...patch }));
  const changeCard = (cardId: string, update: (card: Card) => Card) =>
    edit((current) => ({ ...current, cards: current.cards.map((card) => (card.id === cardId ? update(card) : card)) }));


  function start(draft: Lesson | null) {
    const next: StaffLesson = draft ? normalizeCourse(draft) : {
      id: "", subject: subjects.find((s) => s.levels.length)?.id ?? "", tracks: [tracks[0]?.id ?? "explore"], level: subjects.find((s) => s.levels.length)?.levels[0] ?? 1, minutes: 0,
      title: empty(), summary: empty(), status: "draft", cards: [newSection()],
    };
    saved.current = content(next); setLesson(next);
  }
  const live = lesson?.status === "published";
  const direct = canReview(role);
  function missing(current: StaffLesson) {
    const out: string[] = [];
    if (!filled(current.title)) out.push(t(E.needTitle));
    if (!filled(current.summary)) out.push(t(E.needSummary));
    if (!subjects.some((subject) => subject.id === current.subject)) out.push(t(E.needSubject));
    if (!subjects.find((subject) => subject.id === current.subject)?.levels.includes(lessonLevel(current.level))) out.push(t(S.curriculum.levelNotOffered));
    if (current.tracks.length !== 1 || current.tracks.some((id) => !tracks.some((track) => track.id === id))) out.push(t(E.needTracks));
    if (!current.minutes) out.push(t(E.needMinutes));
    if (!current.cards.length) out.push(t(E.needSection));
    current.cards.forEach((card, index) => gaps(card).forEach((gap) => out.push(`${t(E.section)} ${index + 1} ${t(gap)}`)));
    if (current.quiz?.some((q) => !filled(q.question) || q.options.some((o) => !filled(o)) || (q.explanation && !filled(q.explanation)))) out.push(t(E.needQuestions));
    return out;
  }

  /** Saves the lesson, then leaves it as a draft, sends it to review, or publishes it (which goes through review when this account may not publish). */
  async function save(goal: "draft" | "review" | "publish") {
    const publish = goal !== "draft";
    const approve = goal === "publish" && direct;
    if (!lesson || !user || busy) return;
    const savingRevision = revision.current;
    const placement = { ...moduleChoices };
    setTried(true); setNotice(null);
    if (missing(lesson).length) return;
    const data = payload(lesson);
    // An admin updates a live course in one call: it stays published, so nothing here changes state.
    const inPlace = live && direct;
    // Where the course is on the server. The card shows it once, when the work ends, not after each step.
    let reached = lesson.status;
    if (live && !direct && !window.confirm(t(S.instructor.hideReviewed))) return;
    setBusy(true);
    try {
      if (live && !direct) {
        // A teacher's edit of a live course goes back to an admin: it is hidden, saved and sent to review.
        await unpublishLesson(data.id);
        reached = "draft";
      }
      // The API keeps the credits: it adds the account that saved.
      const { contributors } = inPlace ? await updatePublished(data) : await saveDraft(data);
      reached = inPlace ? "published" : "draft";
      if (!alive.current) return;
      showLastEdit(data.id);
      opened.current = data.id;
      const stored = { ...data, contributors, author_id: lesson.author_id ?? user.id };
      saved.current = content(stored);
      setLesson((current) => current && (revision.current === savingRevision ? { ...stored, status: current.status } : { ...current, id: data.id, contributors, author_id: stored.author_id }));
      if (direct && data.tracks.some((track) => placement[track])) {
        let config = await curriculum();
        for (const trackId of data.tracks) {
          const target = placement[trackId];
          if (!target) continue;
          const track = config.tracks.find((track) => track.id === trackId);
          if (!track?.modules.some((module) => module.id === target)) throw new Error(t(E.moduleChanged));
          if (track.modules.find((module) => module.lessons.includes(data.id))?.id === target) continue;
          const modules = track.modules.map((module) => ({ ...module, lessons: module.id === target
            ? [...module.lessons.filter((id) => id !== data.id), data.id] : module.lessons.filter((id) => id !== data.id) }));
          config = await saveTrackModules(trackId, modules, config.updated_at.tracks);
        }
        await refresh();
      }
      if (publish) {
        // If publishing fails below, the editor stays open on the draft that was just saved.

        if (!inPlace) {
          await submitDraft(data.id);
          reached = "in_review";
          if (approve) { await reviewDecision(data.id, "approve", ""); reached = "published"; }
        }
        await refresh();
      }
      if (!alive.current) return;
      if (revision.current !== savingRevision) {
        setNotice({ ok: true, text: t({ en: "The submitted version was saved. Your newer edits are still unsaved.", ar: "حُفظت النسخة المرسلة. تغييراتك الأحدث لم تُحفظ بعد." }) });
        return;
      }
      keepDraft(draftKey(user.id, id), null);
      keepDraft(draftKey(user.id, data.id), null);
      // Saved, published, updated or sent for review: the work here is done, so return to the list,
      // which shows this message once (it reads the same key in studio/page.tsx).
      try { sessionStorage.setItem("yaqin-studio-toast", t(!publish ? S.instructor.draftSaved : !approve ? S.instructor.submitted : live ? E.updated : S.instructor.published)); } catch { /* storage is blocked: no message */ }
      router.push("/studio/");
    } catch (e) {
      if (!alive.current) return;
      fail(e);
    } finally {
      if (alive.current) {
        setLesson((current) => current && { ...current, status: reached });
        setBusy(false);
      }
    }
  }


  return { lesson, edit, change, changeCard, start, dirty, busy, setBusy, notice, setNotice, tried,
    moduleChoices, chooseModule: (id: string, value: string) => { revision.current++; setModuleChoices({ [id]: value }); },
    loadFailed, retryLoad: () => setLoadRetry((current) => current + 1), recovered, history,
    retryHistory: () => { if (lesson) { setHistory("loading"); showLastEdit(lesson.id); } },
    todo: lesson && tried ? missing(lesson) : [], save, fail, alive };
}
