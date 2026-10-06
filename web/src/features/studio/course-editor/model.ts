import { S } from "@/lib/strings";
import type { Bi, Card, Lang, Lesson } from "@/lib/types";
import type { StaffLesson } from "@/features/studio/api";
const E = S.editor;
export const empty = (): Bi => ({ en: "", ar: "" });
export const shortId = () => crypto.randomUUID().slice(0, 8);
export const filled = (text?: Bi) => !!(text?.en?.trim() || text?.ar?.trim());
export const withLang = (text: Bi | undefined, lang: Lang, value: string): Bi => ({ ...empty(), ...text, [lang]: value });
export const plain = (html = "") => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const escapeHtml = (text = "") => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!).replace(/\n/g, "<br>");
/** Sections written before this editor only have plain text. */
export const cardHtml = (card: Card): Bi => card.html ?? { en: escapeHtml(card.body?.en), ar: escapeHtml(card.body?.ar) };
export const newSection = (): Card => ({ id: shortId(), kind: "concept", title: empty(), html: empty(), sources: [] });

/** What a page still needs before the lesson can be saved. */
export const gaps = (card: Card) => {
  const html = cardHtml(card);
  return [
    ...(filled(card.title) ? [] : [E.needsTitle]),
    ...(card.kind === "quote" || plain(html.en) || plain(html.ar) ? [] : [E.needsText]),
    ...(card.kind !== "quote" || card.sources?.length ? [] : [E.needsSource]),
  ];
};

export const content = (lesson: StaffLesson) => JSON.stringify({ ...lesson, status: "", contributors: null, author_id: null, coming_soon: !!lesson.coming_soon });

  /** The lesson as the API stores it. The API rebuilds each plain `body` from the formatted text. */
export function payload(current: StaffLesson): Lesson {
    const { author_id: _author, ...rest } = current;
    void _author;
    const slug = current.title.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "course";
    return {
      ...rest, id: current.id || `${slug}-${shortId()}`, status: "draft", audience_track: current.tracks[0],
      cards: current.cards.map(({ takeaway, ...card }) => ({
        ...card, ...(filled(takeaway) ? { takeaway } : {}), ...(card.kind === "quote" ? {} : { html: cardHtml(card) }),
      })),
    };
  }
