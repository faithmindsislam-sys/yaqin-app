# Quran source and delivery from S3

The canonical source is **`s3://yaqin-resources-744172873146/resources/quran/`**.
The upload page reported 340 uploaded source files (1,882,835,493 bytes), including
114 MP3s, on 4 October 2026. That establishes upload completion, not delivery.
At the time of this change, the CloudFront reader index and audio URLs returned
404. This workspace has no AWS credentials; the deployment steps below remain
owned by the deployment team. Source changes and offline checks do not deploy it.

## Application behavior

- Normal `npm run dev`, `npm run content` and `npm run build` do not download
  private S3 sources or require AWS credentials. The local browser uses the same
  CloudFront reader URLs as production. Until those routes are deployed, Quran
  reading/audio remain unavailable; other pages can still run locally.
- The deployment asset step, `npm run quran:bundle`, fetches source inputs
  from S3 using `web/scripts/sync-quran.py`. A fresh temporary directory holds
  build inputs and is removed on process exit. The original workstation
  `resources/quran` directory is not consulted. There is no silent local fallback.
- The downloader inventories S3 objects, downloads only non-MP3 source inputs,
  and retains object sizes to validate that all 114 recordings exist. Text,
  tafsir and timing inputs are checked against their saved SHA-256 metadata.
  MP3 inventory checks establish existence and size, not a new hash/listening audit.
- The bundler creates per-surah/search/tafsir/timing JSON. It never symlinks or
  copies the 1.72 GB recordings into the web export. Text coverage requires the
  Arabic and seven translation editions, eight tafsir editions and all 114 timings.
- The deployed reader fetches JSON from CloudFront `/data/quran/...` and audio
  from `/resources/quran/audio/alafasy-hafs-mp3quran-123/mp3/...`.
- Studio exact-verse lookup reads Arabic/English metadata and `verses.jsonl`
  directly from S3, checks hashes and coverage, and caches the catalog in memory.
  S3 failure returns a retryable 503; it never uses local `content/quran/ayat.json`
  or turns an outage into a false "verse not found". The API Docker image omits
  that obsolete local catalog. Restart the API after changing the source snapshot.
- `YAQIN_RESOURCES_DIR` is only an explicit offline authoring/check override.
  Backend test fixtures explicitly clear `QURAN_S3_URI`; production rejects an
  empty value. Local copies can remain as backups, but are not the default source.

Public, build-time settings in root `.env`:

```dotenv
QURAN_S3_URI=s3://yaqin-resources-744172873146/resources/quran/
NEXT_PUBLIC_QURAN_BASE=https://www.yaqeenguide.com/data          # local development
NEXT_PUBLIC_QURAN_AUDIO_BASE=https://www.yaqeenguide.com/resources
# Production builds (infra/deploy-web.sh) use same-origin /data and /resources.
```

Do not append `/quran` to either browser base; the reader does so itself. Rebuild
the client after changing a `NEXT_PUBLIC_*` value. The S3 URI is server/build
configuration, never a browser URL or credential. `QURAN_PYTHON` can select the
Python interpreter used by `quran:bundle`; otherwise it uses `api/.venv/bin/python`
when present, then `python3`. That interpreter needs boto3, already pinned in
`api/pyproject.toml`. Use the team's approved `YAQIN_AWS_PROFILE`/`AWS_PROFILE`
or an attached build role; profiles beginning with `aws-` are rejected.

## Deployment handoff

Verify AWS account **744172873146**, the bucket's actual region and the distribution
serving **d1x2w48x0bzbrs.cloudfront.net**. The repository's deployment scripts use
distribution **E2Z664SCKULGHC**; confirm that identity in AWS before modifying it.
Do not recreate the bucket, make it public, or upload the files again.

