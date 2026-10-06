"use client";

import { BookCheck, Flame, Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import { useContent } from "@/features/courses/ContentProvider";
import { useSession } from "@/features/auth/SessionProvider";
import { streak, useProgress } from "./progress";

/** Day streak and courses completed in the learner's journey: chips in the dashboard banner on mobile, `big` cards on the desktop dashboard.
 *  `modules` (completed out of all) adds a third number. */
export function LearnStats({ className = "", big = false, modules }: { className?: string; big?: boolean; modules?: { done: number; total: number } }) {
  const { t } = useI18n();
  const { prefs } = useSession();
  const { trackLessons } = useContent();
  const progress = useProgress();
  const lessons = trackLessons(prefs.track ?? "first-steps");
  const days = streak(progress.days);
  const done = lessons.filter((l) => progress.lessons[l.id]?.completedAt).length;
  // `ratio` draws a progress bar in the big card; a streak has no total, and at zero it invites instead of counting.
  const stats: { icon: typeof Flame; tone: string; value: string; label: string; title?: string; ratio?: number }[] = [
    { icon: Flame, tone: "text-orange-500", value: days ? String(days) : "", label: t(days ? S.dash.streak : S.dash.streakStart), title: t(S.dash.streakHint) },
    { icon: BookCheck, tone: "text-brand-600", value: `${done}/${lessons.length}`, label: t(S.dash.lessonsDone), ratio: lessons.length ? done / lessons.length : 0 },
    ...(modules ? [{ icon: Layers, tone: "text-salmon-600", value: `${modules.done}/${modules.total}`, label: t(S.dash.modulesDone), ratio: modules.total ? modules.done / modules.total : 0 }] : []),
  ];
  return (
    <div className={`items-center ${big ? "" : "gap-2"} ${className}`}>
      {stats.map(({ icon: Icon, tone, value, label, title, ratio }) => big ? (
        <div key={label} className="card flex items-center gap-4 px-6 py-5" title={title}>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-3xl leading-none text-ink">{value || "0"}</span>
            <span className="mt-1 block text-sm text-ink-soft first-letter:uppercase">{label}</span>
            {ratio !== undefined && (
              <span className="mt-2 block h-1.5 rounded-full bg-line" aria-hidden>
                <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${ratio * 100}%` }} />
              </span>
            )}
          </span>
        </div>
      ) : (
        <span key={label} className="chip" title={title}><Icon className={`h-4 w-4 ${tone}`} aria-hidden /> {value} {label}</span>
      ))}
    </div>
  );
}
