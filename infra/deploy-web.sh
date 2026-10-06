#!/usr/bin/env bash
# Build the static web export and publish it to S3 behind CloudFront.
# Refuses to ship a bundle without Supabase config: in a static export these public values
# are baked in at build time, and a build without them silently turns the live site into
# guest-only ("Accounts are not configured on this deployment yet").
#
# Configure the root .env (and optional .env.production.local), then run infra/deploy-web.sh.
set -euo pipefail

REGION=${REGION:-eu-west-1}
BUCKET=${BUCKET:-yaqin-web-744172873146}
DIST_ID=${DIST_ID:-E2Z664SCKULGHC}
QURAN_BUCKET=${QURAN_BUCKET:-yaqin-resources-744172873146}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ "$BUCKET" != "$QURAN_BUCKET" ] || { echo "site BUCKET must differ from QURAN_BUCKET: site sync uses --delete" >&2; exit 1; }

cd "$ROOT/web"
npm ci
NEXT_PUBLIC_SUPABASE_URL=$(NODE_ENV=production node --input-type=module -e 'import "./scripts/load-env.mjs"; process.stdout.write(process.env.NEXT_PUBLIC_SUPABASE_URL || "")')
KEY=$(NODE_ENV=production node --input-type=module -e 'import "./scripts/load-env.mjs"; process.stdout.write(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")')
: "${NEXT_PUBLIC_SUPABASE_URL:?set NEXT_PUBLIC_SUPABASE_URL (public, baked into the bundle)}"
[ -n "$KEY" ] || { echo "set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)" >&2; exit 1; }
case "$KEY" in *service_role*|sb_secret_*) echo "refusing: that is a SECRET key, use the publishable/anon key" >&2; exit 1;; esac

# Production routes /api/* to FastAPI on the same origin.
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-}
export NEXT_PUBLIC_API_ENABLED=${PROD_API_ENABLED:-true}
# Quran text and recitation are served by the same distribution, so the bundle uses relative
# URLs and works on every hostname (yaqeenguide.com, www, app, studio, the CloudFront name).
# The root .env's absolute values are for local development only.
export NEXT_PUBLIC_QURAN_BASE=${PROD_QURAN_BASE:-/data}
export NEXT_PUBLIC_QURAN_AUDIO_BASE=${PROD_QURAN_AUDIO_BASE:-/resources}

rm -rf out .next
# Only the asset publishing step needs private S3 read access; ordinary local dev/build does not.
npm run quran:bundle
npm run build -- --webpack
npm run check:routing

# Verify the bundle before it leaves this machine.
grep -rlq "$NEXT_PUBLIC_SUPABASE_URL" out/_next/static || { echo "Supabase URL not in bundle; aborting" >&2; exit 1; }
grep -rlq "$KEY" out/_next/static || { echo "Supabase key not in bundle; aborting" >&2; exit 1; }

# Reader JSON is derived from the canonical S3 sources; MP3s already live there.
# CloudFront /data/quran/* must point to QURAN_BUCKET before publishing (docs/QURAN_S3.md).
aws --region "$REGION" s3 sync out/data/quran/ "s3://$QURAN_BUCKET/data/quran/" --only-show-errors
rm -rf out/data/quran
# Keep older immutable chunks so tabs opened before a deployment can still navigate.
aws --region "$REGION" s3 sync out/_next/static/ "s3://$BUCKET/_next/static/" --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws --region "$REGION" s3 sync out/ "s3://$BUCKET/" --delete --exclude '_next/static/*' --cache-control 'no-cache' --only-show-errors
id=$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query Invalidation.Id --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$id"
echo "Done: web published and CloudFront invalidated ($id)"
