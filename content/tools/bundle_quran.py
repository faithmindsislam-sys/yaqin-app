"""Pack the Qur'an reader's Arabic text and English translation into content/quran/ayat.json.

    python3 content/tools/bundle_quran.py

The API ships with `content/`, not with the web app's reader files. This one file lets it add
any verse to the Studio source library word for word, without a teacher typing revealed text.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data" / "quran"
AR, EN = "ar/kfgqpc-hafs-v30", "en/sahih-international-13638"
OUT = ROOT / "content" / "quran" / "ayat.json"
END_MARK = re.compile(r"\s*۝[٠-٩]+\s*$")  # end-of-verse sign and its number

index = json.loads((DATA / "index.json").read_text())
surahs = []
for s in index["surahs"]:
    ar = json.loads((DATA / AR / "surahs" / f"{s['number']}.json").read_text())
    en = json.loads((DATA / EN / "surahs" / f"{s['number']}.json").read_text())
    assert len(ar) == len(en) == s["ayahs"], f"surah {s['number']}: verse counts differ"
    surahs.append({"number": s["number"], "name_ar": s["name_ar"], "name_en": s["name_latin"], "url": en[0]["source_url"],
                   "ayat": [[END_MARK.sub("", a["text"]), e["text"]] for a, e in zip(ar, en)]})
assert len(surahs) == 114 and sum(len(s["ayat"]) for s in surahs) == 6236
edition = lambda key: {k: index["editions"][f"quran/{key}"][k] for k in ("title", "provider", "provider_url")}
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps({"ar": edition(AR), "en": edition(EN), "surahs": surahs}, ensure_ascii=False, separators=(",", ":")))
print(f"wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB")
