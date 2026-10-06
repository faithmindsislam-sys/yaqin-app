"use client";

import { Square, Volume2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { AskResponse, Lang } from "@/lib/types";
import { useNarration } from "@/lib/voice";
import { speak, speakStream } from "@/lib/speech";

/** Reads an answer's prose aloud. Server narration first, with the browser voice as fallback.
 * The quoted sources are never spoken — only the `text` blocks of the answer. */
export function AnswerListen({ answer, lang, voice = "male" }: { answer: AskResponse["answer"]; lang: Lang; voice?: "male" | "female" }) {
  const { t } = useI18n();
  const narration = useNarration();
  const spoken = answer.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n").trim();
  if (!spoken) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost ms-auto !px-2.5 !py-1 text-xs"
      onClick={() => narration.toggle({ fetchStream: (signal) => speakStream(spoken, lang, voice, signal), fetchSrc: () => speak(spoken, lang, voice), text: spoken, lang })}
    >
      {narration.playing ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {t(narration.playing ? S.lesson.stop : S.lesson.listen)}
    </button>
  );
}
