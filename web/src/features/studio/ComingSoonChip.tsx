"use client";

import { Loader } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

/** Marks a course whose "Coming soon" setting is on. The tooltip says what learners see. */
export function ComingSoonChip() {
  const { t } = useI18n();
  return (
    <span className="soon-chip" tabIndex={0} role="img" aria-label={`${t(S.instructor.comingSoon)}. ${t(S.instructor.comingSoonTip)}`}>
      <Loader className="h-3.5 w-3.5" aria-hidden />
      <span className="soon-tip" aria-hidden>
        <strong>{t(S.instructor.comingSoon)}</strong>
        {t(S.instructor.comingSoonTip)}
      </span>
    </span>
  );
}
