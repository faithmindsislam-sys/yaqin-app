import type { AskResponse } from "@/lib/types";
import type { ChatTurn } from "./api";

export type ChatMessage = { role: "user"; text: string } | { role: "assistant"; data: AskResponse; verifying?: boolean } | { role: "error" };

/** Only recent plain text enters the model history; source blocks remain verified references. */
export function chatHistory(messages: readonly ChatMessage[]): ChatTurn[] {
  return messages.flatMap((message): ChatTurn[] =>
    message.role === "user" ? [{ role: "user", content: message.text.slice(0, 1500) }]
      : message.role === "assistant" ? [{ role: "assistant", content: [
        ...message.data.answer.filter((block) => block.type === "text").map((block) => block.text),
        ...(message.data.practice ?? []).map((item) => `Practice question: ${item.question.en} / ${item.question.ar}`),
      ].join("\n").slice(0, 4000) }]
        : [],
  ).filter((turn) => turn.content.trim()).slice(-6);
}
