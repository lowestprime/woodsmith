# Beaman Woodworks Synology NAS Deployment Guide

## Goal

Deploy Beaman Woodworks from `/volume2/docker_ssd/woodsmith/` so that:

- the app listens only on `127.0.0.1:3002`
- Synology Reverse Proxy terminates public HTTPS
- SQLite persists in `site/data/`
- Next.js image cache persists in `cache/next-image/`
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` is mounted directly to `/app/pics:rw`
- password reset links, share links, and Stripe redirects use the public site URL

## Runtime layout

```text
/volume2/docker_ssd/woodsmith/
├── .env
├── Dockerfile
├── docker-compose.synology.yml
├── site/
│   └── data/
├── cache/
│   └── next-image/
├── releases/
└── backups/
```

## Required directories

Create these once on the NAS:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/{site/data,cache/next-image,releases,backups/runtime,restores}
```

Then ensure the container user can write to `site/data`, `cache`, and the real NAS photo library:

```bash
chown -R 1026:100 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/restores /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025
chmod -R u+rwX,g+rwX /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/restores /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025
```

## `.env`

Start from `.env.example` and fill at least:

```dotenv
PUID=1026
PGID=100
SITE_URL=https://woodmat.ch
NEXT_PUBLIC_SITE_URL=https://woodmat.ch
MEDIA_ROOT=/app/pics
DATA_ROOT=/app/site/data
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Wrap any literal secret containing `$` in single quotes in `.env` (for example, `STUDIO_PASSWORD='literal$value'`). Otherwise Docker Compose treats the dollar-prefixed text as variable interpolation and the container receives a different secret.

Optional live services:

```dotenv
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
EASYPOST_API_KEY=
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=Beaman Woodworks
SMTP_FROM_ADDRESS=
SHIP_FROM_NAME=Beaman Woodworks
SHIP_FROM_STREET1=
SHIP_FROM_CITY=
SHIP_FROM_STATE=
SHIP_FROM_ZIP=
SHIP_FROM_COUNTRY=US
AI_PROVIDER=local
AI_ANALYSIS_PROVIDER=local-sidecar
AI_EMBEDDING_PROVIDER=local-clip
AI_FALLBACK_PROVIDER=disabled
ENABLE_AI_MEDIA_ANALYSIS=true
ENABLE_EMBEDDING_SEARCH=true
ENABLE_LOCAL_IMAGE_EMBEDDINGS=true
LOCAL_AI_SIDECAR_URL=http://192.168.1.50:8765
LOCAL_AI_SIDECAR_TOKEN=
LOCAL_EMBEDDING_MODEL=sentence-transformers/clip-ViT-B-32
OLLAMA_BASE_URL=http://192.168.1.50:11434
OLLAMA_VISION_MODEL=gemma4
GEMINI_API_KEY=
GEMINI_VISION_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
ENABLE_GEMINI_FALLBACK=false
MEDIA_AI_MAX_BATCH=24
MEDIA_AI_CONFIDENCE_HIGH=0.82
MEDIA_AI_CONFIDENCE_MIN=0.58
MEDIA_AI_AMBIGUITY_DELTA=0.08
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=high
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_VISION_MODEL=gpt-5.4-nano
ENABLE_PUBLIC_AI_RENDERING=false
ENABLE_AI_BACKGROUND_CLEANUP=false
```

Replace the example `192.168.1.50` with the laptop/GPU-host address that is reachable from inside the container. Do not use `127.0.0.1` for a sidecar running on another machine. Leave `AI_ANALYSIS_PROVIDER=disabled` and `AI_EMBEDDING_PROVIDER=disabled` if the deployment should remain manual-only.

## Compose file

`docker-compose.synology.yml` is the authoritative runtime definition. Important points:

- `MEDIA_ROOT=/app/pics`
- `DATA_ROOT=/app/site/data`
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw`
- `/volume2/docker_ssd/woodsmith/site/data:/app/site/data`
- `/volume2/docker_ssd/woodsmith/cache/next-image:/app/site/.next/cache`
- loopback-only port binding on `127.0.0.1:3002`
- local media AI is optional and fails closed to the manual editor when its sidecar is unavailable
- OpenAI image generation/cleanup remains disabled unless a server-side API key and explicit feature flag are provided
- Studio overview includes a Persistence card that should report `/app/site/data`, `quick_check=ok`, WAL journal mode, and a writable data root before and after rebuilds.

