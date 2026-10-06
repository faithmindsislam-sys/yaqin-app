import { ApiError, apiEnabled, BASE, getAccessToken, request } from "@/lib/http";
import type { AskResponse, Lang, TrackId } from "@/lib/types";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AskParams = {
  question: string;
  lang: Lang;
  lesson_id?: string | null;
  card_id?: string | null;
  practice?: boolean;
  practice_avoid?: string[];
  track?: TrackId | null;
  history?: ChatTurn[];
};

function askBody(params: AskParams) {
  return { course_id: params.lesson_id ?? null, card_id: null, track: null, history: [], ...params };
}

export function ask(params: AskParams, signal?: AbortSignal) {
  return request<AskResponse>("/tutor/ask", askBody(params), signal);
}

/** Streams a moderated `draft`, then the verified `final`, over Server-Sent Events.
 * EventSource cannot carry the bearer token, so we POST with fetch and parse the SSE lines. */
export async function askStream(
  params: AskParams,
  handlers: { onDraft(data: AskResponse): void; onFinal(data: AskResponse): void },
  signal?: AbortSignal,
): Promise<AskResponse> {
  if (!apiEnabled) throw new ApiError(503, "backend_unavailable", "This feature is currently unavailable. Please try again later.");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api/tutor/ask/stream`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(askBody(params)),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? "upstream", err.message ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AskResponse | null = null;

  // One SSE event: `event:` and `data:` lines, terminated by a blank line.
  const dispatch = (block: string) => {
    let name = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    const payload = JSON.parse(data.join("\n"));
    if (name === "error") throw new ApiError(502, payload?.error?.code ?? "upstream", payload?.error?.message ?? "The tutor could not answer.");
    if (name === "draft") handlers.onDraft(payload as AskResponse);
    else if (name === "final") { final = payload as AskResponse; handlers.onFinal(final); }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let match: RegExpMatchArray | null;
    while ((match = buffer.match(/\r?\n\r?\n/)) !== null) {
      const end = match.index! + match[0].length;
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(end);
      if (block.trim()) dispatch(block);
    }
    if (done) break;
  }
  const tail = buffer.trim();
  if (tail) dispatch(tail);
  if (!final) throw new ApiError(502, "stream_incomplete", "The tutor could not answer.");
  return final;
}

/** Legacy explain-back callers pass the selected learner track explicitly.
 * The current course player has no explain-back activity. Missing track is identity-neutral. */
export function explainBack(params: {
  course_id: string; transcript: string; lang: Lang; track?: TrackId | null;
}) {
  return request<{ covered: string[]; missed: string[]; feedback: string; ai_generated: boolean }>(
    "/tutor/explain-back", { ...params, track: params.track ?? null },
  );
}
