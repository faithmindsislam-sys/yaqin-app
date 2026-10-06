"use client";

import { useEffect, useRef } from "react";
import { Bold, Eraser, Heading, Italic, List, ListOrdered, Underline } from "lucide-react";
import { Select } from "@/components/Select";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

import type { Bi } from "@/lib/types";

const T = S.editor.tools;
const COLORS = ["#102c49", "#075aab", "#aa4617", "#23714f", "#986316", "#cf3a3a"];
// Each choice is shown in its own look. The API only accepts these values (api/app/richtext.py).
const FONTS = { inherit: undefined, serif: "var(--font-serif)", naskh: "var(--font-quran)", monospace: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;
const SIZES = { 2: 12, 3: 14, 5: 18, 6: 22 } as const;
const TONES = ["gold", "blue", "green", "red", "gray"] as const;

/** Formatted text for one lesson section. `onChange` receives HTML; the API cleans it on save.
 *  The text is read once, on mount: give this component a `key` to show other content.
 *  ponytail: built on the browser's own execCommand editing (deprecated, but present in every
 *  browser and enough for bold, lists, colour and fonts). Move to an editor library when
 *  tables or inline images are needed. */
export function RichText({ value, onChange, dir, label, placeholder, readOnly = false }: {
  value: string; onChange: (html: string) => void; dir: "ltr" | "rtl"; label: string; placeholder: string; readOnly?: boolean;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Typing must not reset the caret.
  useEffect(() => { if (box.current) box.current.innerHTML = value; }, []);

  function emit() {
    const el = box.current;
    if (!el) return;
    // An emptied box keeps a stray <br>; clear it so the placeholder returns.
    if (!el.textContent?.trim() && !el.querySelector("li, h3, blockquote")) el.innerHTML = "";
    onChange(el.innerHTML);
  }
  function remember() {
    const selection = window.getSelection();
    if (selection?.rangeCount && box.current?.contains(selection.anchorNode)) range.current = selection.getRangeAt(0);
  }
  /** The menus take focus away: return to the text that was selected. False when the text cannot be edited. */
  function back() {
    const el = box.current;
    if (!el || readOnly) return false;
    const away = document.activeElement !== el;
    el.focus();
    if (away && range.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range.current);
    }
    return true;
  }
  function run(command: string, arg?: string) {
    if (!back()) return;
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, arg);
    emit();
  }
  /** The highlight box around the caret, if any. */
  function boxAt() {
    const node = window.getSelection()?.anchorNode;
    const found = (node instanceof Element ? node : node?.parentElement)?.closest("blockquote");
    return found && box.current?.contains(found) ? found : null;
  }
  /** Puts the paragraph in a highlight box of this colour, recolours the box it is in, or takes the box away. */
  function highlight(tone: string) {
    if (!back()) return;
    if (tone === "none") { if (boxAt()) run("formatBlock", "p"); return; }
    if (!boxAt()) document.execCommand("formatBlock", false, "blockquote");
    const found = boxAt();
    // Gold is the plain box: it needs no mark.
    if (found && tone !== "gold") found.setAttribute("data-tone", tone);
    else found?.removeAttribute("data-tone");
    emit();
  }

  const button = (label: Bi, Icon: typeof Bold, action: () => void) => (
    <button type="button" className="rich-tool" title={t(label)} aria-label={t(label)} disabled={readOnly}
      onMouseDown={(event) => event.preventDefault()} onClick={action}><Icon className="h-4 w-4" aria-hidden /></button>
  );

  return (
    <div className="rich-editor">
      <div role="toolbar" aria-label={t(T.toolbar)} className="rich-toolbar">
        {button(T.bold, Bold, () => run("bold"))}
        {button(T.italic, Italic, () => run("italic"))}
        {button(T.underline, Underline, () => run("underline"))}
        <span className="rich-divider" aria-hidden />
        {button(T.heading, Heading, () => run("formatBlock", document.queryCommandValue("formatBlock").toLowerCase() === "h3" ? "p" : "h3"))}
        {button(T.bullets, List, () => run("insertUnorderedList"))}
        {button(T.numbers, ListOrdered, () => run("insertOrderedList"))}
        <span className="rich-divider" aria-hidden />
        <Select compact label={t(T.callout)} value="" onChange={highlight} options={[
          ...TONES.map((tone) => ({ value: tone, label: t(T.tones[tone]), className: `rich-tone tone-${tone}` })),
          { value: "none", label: t(T.tones.none) },
        ]} />
        <Select compact label={t(T.font)} value="" onChange={(font) => run("fontName", font)}
          options={Object.entries(FONTS).map(([font, fontFamily]) => ({ value: font, label: t(T.fonts[font as keyof typeof FONTS]), style: { fontFamily } }))} />
        <Select compact label={t(T.size)} value="" onChange={(size) => run("fontSize", size)}
          options={Object.entries(SIZES).map(([size, fontSize]) => ({ value: size, label: t(T.sizes[Number(size) as keyof typeof SIZES]), style: { fontSize } }))} />
        <span className="rich-divider" aria-hidden />
        <span role="group" aria-label={t(T.color)} className="flex items-center gap-1">
          {COLORS.map((color) => <button key={color} type="button" className="rich-swatch" style={{ background: color }} disabled={readOnly}
            title={t(T.color)} aria-label={`${t(T.color)} ${color}`} onMouseDown={(event) => event.preventDefault()} onClick={() => run("foreColor", color)} />)}
        </span>
        <span className="rich-divider" aria-hidden />
        {button(T.clear, Eraser, () => run("removeFormat"))}
      </div>
      <div ref={box} className="rich rich-input" dir={dir} role="textbox" aria-multiline aria-label={label} data-placeholder={placeholder}
        contentEditable={!readOnly} suppressContentEditableWarning onInput={emit} onBlur={remember} onKeyUp={remember} onMouseUp={remember}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onPaste={(event) => {
          // Paste as plain text so styles from other pages never enter a lesson.
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }} />
    </div>
  );
}
