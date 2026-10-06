"use client";

import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Persona } from "@/lib/personas";

// `detail` is extra context shown after the role, e.g. the learner's journey.
export function PersonaIdentity({ persona, heading: Heading = "p", detail, inline = false, showRole = true }: { persona: Persona; heading?: "h1" | "h2" | "p"; detail?: string; inline?: boolean; showRole?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`flex min-w-0 items-center ${inline ? "gap-2 sm:gap-3" : "gap-3"}`}>
      <Image src={persona.avatar} alt="" width={inline ? 32 : 40} height={inline ? 32 : 40} className={`persona-avatar ${inline ? "h-8 w-8" : "h-10 w-10"}`} />
      <div className={inline ? "flex min-w-0 flex-col items-start gap-x-3 gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-center" : "min-w-0"}>
        <Heading className={`flex items-center gap-x-2 gap-y-1 text-base font-semibold text-ink ${inline ? "min-w-0 max-w-full" : "flex-wrap sm:text-lg"}`}>
          <span className={inline ? "truncate" : undefined}>{t(persona.name)}</span> <span className={`chip !py-0.5 font-sans !text-[0.65rem] font-medium ${inline && showRole ? "!hidden shrink-0 sm:!inline-flex" : ""}`}>{inline ? <abbr title={t(S.common.aiLabel)} className="no-underline">AI</abbr> : t(S.common.aiLabel)}</span>
        </Heading>
        {showRole && <p className={`${inline ? "max-w-full truncate" : "mt-0.5"} text-xs text-ink-soft`}><span className={inline ? "hidden md:inline" : ""}>{t(persona.role)}{detail && " · "}</span>{detail && <span className="font-medium text-brand-700">{detail}</span>}</p>}
      </div>
    </div>
  );
}