The `/app/pics` mount is intentionally read-write. `MEDIA_ROOT` must be absolute. The dashboard can upload, rename, delete, tag, and assign media directly inside that library. Do not mount `/volume2/docker_ssd/woodsmith/pics` into `/app/pics`; the attached Synology context shows that nested mount points under `docker_ssd` can make the share ineligible for Synology Drive Team Folder use.

The image now normalizes ownership and read permissions for bundled runtime assets under `/app/site/public` and `/_next/static` so the app still boots correctly when `docker-compose.synology.yml` runs the container as the NAS `PUID:PGID` user instead of the image-default `nextjs` user.

## Local media AI deployment choices

The local sidecar is deliberately separate from the NAS web container so model dependencies and GPU runtimes do not enlarge or destabilize the production image. Full setup is in `tools/media-ai-sidecar/README.md`.

### A. Windows or WSL laptop

Run the sidecar against the mapped photo library (`Y:\homes\Cooper\Photos\Dad_Woodworking_09262025` on Windows or its WSL mount). Bind to the laptop LAN interface, require `MEDIA_AI_SIDECAR_TOKEN`, and allow inbound TCP 8765 only from the NAS IP. Set `LOCAL_AI_SIDECAR_URL` in the NAS `.env` to that LAN address.

Keep `MEDIA_AI_CACHE` on a local SSD outside the mapped photo tree. It contains the resumable file index, 768px generated review thumbnails, image/text embeddings, analyses, and cluster state. Repeated bounded runs continue uncached work; this cache can be backed up independently and must never be placed in `/app/pics`.

The sidecar host and website use different variable names for the same secret: set `MEDIA_AI_SIDECAR_TOKEN` on the sidecar host and `LOCAL_AI_SIDECAR_TOKEN` in the NAS application environment to one long random value. Never place it in a URL or command log. A non-loopback sidecar bind fails closed without the server token. Start and supervise the Windows process with `tools/media-ai-sidecar/scripts/run-sidecar.ps1` or `run-sidecar-supervised.ps1`, then run `probe-sidecar.ps1`; the probe reports health and verifies wrong-token rejection without printing the token.

`MEDIA_AI_ACCELERATOR=auto|cpu|cuda` is a strict sidecar policy. `auto` selects a usable PyTorch CUDA device or records why CPU was selected; `cpu` never loads CUDA; forced `cuda` fails if unavailable. Bound `MEDIA_AI_EMBED_BATCH_SIZE` and the PyTorch allocator with `MEDIA_AI_GPU_MEMORY_LIMIT_MB`, and point all supervised sidecar processes on that host to the same `MEDIA_AI_GPU_LEASE_FILE`. Health reports the active operation, lease owner, memory, and indexed-cache-only pending counts. It does not recursively scan the NAS share merely to answer health.

The current RTX 3070 Ti Laptop GPU benchmark used twelve disposable library copies and measured about 3.76x lower warm median latency on CUDA with identical label rankings, maximum score drift 0.000105856, and 670 MiB peak reserved VRAM. The visual archive remains CPU/SwiftShader because its tested GPU paths did not preserve canonical output with a material benefit. Keep archive and sidecar work on those separate backends; if a future audit stage qualifies for CUDA, schedule it outside sidecar training and require one shared host lease before allowing overlap.

### B. Separate GPU host

Mount the same Synology library read-only or read-write as operationally required, run the sidecar with its cache on local SSD, and configure the NAS container with the host URL/token. Automatic CUDA selection requires a usable PyTorch CUDA runtime; CPU remains the safe fallback. Keep the cache, model files, and GPU lease outside the mounted photo tree.

### C. Manual workflow only

Set `AI_ANALYSIS_PROVIDER=disabled`, `AI_EMBEDDING_PROVIDER=disabled`, `ENABLE_AI_MEDIA_ANALYSIS=false`, and `ENABLE_EMBEDDING_SEARCH=false`. Upload, crop, rename, tag, assign, review, and publish remain available.

ChatGPT Plus is not an API backend. Gemini and OpenAI require their own API credentials and account billing/quota terms. Gemini is optional fallback only; no cloud free tier should be treated as unlimited.

## Build from WSL or another Docker host

