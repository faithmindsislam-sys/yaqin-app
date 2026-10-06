"""Offline regression for the S3 build input loader: no AWS calls or original files."""
import importlib.util
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("sync_quran", Path(__file__).with_name("sync-quran.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    objects = [
        {"Key": "resources/quran/en/sample/verses.jsonl", "Size": 2},
        {"Key": "resources/quran/audio/reciter/mp3/001.mp3", "Size": 100},
    ]
    downloads = []
    def download(bucket, key, destination):
        downloads.append(key)
        Path(destination).write_bytes(b"{}")
    client = SimpleNamespace(
        get_paginator=lambda name: SimpleNamespace(paginate=lambda **kwargs: [{"Contents": objects}]),
        download_file=download,
    )
    module.sync("s3://yaqin-resources-744172873146/resources/quran/", root, client)
    assert downloads == ["resources/quran/en/sample/verses.jsonl"]
    assert not (root / "quran/audio/reciter/mp3/001.mp3").exists()
    assert json.loads((root / "s3-objects.json").read_text())["quran/audio/reciter/mp3/001.mp3"] == 100
    for bad_objects in [[], [{"Key": "resources/quran/../outside", "Size": 2}]]:
        objects[:] = bad_objects
        try:
            module.sync("s3://yaqin-resources-744172873146/resources/quran/", root, client)
        except (ValueError, RuntimeError):
            pass
        else:
            raise AssertionError("Empty/unsafe remote input must not reuse local files")
print("S3 Quran loader: remote inputs, no MP3 downloads, empty-source failure and safe keys passed.")
