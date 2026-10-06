"""Fetch verbatim Qur'an and hadith text from open, citable APIs.

    python -m scripts.fetch_sources quran:5:6 quran:1:1-7 hadith:bukhari:1 --out ../content/sources

Qur'an: quran.com API v4 (Uthmani script + a recorded English translation).
Hadith: fawazahmed0/hadith-api via jsDelivr (Arabic + English editions).

Results are merged by id into `<out>/<kind>.json`. Every record is written with
`review_status: "pending"`; only a scholarly reviewer moves it to "approved".
Existing records keep their review_status unless the text changed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import httpx

QURAN_API = "https://api.quran.com/api/v4"
HADITH_CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions"
DEFAULT_TRANSLATION_ID = 20  # Saheeh International

# `grading` is the collection-level grade used when the edition carries no per-hadith grade.
# Collections without one must have a per-hadith grade, otherwise the record is flagged.
COLLECTIONS = {
    "bukhari": {"name_en": "Sahih al-Bukhari", "name_ar": "صحيح البخاري", "grading": "Sahih (al-Bukhari)"},
    "muslim": {"name_en": "Sahih Muslim", "name_ar": "صحيح مسلم", "grading": "Sahih (Muslim)"},
    "nawawi": {"name_en": "An-Nawawi's Forty Hadith", "name_ar": "الأربعون النووية", "grading": None},
    "abudawud": {"name_en": "Sunan Abi Dawud", "name_ar": "سنن أبي داود", "grading": None},
    "tirmidhi": {"name_en": "Jami' at-Tirmidhi", "name_ar": "جامع الترمذي", "grading": None},
    "nasai": {"name_en": "Sunan an-Nasa'i", "name_ar": "سنن النسائي", "grading": None},
    "ibnmajah": {"name_en": "Sunan Ibn Majah", "name_ar": "سنن ابن ماجه", "grading": None},
}
# Sahih Muslim is cited by the Fu'ad 'Abd al-Baqi number, which the edition stores as
# `arabicnumber` ("109.02" = 109, second chain). Its files are indexed by a different
# running number, so Muslim lookups go through the full edition.
INDEXED_BY_ARABIC_NUMBER = {"muslim"}
CACHE = Path.home() / ".cache" / "yaqin" / "hadith"
_REPEAT_CHAIN = re.compile(
    r"(narrated|transmitted) (by|through|on the authority of) (another|other|a different) chains?", re.I
)

_TAG = re.compile(r"<sup[^>]*>.*?</sup>|<[^>]+>", re.S)


_AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def ar_digits(text: str) -> str:
    return text.translate(_AR_DIGITS)


_ABJAD = "أبجدهوزحطي"


def _ar_number(number: str) -> str:
    """376c -> ٣٧٦ (ج): sub-narration letters in abjad order."""
    m = re.fullmatch(r"(\d+)([a-j]?)", number)
    if not m or not m.group(2):
        return number
    return f"{m.group(1)} ({_ABJAD[ord(m.group(2)) - 97]})"


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", _TAG.sub("", text)).strip()


class Fetcher:
    def __init__(self, translation_id: int = DEFAULT_TRANSLATION_ID):
        self.http = httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": "yaqin-source-fetcher"})
        self.translation_id = translation_id
        self._translation_name: str | None = None
        self._chapters: dict[int, dict] = {}

    def translation_name(self) -> str:
        if self._translation_name is None:
            data = self.http.get(f"{QURAN_API}/resources/translations").raise_for_status().json()
            match = next((t for t in data["translations"] if t["id"] == self.translation_id), None)
            if match is None:
                raise SystemExit(f"translation id {self.translation_id} not offered by quran.com")
            self._translation_name = match["name"]
        return self._translation_name

    def chapter(self, surah: int) -> dict:
        if surah not in self._chapters:
            data = self.http.get(f"{QURAN_API}/chapters/{surah}", params={"language": "en"}).raise_for_status().json()
            self._chapters[surah] = data["chapter"]
        return self._chapters[surah]

    def quran(self, surah: int, ayah: int) -> dict:
        resp = self.http.get(
            f"{QURAN_API}/verses/by_key/{surah}:{ayah}",
            params={"fields": "text_uthmani", "translations": self.translation_id},
        )
        if resp.status_code == 404:
            raise LookupError(f"quran:{surah}:{ayah} does not exist")
        verse = resp.raise_for_status().json()["verse"]
        translations = verse.get("translations") or []
        if not translations:
            raise LookupError(f"no translation {self.translation_id} for {surah}:{ayah}")
        ch = self.chapter(surah)
        return {
            "id": f"quran:{surah}:{ayah}",
            "kind": "quran",
            "ref_en": f"{ch['name_simple']} {surah}:{ayah}",
            "ref_ar": ar_digits(f"{ch['name_arabic']}: {ayah}"),
            "text_ar": verse["text_uthmani"].strip(),
            "text_en": _clean(translations[0]["text"]),
            "translation": self.translation_name(),
            "origin": "quran.com API v4 (text_uthmani)",
            "url": f"https://quran.com/{surah}/{ayah}",
            "grading": None,
            "review_status": "pending",
        }

    def _edition(self, edition: str) -> list[dict]:
        CACHE.mkdir(parents=True, exist_ok=True)
        path = CACHE / f"{edition}.min.json"
        if not path.exists():
            resp = self.http.get(f"{HADITH_CDN}/{edition}.min.json").raise_for_status()
            path.write_bytes(resp.content)
        return json.loads(path.read_text())["hadiths"]

    def _by_arabic_number(self, collection: str, number: str) -> tuple[dict, dict]:
        """Narration by 'Abd al-Baqi number. "376" is the first substantive narration;
        "376c" is the third chain (stored as 376.03), as sunnah.com writes it."""
        base, letter = re.fullmatch(r"(\d+)([a-z]?)", number).groups()
        ar = {h["hadithnumber"]: h for h in self._edition(f"ara-{collection}")}
        candidates = [
            h for h in self._edition(f"eng-{collection}") if str(h.get("arabicnumber", "")).split(".")[0] == base
        ]
        candidates.sort(key=lambda h: h["hadithnumber"])
        if letter:
            want = f"{base}.{ord(letter) - 96:02d}"
            candidates = [h for h in candidates if str(h.get("arabicnumber")) == want]
            if candidates and candidates[0]["hadithnumber"] in ar:
                return ar[candidates[0]["hadithnumber"]], candidates[0]
            raise LookupError(f"hadith:{collection}:{number} not found ('Abd al-Baqi numbering)")
        for h in candidates:
            if h.get("text", "").strip() and not _REPEAT_CHAIN.search(h["text"]) and h["hadithnumber"] in ar:
                return ar[h["hadithnumber"]], h
        raise LookupError(f"hadith:{collection}:{number} not found ('Abd al-Baqi numbering)")

    def _by_file(self, collection: str, number: str) -> tuple[dict, dict]:
        pair = []
        for edition in (f"ara-{collection}", f"eng-{collection}"):
            resp = self.http.get(f"{HADITH_CDN}/{edition}/{number}.json")
            if resp.status_code == 404:
                raise LookupError(f"hadith:{collection}:{number} not found in {edition}")
            hadiths = resp.raise_for_status().json().get("hadiths") or []
            if not hadiths or not hadiths[0].get("text", "").strip():
                raise LookupError(f"hadith:{collection}:{number} has no text in {edition}")
            pair.append(hadiths[0])
        return pair[0], pair[1]

    def hadith(self, collection: str, number: str) -> dict:
        meta = COLLECTIONS.get(collection)
        if meta is None:
            raise LookupError(f"unsupported collection '{collection}' (use: {', '.join(COLLECTIONS)})")
        number = str(number)
        if collection not in INDEXED_BY_ARABIC_NUMBER and not number.isdigit():
            raise LookupError(f"letter suffixes are only used for {', '.join(sorted(INDEXED_BY_ARABIC_NUMBER))}")
        if collection in INDEXED_BY_ARABIC_NUMBER:
            ar, en = self._by_arabic_number(collection, number)
        else:
            ar, en = self._by_file(collection, number)
        grades = sorted(
            {
                f"{g['grade']} ({g['name']})" if g.get("name") else g["grade"]
                for g in (en.get("grades") or []) + (ar.get("grades") or [])
                if g.get("grade")
            }
        )
        grading = "; ".join(grades) if grades else meta["grading"]
        ref = en.get("reference") or {}
        record = {
            "id": f"hadith:{collection}:{number}",
            "kind": "hadith",
            "ref_en": f"{meta['name_en']} {number}",
            "ref_ar": ar_digits(f"{meta['name_ar']}: {_ar_number(number)}"),
            "text_ar": _clean(ar["text"]),
            "text_en": _clean(en["text"]),
            "translation": f"fawazahmed0/hadith-api eng-{collection}",
            "origin": f"fawazahmed0/hadith-api ara-{collection} #{ar['hadithnumber']} (book {ref.get('book')}, hadith {ref.get('hadith')})",
            "url": f"https://sunnah.com/{collection}:{number}",
            "grading": grading,
            "review_status": "pending",
        }
        if grading is None:
            record["grading"] = "UNGRADED — verify before use"
        return record


def expand(ids: list[str]) -> list[tuple[str, ...]]:
    """`quran:1:1-7` expands to seven ayah ids."""
    out = []
    for raw in ids:
        parts = raw.strip().split(":")
        if parts[0] == "quran" and len(parts) == 3:
            surah = int(parts[1])
            if "-" in parts[2]:
                lo, hi = (int(x) for x in parts[2].split("-"))
                out.extend(("quran", surah, a) for a in range(lo, hi + 1))
            else:
                out.append(("quran", surah, int(parts[2])))
        elif parts[0] == "hadith" and len(parts) == 3 and re.fullmatch(r"\d+[a-z]?", parts[2]):
            out.append(("hadith", parts[1], parts[2]))
        else:
            raise SystemExit(f"bad id '{raw}' (expected quran:S:A, quran:S:A-B, hadith:<collection>:N or N<letter>)")
    return out


def merge(out_dir: Path, records: list[dict]) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    by_kind: dict[str, list[dict]] = {}
    for r in records:
        by_kind.setdefault(r["kind"], []).append(r)
    for kind, new in by_kind.items():
        path = out_dir / f"{kind}.json"
        existing = {r["id"]: r for r in json.loads(path.read_text())} if path.exists() else {}
        for r in new:
            old = existing.get(r["id"])
            if old and old.get("text_ar") == r["text_ar"] and old.get("text_en") == r["text_en"]:
                r["review_status"] = old.get("review_status", "pending")
            existing[r["id"]] = {**(old or {}), **r}
        ordered = sorted(existing.values(), key=_sort_key)
        path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
        counts[kind] = len(new)
    return counts


def _sort_key(r: dict):
    parts = r["id"].split(":")
    num = re.match(r"\d+", parts[2])
    return (parts[0], parts[1].zfill(4) if parts[1].isdigit() else parts[1], int(num.group()) if num else 0, parts[2])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "content" / "sources"))
    ap.add_argument("--translation", type=int, default=DEFAULT_TRANSLATION_ID)
    args = ap.parse_args(argv)

    f = Fetcher(args.translation)
    records, failures = [], []
    for item in expand(args.ids):
        try:
            rec = f.quran(item[1], item[2]) if item[0] == "quran" else f.hadith(item[1], item[2])
            records.append(rec)
            print(f"ok    {rec['id']:<22} {rec['ref_en']}")
        except (LookupError, httpx.HTTPError) as e:
            failures.append(str(e))
            print(f"FAIL  {':'.join(map(str, item)):<22} {e}", file=sys.stderr)
    if records:
        counts = merge(Path(args.out), records)
        print("wrote", ", ".join(f"{k}.json (+{v})" for k, v in counts.items()), "->", args.out)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