```bash
cd /mnt/woodsmith
docker buildx build \
  --platform linux/amd64 \
  --build-arg WOODSMITH_BUILD_SHA="$(git rev-parse HEAD)" \
  -t woodsmith:prod \
  --load .
```

Optional local container smoke test:

For local app and visual-audit images on Windows, use `visual-audit/scripts/run-local-disposable-smoke.ps1`. Its default live-readonly mode runs without production mounts or credentials; a dirty pre-commit app must retain the Dockerfile's `WOODSMITH_BUILD_SHA=unknown`, which this one loopback smoke accepts without treating it as an exact candidate. After committing, rebuild with the exact SHA before adding `-TargetMode snapshot-lab` to prove the bounded mutation flow against separate online-cloned SQLite and copied synthetic-media volumes. Both modes remove their temporary app, data, media, output, and secret resources after validation.

```bash
docker run --rm -p 3002:3002 \
  --env-file .env \
  -e MEDIA_ROOT=/app/pics \
  -v "$(pwd)/site/data:/app/site/data" \
  -v "/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw" \
  -v "$(pwd)/cache/next-image:/app/site/.next/cache" \
  woodsmith:prod
```

## Export and load on the NAS

From the build host:

```bash
docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

On the NAS:

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load
cd /volume2/docker_ssd/woodsmith
docker compose -f docker-compose.synology.yml up -d
```

The startup path includes seed migration v6. It preserves dashboard edits and deletion tombstones, normalizes legacy developer-contact data, removes the obsolete Process navigation entry, and replaces only exact legacy Shop/Process/custom-work seed wording.

The independent SQLite schema ledger currently applies through version 6. Its additive tables persist account drafts, idempotency keys, expiring project-access grants, render ownership/quotas, submission quotas, and media-operation before/after snapshots used by guarded batch rollback. Never replace the mounted `/app/site/data` directory during an image rebuild; back it up and run `PRAGMA quick_check` before and after deployment.

## Reverse proxy

Configure Synology Reverse Proxy with:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

The public source host should match `SITE_URL` and `NEXT_PUBLIC_SITE_URL`.

The app treats `https://woodmat.ch` as canonical. Requests arriving on `www.woodmat.ch` are redirected by the Next `proxy.ts` boundary to the canonical origin.

## Cloudflare visitor-location headers

If you want the dashboard visitor map to show country and city data, enable Cloudflare IP Geolocation or the Add visitor location headers Managed Transform for the zone. Cloudflare documents that:

- `CF-Connecting-IP` carries the client IP to the origin
- `CF-IPCountry` carries the two-letter visitor country code
- the visitor-location transform can add city, region, latitude, and longitude headers

Without those headers, the app still records visitor sessions, paths, and hosts, but the map/list will show unknown location data.

## Verification after deploy

### Container health

```bash
cd /volume2/docker_ssd/woodsmith
docker compose -f docker-compose.synology.yml ps
```

### Data and media permissions

```bash
docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'test -w /app/site/data && echo DATA_OK; test -w /app/pics && echo MEDIA_OK; test -w /app/site/.next/cache && echo CACHE_OK'
```

### Media route

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
etag=$(curl -sS -D - -o /dev/null http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG | awk 'BEGIN{IGNORECASE=1} /^etag:/{sub(/\r$/, "", $2); print $2; exit}')
curl -sS -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $etag" http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

An unchanged conditional request must return **304**. Media responses include ETag and Last-Modified validators with immediate revalidation, so browser and Next image-cache entries can avoid retransferring unchanged originals without hiding same-path updates. Missing or removed files must return **404** (not a broken stream). Stale `media_items` rows pointing at deleted paths used to trigger `failed to pipe response` in logs when the dashboard rendered hundreds of thumbnails at once.

Portfolio, shop, cart, and carousel thumbnails use the mounted writable Next image cache at `/app/site/.next/cache`; the full-screen lightbox still requests the original `/media/...` source. Keep that cache mount writable and retain the configured Next image qualities during upgrades.

### Woodshop dashboard (`/studio`) and large libraries