1. Give the build/publisher role the following source-read and derived-data-write
   permissions, alongside its existing site publishing/CloudFront permissions:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::yaqin-resources-744172873146",
         "Condition": {"StringLike": {"s3:prefix": ["resources/quran/*", "data/quran/*"]}}
       },
       {
         "Effect": "Allow",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::yaqin-resources-744172873146/resources/quran/*"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:AbortMultipartUpload"],
         "Resource": "arn:aws:s3:::yaqin-resources-744172873146/data/quran/*"
       }
     ]
   }
   ```

   If using SSE-KMS, add the relevant key permissions for these roles/OAC. Do not
   weaken encryption to work around a permission error. The existing API task
   policy in `infra/deploy-api.sh` now includes read access only to the Arabic and
   English edition prefixes. Apply its `QuranSourceRead` statement to the running
   `yaqin-api-task` role; the script's `build` subcommand does not update IAM.

2. Add a private S3 REST origin for `yaqin-resources-744172873146` to the existing
   CloudFront distribution. Use its actual regional endpoint and OAC with signing
   set to **always**. Leave OriginPath empty: URLs already contain their S3 keys.
   Add these two cache behaviors ahead of any broader conflicting path:

   | Path pattern | Destination |
   | --- | --- |
   | `/data/quran/*` | The resources bucket's generated `data/quran/` objects |
   | `/resources/quran/audio/alafasy-hafs-mp3quran-123/mp3/*` | Existing source MP3 objects in the resources bucket |

   Preserve the default website origin, `/api/*`, `/quran-upload`, upload API
   routes and all other existing behaviors. Allow GET/HEAD/OPTIONS with HTTPS.
   Set a suitable CORS response policy for the deployed site and local dev origins
   (requests carry no credentials). Preserve byte-range delivery. Do not attach
   an HTML rewrite to these behaviors. Global custom 403/404 HTML responses may
   still affect error bodies; the reader checks status and valid JSON structures.

3. Merge this read-only OAC statement into the existing bucket policy, preserving
   upload and other unrelated statements. Replace the distribution ARN if the
   verified distribution differs:

   ```json
   {
     "Sid": "YaqinQuranDelivery",
     "Effect": "Allow",
     "Principal": {"Service": "cloudfront.amazonaws.com"},
     "Action": "s3:GetObject",
     "Resource": [
       "arn:aws:s3:::yaqin-resources-744172873146/data/quran/*",
       "arn:aws:s3:::yaqin-resources-744172873146/resources/quran/audio/alafasy-hafs-mp3quran-123/mp3/*"
     ],
     "Condition": {"StringEquals": {
       "AWS:SourceArn": "arn:aws:cloudfront::744172873146:distribution/E2Z664SCKULGHC"
     }}
   }
   ```

   Keep public-access blocks enabled. Raw text/tafsir/provider files need no public
   CloudFront behavior. See [AWS OAC guidance](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

4. Install the existing API Python dependencies in the build environment, then
   run the web checks/build with S3 read access and **without** an offline override:

   ```sh
   cd YAQIN/web
   rtk proxy npm ci
   rtk proxy ../api/.venv/bin/python scripts/check-quran-s3.py
   rtk proxy node scripts/check-quran.mjs
   rtk proxy npm run typecheck
   rtk proxy npm run lint
   rtk proxy npm run quran:bundle
   rtk proxy npm run build
   ```

   If the local Next.js CSS worker environment requires it, use the supported
   `npm run build -- --webpack` alternative. No Quran MP3 directory should exist
   in `public/data/quran/` or `out/data/quran/`. A successful build must include
   eight text editions, eight tafsir editions and 114 index-listed recordings.

5. Run the updated `infra/deploy-web.sh` with the approved publishing credentials.
   It explicitly bundles from S3 before building, then uploads the derived reader JSON from `out/data/quran/` to
   **`s3://yaqin-resources-744172873146/data/quran/`**, removes that generated tree
   from the site export, publishes the remaining site as before and invalidates
   CloudFront. It neither downloads nor reuploads source MP3s. The new JSON
   layout is intentionally distinct from the original `resources/quran/` source
   layout. Both now live in the resources bucket. Configure the behaviors first.

6. Deploy the API image with `QURAN_S3_URI` set to the canonical URI and the task
   role source-read permissions. The full API deployment script sets both; for
   a build-only rollout, update the current task definition/IAM first. Other
   backend content/database/auth configuration stays in its existing deployment.

7. Verify live JSON, all edition/timing coverage, CORS and media behavior:

   ```sh
   rtk proxy curl -f https://d1x2w48x0bzbrs.cloudfront.net/data/quran/index.json
   rtk proxy curl -sS -D - -o /dev/null -H 'Range: bytes=0-1023' \
     https://d1x2w48x0bzbrs.cloudfront.net/resources/quran/audio/alafasy-hafs-mp3quran-123/mp3/002.mp3
   ```

   Expect valid JSON and MP3 HTTP **206** with correct Content-Range and
   `audio/mpeg`. Test reading/search/tafsir in all languages, verse playback,
   seeking, missing-file retry and surah 114. With a teacher session, verify
   `/api/review/sources/quran` still returns an exact verse. In a test environment,
   deny S3 access and verify 503 rather than a local fallback. Confirm the served
   text and timing hashes against the uploaded snapshot; size/inventory checks
   alone do not re-certify MP3 bytes or timing accuracy.

## Source updates and rollback

Use controlled source updates with retained hashes/receipts and review statuses.
Rebuild from S3, republish derived JSON and invalidate `/data/quran/*`. Invalidate
the affected MP3 paths if recordings change. Restart the API to clear its
in-memory exact-verse catalog. Preserve prior object versions/snapshots for
rollback; replacing source files alone does not rebuild the reader. Do not
delete the local backup until the deployment team has completed live verification.

Offline checks can deliberately use `YAQIN_RESOURCES_DIR=/path/to/verified/resources`;
that is test/authoring configuration and must not be set in deployment. It does
not cause MP3s to be exported or change the reader's remote audio URLs.
