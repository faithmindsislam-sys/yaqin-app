"""Allowlist cleaner for text formatted in the Studio editor. Staff-written HTML is
shown to learners, so only these formatting tags survive; anything else is kept as
plain text or dropped."""

from __future__ import annotations

import re
from html import escape
from html.parser import HTMLParser

BLOCKS = {"p", "div", "h3", "ul", "ol", "li", "blockquote"}
TAGS = BLOCKS | {"br", "b", "strong", "i", "em", "u", "font"}
# The editor writes colour, font and size as <font> attributes, so no CSS is ever accepted.
FONT = {
    "color": re.compile(r"#[0-9a-fA-F]{6}"),
    "face": re.compile(r"serif|naskh|monospace"),
    "size": re.compile(r"[1-7]"),
}
# A highlight box may name one of the editor's colours.
ATTRS = {"font": FONT, "blockquote": {"data-tone": re.compile(r"blue|green|red|gray")}}
DROPPED = {"script", "style"}  # their text is dropped too


class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.text: list[str] = []
        self.open: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROPPED:
            self.skip += 1
        if self.skip or tag not in TAGS:
            return
        if tag in BLOCKS or tag == "br":
            self.text.append("\n")
        if tag == "br":
            self.out.append("<br>")
            return
        allowed = ATTRS.get(tag, {})
        kept = "".join(f' {k}="{v}"' for k, v in attrs if k in allowed and v and allowed[k].fullmatch(v))
        self.out.append(f"<{tag}{kept}>")
        self.open.append(tag)

    def handle_endtag(self, tag):
        if tag in DROPPED and self.skip:
            self.skip -= 1
        if tag not in self.open:
            return
        while self.open:  # also close anything left open inside, so the output stays balanced
            top = self.open.pop()
            self.out.append(f"</{top}>")
            if top == tag:
                break
        if tag in BLOCKS:
            self.text.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(escape(data))
            self.text.append(data)


def clean(html: str) -> tuple[str, str]:
    """Returns (safe html, plain text). Both are empty when there is no text."""
    parser = _Cleaner()
    parser.feed(html)
    parser.close()
    parser.out += [f"</{tag}>" for tag in reversed(parser.open)]
    text = re.sub(r"[ \t]*\n\s*", "\n", "".join(parser.text).replace("\xa0", " ")).strip()
    return ("".join(parser.out), text) if text else ("", "")