- The dashboard pages the complete indexed library at 24, 48, 72, or 96 records per view. Whole-library search, assignment/review filters, media-type filters, and paging run in place through authenticated server actions and persist in the URL.
- Media automation now centers on **Train selected**, **Improve page**, and **Continue library**. These guided actions run the bounded scan/analyze/embed/cluster/rank sequence for selected, current-page, or next-library-batch scopes while preserving persistent model/hash/cluster metadata and explicit evidence. Suggested matches cannot publish or assign without a reviewed human action.
- The compact trainer status card should show the active local provider, cache totals, indexed media, accepted/rejected training labels, analyzed files, vectors, and clusters. Raw provider cards and individual scan/analyze/embed/cluster actions are intentionally tucked under Advanced actions for diagnostics.
- Routine media metadata saves, assignments, uploads, renames, and deletes do not refresh `/studio`. **Refresh library** is the explicit filesystem rescan and requires the `/app/pics:rw` mount to be present.
- **Organize selected** applies at most 96 collision-checked folder/name/tag/quality/assignment/role/stage/visibility changes with filesystem compensation and one SQLite reference transaction. Recent completed batches can be rolled back only while their current snapshots still match; later edits are never overwritten.
- Optional background cleanup writes an unreviewed derivative under `/app/pics/derivatives/background-cleanup/`, records its source path/size/time/provider and manual-publication gate, and never modifies the original file.
- The verification queue proposes only one sufficiently separated best-piece match per unassigned image. It never assigns on preview; use the explicit **Assign** control after visual verification.
- Confirm `/studio?panel=categories` can add, rename, reassign, and delete portfolio categories, and `/studio?panel=media` shows one active inspector rather than a long editor stack.
- After upgrading the app image, use **Refresh library** once so the scanner skips Synology **`@eaDir`** folders and **`SYNOFILE_THUMB*`** files; those paths are also excluded from SQL media lists.
- If logs show `ENOENT` for profile or generated paths, fix the file on disk or clear the bad path in SQLite / re-upload.

### App routes

```bash
curl -I http://127.0.0.1:3002/
curl -I http://127.0.0.1:3002/portfolio
curl -I http://127.0.0.1:3002/shop
curl -I http://127.0.0.1:3002/process
curl -I http://127.0.0.1:3002/commissions
curl -I http://127.0.0.1:3002/commissions/status
curl -I http://127.0.0.1:3002/studio/login
```

Use a disposable buyer request during candidate validation and confirm that the resulting `/requests/BW-CM-*` URL contains no email query parameter. Project lookup must POST the reference and buyer email at `/commissions/status`, set an `HttpOnly` access cookie, and keep access after a reload. Also verify that `/app/pics/commission-staging` contains no abandoned files after successful or rejected submissions.

`/journal` and `/journal/[slug]` should redirect to the Process routes.

### Logs

```bash
docker compose -f docker-compose.synology.yml logs --tail=200 woodsmith
```

## Post-deployment visual archive

After the candidate passes the normal database, mount, route, and log checks, run the deterministic live-readonly smoke before the full archive:

```bash
cd /volume2/docker_ssd/woodsmith
visual-audit/scripts/prepare-live-secrets.sh

export TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
export AUDIT_RUN_ID="smoke-$(date -u '+%Y%m%dT%H%M%SZ')-$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
export AUDIT_SCOPE=smoke

visual-audit/scripts/run-live-audit.sh
```

The same run ID is used by capture, baseline comparison, report generation, and validation. Canonical routes retain the full viewport/theme/deep matrix; discovered link variants use recorded desktop/tablet/mobile theme representatives plus archival desktop. The restricted PNG tree and searchable HTML remain complete. `report/selection.json` records the bounded per-route set used by the A3 bookmarked PDFs and redacted edition. Chromium uses the Compose `ipc: host` shared-memory path, and the audit runner receives a 512 MiB `/tmp` scratch ceiling. Do not use `docker compose config --environment`; the Synology Compose build does not support it. The secret preparation script is noninteractive and zsh-safe, reads the active Studio password without displaying it, and writes ignored mode-600 files.

Worker settings default to `auto`: capture uses at most 2 workers, while validation and report generation use at most 6. Explicit ranges are 1-6 for capture and 1-8 for validation/report. Snapshot-lab capture remains forced to one worker so its ordered mutation states cannot overlap. A disposable 1/2/4/6 capture matrix selected two as the NAS-safe automatic cap; higher counts shortened route capture but imposed four or six simultaneous browser contexts while the special-state stage remained serial. The validation caps come from a disposable full-clone matrix with identical failure, diagnostic, validation, and checksum hashes at 1, 4, 6, and 8 workers; eight saved only 5.8 percent over six while increasing CPU time by about 24.7 percent and peak memory by about 21.2 percent. Full-page evidence always uses viewport tiles and validated stitches rather than Playwright's resize-based full-page screenshot, preventing responsive-image candidate cancellation while retaining raw evidence. Keep `auto` unless a representative NAS benchmark justifies a bounded override. The commands and measurements are in [`docs/visual-archive.md`](docs/visual-archive.md).

