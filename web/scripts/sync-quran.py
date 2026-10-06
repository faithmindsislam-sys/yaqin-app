"""Download build inputs from the canonical S3 prefix, never the 1.72 GB MP3s."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

import boto3


def sync(source_uri, target, client):
    source = urlparse(source_uri)
    if source.scheme != "s3" or not source.netloc or not source.path.strip("/") or source.query or source.fragment:
        raise ValueError("QURAN_S3_URI must be an s3://bucket/prefix URI")
    prefix = source.path.strip("/") + "/"
    objects = {}
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=source.netloc, Prefix=prefix):
        for obj in page.get("Contents", []):
            relative = obj["Key"][len(prefix):]
            if not relative or relative.endswith("/"):
                continue
            path = PurePosixPath(relative)
            if path.is_absolute() or ".." in path.parts or "\\" in relative:
                raise ValueError("Unsafe S3 object key")
            objects[relative] = obj
    if not objects:
        raise RuntimeError("The Quran S3 prefix is empty; no local fallback is permitted")
    # Fresh inputs each run: no stale or workstation-only source can enter the bundle.
    def download(item):
        relative, obj = item
        if relative.startswith("audio/") and "/mp3/" in relative:
            return
        destination = target / "quran" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        client.download_file(source.netloc, obj["Key"], str(destination))
        if destination.stat().st_size != obj["Size"]:
            raise RuntimeError(f"Incomplete S3 download: {relative}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(download, objects.items()))
    (target / "s3-objects.json").write_text(json.dumps({"quran/" + key: obj["Size"] for key, obj in objects.items()}))
    print(f"Quran inputs from {source_uri}: {len(objects)} S3 objects; MP3s remain in S3")


if __name__ == "__main__":
    import sys
    profile = os.environ.get("YAQIN_AWS_PROFILE") or os.environ.get("AWS_PROFILE") or None
    if profile and profile.startswith("aws-"):
        raise RuntimeError("An unrelated aws- profile must not be used for Yaqin")
    session = boto3.Session(profile_name=profile, region_name=os.environ.get("AWS_REGION", "eu-west-1"))
    sync(sys.argv[1], Path(sys.argv[2]), session.client("s3"))
