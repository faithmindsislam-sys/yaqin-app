"""Fetch every Qur'an verse and hadith used by the lessons, verbatim, into content/sources/.

Nothing in content/sources/ is typed by hand: re-running this script must
reproduce those files exactly. Stdlib only.

    python3 content/tools/fetch_sources.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources"

QURAN_TRANSLATION_ID = 20  # Saheeh International (verified via /resources/translations)
QURAN_API = "https://api.quran.com/api/v4/verses/by_key/{key}?fields=text_uthmani&translations={tr}"
HADITH_API = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{lang}-{col}/{num}.json"

VERSES = [
    "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7",
    "2:115", "2:127", "2:143", "2:144", "2:148", "2:149", "2:150", "2:177", "2:255", "2:256",
    "5:6", "10:99", "16:125", "18:29", "20:114", "42:11", "60:8", "106:3",
    "112:1", "112:2", "112:3", "112:4",
]

# (collection, number in the fawazahmed0 edition). The number is the edition's own
# sequential index; the human-facing reference uses the edition's book/hadith fields.
HADITHS = [
    ("bukhari", 1),    # deeds are by intentions
    ("bukhari", 40),   # prayed toward Jerusalem 16-17 months, then the Kaaba
    ("bukhari", 135),  # prayer not accepted after hadath until wudu
    ("bukhari", 137),  # doubt about wind: don't leave prayer without certainty
    ("bukhari", 164),  # Humran: 'Uthman demonstrates the Prophet's wudu
    ("muslim", 534),   # purity is half of faith
    ("muslim", 538),   # Humran: 'Uthman demonstrates the Prophet's wudu
    ("muslim", 835),   # Companions slept, then prayed without renewing wudu
    ("muslim", 878),   # hadith qudsi: prayer divided between Allah and His servant (Al-Fatiha)
]

SURAH_EN = {1: "Al-Fatihah", 2: "Al-Baqarah", 5: "Al-Ma'idah", 10: "Yunus", 16: "An-Nahl",
            18: "Al-Kahf", 20: "Ta-Ha", 42: "Ash-Shura", 60: "Al-Mumtahanah", 106: "Quraysh", 112: "Al-Ikhlas"}
SURAH_AR = {1: "الفاتحة", 2: "البقرة", 5: "المائدة", 10: "يونس", 16: "النحل", 18: "الكهف", 20: "طه",
            42: "الشورى", 60: "الممتحنة", 106: "قريش", 112: "الإخلاص"}
COLLECTION = {"bukhari": ("Sahih al-Bukhari", "صحيح البخاري"),
              "muslim": ("Sahih Muslim", "صحيح مسلم")}
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "curl/8.7.1", "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))


def clean_translation(text):
    # quran.com wraps footnote markers in <sup foot_note=..>N</sup>; drop them and any tags.
    text = re.sub(r"<sup[^>]*>.*?</sup>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_quran():
    out = []
    for key in VERSES:
        d = get(QURAN_API.format(key=key, tr=QURAN_TRANSLATION_ID))["verse"]
        s, a = (int(x) for x in key.split(":"))
        tr = d["translations"][0]
        assert tr["resource_id"] == QURAN_TRANSLATION_ID
        out.append({
            "id": f"quran:{key}",
            "kind": "quran",
            "ref_en": f"{SURAH_EN[s]} {s}:{a}",
            "ref_ar": f"{SURAH_AR[s]}: {str(a).translate(AR_DIGITS)}",
            "text_ar": d["text_uthmani"],
            "text_en": clean_translation(tr["text"]),
            "translation": "Saheeh International (footnote markers removed)",
            "origin": "quran.com API v4 — text_uthmani; translation resource 20",
            "url": f"https://quran.com/{s}/{a}",
            "grading": None,
            "review_status": "pending",
        })
        time.sleep(0.2)
    return out


def fetch_hadith():
    out = []
    for col, num in HADITHS:
        en = get(HADITH_API.format(lang="eng", col=col, num=num))["hadiths"][0]
        ar = get(HADITH_API.format(lang="ara", col=col, num=num))["hadiths"][0]
        assert en["hadithnumber"] == ar["hadithnumber"] == num
        book, hno = en["reference"]["book"], en["reference"]["hadith"]
        name_en, name_ar = COLLECTION[col]
        out.append({
            "id": f"hadith:{col}:{num}",
            "kind": "hadith",
            "ref_en": f"{name_en}, book {book}, hadith {hno}",
            "ref_ar": f"{name_ar}، الكتاب {str(book).translate(AR_DIGITS)}، الحديث {str(hno).translate(AR_DIGITS)}",
            "text_ar": ar["text"].strip(),
            "text_en": re.sub(r"\s+", " ", en["text"]).strip(),
            "translation": "fawazahmed0/hadith-api English edition",
            "origin": f"fawazahmed0/hadith-api@1 editions ara-{col} / eng-{col}, index {num}",
            "url": f"https://sunnah.com/{col}/{book}/{hno}",
            "grading": f"Sahih ({name_en})",
            "review_status": "pending",
        })
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    quran, hadith = fetch_quran(), fetch_hadith()
    for name, rows in (("quran.json", quran), ("hadith.json", hadith)):
        (OUT / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {name}: {len(rows)} sources")


if __name__ == "__main__":
    main()