`VISUAL_AUDIT_ACCELERATOR=auto` is independent of the worker settings. It records a bounded CUDA capability probe and actual Chromium CDP renderer, then uses CUDA only for stages explicitly enabled by a deterministic representative benchmark. The current allowlist is empty: RTX/Docker tests found no GPU PNG decoder and no hardware Chromium backend, so `auto` correctly retains the portable pipeline. Do not add a NAS GPU reservation or force `cuda` merely because `nvidia-smi` works. Forced `cuda` intentionally fails until a qualifying stage exists. Exact evidence and rerun commands are in [`docs/visual-archive.md`](docs/visual-archive.md).

Mutation-dependent success/error states require `visual-audit/scripts/prepare-snapshot-lab.sh` followed by `visual-audit/scripts/run-snapshot-lab.sh`. The lab uses a `VACUUM INTO` database clone, reflink/full-copy media, verified run markers, an internal Docker network, and disabled external integrations. It never mounts production data or media read-write.

Full commands, artifacts, permissions, retention, and acceptance criteria are in [`docs/visual-archive.md`](docs/visual-archive.md).

## Paired backup and recovery

Because Studio can update both SQLite references and the shared media library, recoverable state consists of all three of these surfaces:

- `site/data/woodsmith.sqlite`, captured online with SQLite `VACUUM INTO`
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025`, copied byte-for-byte with per-file SHA-256 evidence
- `.env`, copied into the restricted backup without printing its contents

The candidate image includes `/app/site/ops/runtime-state.mjs`. The tool refuses overlapping source/output paths, symlinks, special files, changing source media, existing destinations, path traversal, missing or extra backup files, failed hashes, and failed SQLite `quick_check`. It writes through a hidden partial directory and promotes the backup only after verification.

### Create and verify a paired backup

Build the exact candidate first; building does not touch mounted production state. Then set only nonsecret shell values and run the tool with networking disabled. Keep the data mount writable so SQLite can coordinate safely with the live WAL; the tool itself opens the source database read-only and writes only to the backup mount.

```bash
cd /volume2/docker_ssd/woodsmith

export PUID=1026
export PGID=100
export RUN_ID="$(date -u '+%Y%m%dT%H%M%SZ')"
export CANDIDATE_IMAGE="woodsmith:candidate-$(git rev-parse --short=8 HEAD)"

mkdir -p backups/runtime restores
chmod 700 backups backups/runtime restores
chown -R "${PUID}:${PGID}" backups restores

docker run --rm \
  --network none \
  --read-only \
  --user "${PUID}:${PGID}" \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
  -v /volume2/docker_ssd/woodsmith/site/data:/state/data:rw \
  -v /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/state/media:ro \
  -v /volume2/docker_ssd/woodsmith/backups/runtime:/state/backups:rw \
  -v /volume2/docker_ssd/woodsmith/.env:/state/config/runtime.env:ro \
  --entrypoint node \
  "$CANDIDATE_IMAGE" \
  --experimental-sqlite \
  /app/site/ops/runtime-state.mjs backup \
  --data-root /state/data \
  --media-root /state/media \
  --backup-root /state/backups \
  --environment-file /state/config/runtime.env \
  --run-id "$RUN_ID"

docker run --rm \
  --network none \
  --read-only \
  --user "${PUID}:${PGID}" \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v /volume2/docker_ssd/woodsmith/backups/runtime:/state/backups:ro \
  --entrypoint node \
  "$CANDIDATE_IMAGE" \
  --experimental-sqlite \
  /app/site/ops/runtime-state.mjs verify \
  --backup "/state/backups/woodsmith-runtime-${RUN_ID}"
