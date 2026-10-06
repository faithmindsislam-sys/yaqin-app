"""Polite, cached HTTP for the knowledge-base fetchers. Stdlib only.

Responses are cached under content/kb/cache/ (git-ignored) so re-runs don't
hit the platforms again. The platforms reject Python's default client, so a
curl-style User-Agent is sent.
"""
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parents[1] / "kb" / "cache"
UA = {"User-Agent": "curl/8.4.0", "Accept": "application/json"}
DELAY = 0.35  # seconds between live requests


class NotFound(Exception):
    pass


def get_json(url: str, *, retries: int = 3, cache: bool = True):
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE / f"{key}.json"
    if cache and path.exists():
        data = json.loads(path.read_text("utf-8"))
        if data == {"__not_found__": True}:
            raise NotFound(url)
        return data
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = json.load(r)
            CACHE.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                CACHE.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"__not_found__": True}), "utf-8")
                raise NotFound(url) from e
            if attempt == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
        time.sleep(2 * (attempt + 1))


def q(params: dict) -> str:
    return urllib.parse.urlencode(params)


AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def ar_digits(s) -> str:
    return str(s).translate(AR_DIGITS)


def load_sources(path: Path) -> list:
    return json.loads(path.read_text("utf-8")) if path.exists() else []


def save_sources(path: Path, items: list):
    items = sorted(items, key=lambda s: s["id"])
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", "utf-8")