```

Record the emitted manifest SHA-256, media count, byte count, and `quickCheck=ok`. The backup directory and environment copy are mode-restricted and must never be added to Git, a public archive, or CI artifacts.

### Prove a staging restore

Before promotion, restore the backup into new paths on the same volumes as the eventual live paths. This validates recovery without overwriting or mounting production state:

```bash
export DATA_STAGE="/volume2/docker_ssd/woodsmith/restores/${RUN_ID}-data"
export MEDIA_STAGE="/volume1/homes/Cooper/Photos/.woodsmith-restore-${RUN_ID}"
export ENV_STAGE="/volume2/docker_ssd/woodsmith/restores/${RUN_ID}.env"

test ! -e "$DATA_STAGE"
test ! -e "$MEDIA_STAGE"
test ! -e "$ENV_STAGE"

docker run --rm \
  --network none \
  --read-only \
  --user "${PUID}:${PGID}" \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
  -v /volume2/docker_ssd/woodsmith/backups/runtime:/state/backups:ro \
  -v /volume2/docker_ssd/woodsmith/restores:/state/restores:rw \
  -v /volume1/homes/Cooper/Photos:/state/photos:rw \
  --entrypoint node \
  "$CANDIDATE_IMAGE" \
  --experimental-sqlite \
  /app/site/ops/runtime-state.mjs restore \
  --backup "/state/backups/woodsmith-runtime-${RUN_ID}" \
  --data-destination "/state/restores/${RUN_ID}-data" \
  --media-destination "/state/photos/.woodsmith-restore-${RUN_ID}" \
  --environment-destination "/state/restores/${RUN_ID}.env"
```

The restore command rechecks the complete backup before writing, validates the restored database and every copied file, and compensates its own newly created outputs if promotion fails. Do not swap these paths during an ordinary pre-deployment proof; keep them as verified rollback inputs until the candidate passes.

### Stopped-service recovery or rollback

Only when recovery is actually required, stop the app and move the verified staging paths into place. Keep the previous state under unique hold names on the same filesystems; never delete it during the release window.

```bash
export DATA_HOLD="/volume2/docker_ssd/woodsmith/restores/${RUN_ID}-previous-data"
export MEDIA_HOLD="/volume1/homes/Cooper/Photos/.woodsmith-previous-${RUN_ID}"
export ENV_HOLD="/volume2/docker_ssd/woodsmith/restores/${RUN_ID}-previous.env"

test ! -e "$DATA_HOLD"
test ! -e "$MEDIA_HOLD"
test ! -e "$ENV_HOLD"

docker compose --env-file .env -f docker-compose.synology.yml stop woodsmith

mv site/data "$DATA_HOLD"
mv "$DATA_STAGE" site/data
mv /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025 "$MEDIA_HOLD"
mv "$MEDIA_STAGE" /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025
mv .env "$ENV_HOLD"
mv "$ENV_STAGE" .env

docker compose --env-file .env -f docker-compose.synology.yml up -d --force-recreate woodsmith
```

If candidate validation fails, retag the recorded rollback image, stop the service, move the failed candidate state aside, move the three hold paths back, and recreate the service. Run SQLite `quick_check`, mounted-media checks, internal/public routes, logs, and persistence/recreation checks again before declaring rollback complete.

Create the paired backup before deployment and before a large media reorganization. The database operation ledger can reverse application-managed changes, but it is not a substitute for a verified filesystem copy when storage fails or files change outside the application.

The Docker context excludes SQLite databases, WAL/SHM files, backups, and media-AI caches. In addition, `site/scripts/safe-build.mjs` forces every Next build to use disposable temporary data/media roots and rejects standalone output containing a database, WAL/SHM, backup, or test/spec source file. Runtime state and build-only tests are never copied into an image layer; the image creates an empty `/app/site/data` directory that is populated only by the writable production bind mount. Seed upgrades are non-destructive for existing Studio-edited records, so rebuilds should preserve page/settings edits when the same mounted database is active.

## Current deployment caveats

- `node:sqlite` remains experimental in Node and emits warnings during build and runtime.
- SMTP, Stripe, and EasyPost remain optional until configured.
- Email verification cannot be completed live until the SMTP server accepts the configured sender and recipient; the account UI displays the actual transport failure.
- The public custom work page is contact-first and includes a credential-free procedural 3D scale preview. Photorealistic previews and AI-cleaned copies are separate optional OpenAI features. Media classification/visual search is local-first and can run without OpenAI.
- The build can fail on Windows if a standalone `npm run start` process still has `.next/standalone/data/woodsmith.sqlite` locked.
