# Deterministic Visual Archive

The visual archive is a private, repository-integrated Playwright system for rendered-browser QA and long-term evidence. It uses pinned Playwright 1.61.0, Sharp 0.35.3, and PDFKit 0.19.1, records the deployed commit, and reconciles routes from source files, the protected SQLite inventory, and rendered same-origin links.

Generated archives are runtime artifacts. They must remain outside Git and private unless the redacted edition has been reviewed for sharing.

## Safety Model

The two modes are intentionally separate:

- `live-readonly` authenticates to the deployed site, then blocks every unsafe same-origin and cross-origin request in Playwright. Same-origin requests also carry `x-woodsmith-audit-readonly: 1`, which makes `site/proxy.ts` reject unsafe methods with HTTP 409. The one Studio login POST is the explicit authentication exception.
- `snapshot-lab` runs against a verified SQLite `VACUUM INTO` clone and a reflink or full-copy media tree. Its Docker network is internal, provider keys are empty, paid/local model providers are disabled, and the production data/media paths are rejected.

The inventory endpoint requires both normal admin authentication and a separate audit token. It returns bounded route-driving metadata and counts, not users, customer contact details, notification bodies, payment data, reset tokens, or session state. Inventory acquisition permits only the exact same-origin GET endpoint. The ordinary capture context adds the audit token only to that endpoint and authenticated `audit=all` Studio pages.

Network diagnostics are evidence-based. A blocked mutation is expected only when its unsafe method and exact URL match a route-guard policy record. An aborted request is expected only when it is a same-origin fetch/XHR with Next.js RSC or prefetch evidence. Aborted documents, scripts, stylesheets, images, media, API calls, inventory calls, and unrelated resources remain validation failures.

Secrets, storage state, SQLite files, media, raw tiles, PNGs, HTML, PDFs, traces, and reports are ignored by Git. Authentication state is held under the runner tmpfs and removed in `finally`.

## One-Time NAS Setup

Run from the single authoritative checkout:

```bash
cd /volume2/docker_ssd/woodsmith
```

Set `VISUAL_AUDIT_TOKEN` in `.env` to one independently generated 64-character hexadecimal value. Keep the value single-quoted if needed. Then prepare the private Docker secret files:

```bash
chmod 700 visual-audit/scripts/prepare-live-secrets.sh
visual-audit/scripts/prepare-live-secrets.sh
```

The script obtains `STUDIO_PASSWORD` from the running `woodsmith` container, parses the token from `.env`, writes both files atomically with mode 600, and prints only nonsecret status. It does not use `read -p`, so it is safe when launched from zsh. It also does not use `docker compose config --environment`; the installed Synology Compose build does not support that option, and that failed approach must not be retried.

Required private files:

```text
secrets/woodsmith_audit_admin_password
secrets/woodsmith_visual_audit_token
```

Create the private output root:

```bash
install -d -m 700 /volume2/docker_ssd/woodsmith/visual-audits
```

## Static Validation

Use explicit nonsecret placeholders for Compose parsing. Do not render secret-bearing Compose output into logs.

```bash
cd /volume2/docker_ssd/woodsmith

export TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
export AUDIT_RUN_ID="config-check-$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"

npm run typecheck
npm run test
npm run lint
npm run build
npm --prefix visual-audit test

docker compose --env-file .env \
  -f docker-compose.synology.yml \
  config --quiet

docker compose --env-file .env \
  -f docker-compose.visual-audit-live.yml \
  config --quiet

docker compose --env-file .env \
  --env-file .visual-audit-lab.env \
  -f docker-compose.visual-audit-lab.yml \
  config --quiet
```

The lab Compose check requires a prepared `.visual-audit-lab.env`. If no lab has been prepared, validate with temporary nonsecret placeholder variables and nonproduction directories instead.

NAS candidate and production images must report the audited commit. Build them with:

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg WOODSMITH_BUILD_SHA="$(git rev-parse HEAD)" \
  -t woodsmith:prod \
  --load .
```

The runner permits an unstamped image only for a loopback development smoke. It rejects missing or mismatched build identity for remote and snapshot-lab targets.

## Live Read-Only Smoke

Always run a smoke archive before the full archive. One exported `AUDIT_RUN_ID` must be shared by capture, comparison, report, and validation.

```bash
cd /volume2/docker_ssd/woodsmith

export TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
export AUDIT_RUN_ID="smoke-$(date -u '+%Y%m%dT%H%M%SZ')-$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
export AUDIT_SCOPE=smoke
export AUDIT_RESUME=true

visual-audit/scripts/run-live-audit.sh
```

The smoke is accepted only when:

- the inventory endpoint is hidden without the token and denies a token-only unauthenticated request;
- a read-only unsafe request returns HTTP 409;
- the manifest reports zero successful unsafe requests;
- every rendered route has focused and activated skip-link evidence, and activation transfers focus to `#main-content`;
- capture, comparison, report, and validation use the same run ID;
- `validation.json` reports `passed: true`.

Resume an interrupted run by preserving the same `AUDIT_RUN_ID`, `TARGET_COMMIT_SHA`, scope, and output directory.

On a Windows release workstation, validate exact local app and runner images without mounting repository data or media:

```powershell
visual-audit/scripts/run-local-disposable-smoke.ps1 `
  -AppImage woodsmith:candidate-<short-sha> `
  -AuditImage woodsmith-visual-audit:<short-sha> `
  -CommitSha <full-40-character-sha>
```

The default `live-readonly` mode uses fake credentials, synthetic media, a network-isolated app, non-root containers, disabled external providers, and uniquely named disposable volumes. It validates the archive, rejects image-cache and unhandled-rejection errors, and removes every container and volume in `finally`.

Run the same current-image gate against an isolated local snapshot lab with `-TargetMode snapshot-lab`. The harness first initializes disposable source data/media, creates the lab database online with SQLite `VACUUM INTO`, copies media into distinct lab volumes, and then runs the app and audit only against those clones. Acceptance requires exactly one draft save and one cleanup delete, zero residual drafts, SQLite `quick_check`, unchanged source data/media fingerprints, an unchanged cloned media tree, and complete container/volume cleanup.

## Full Live Archive

```bash
cd /volume2/docker_ssd/woodsmith

export TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
export AUDIT_RUN_ID="full-$(date -u '+%Y%m%dT%H%M%SZ')-$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
export AUDIT_SCOPE=full
export AUDIT_RESUME=true

visual-audit/scripts/run-live-audit.sh
```

Full mode covers dark and light themes at:

- 1440 x 900, 1280 x 800, and 1024 x 768 desktop profiles;
- 1024 x 1366 tablet at DPR 2;
- 430 x 932, 390 x 844, 375 x 812, and 320 x 720 mobile profiles at DPR 3;
- 2560 x 1440 archival desktop at DPR 2.

Source- and database-inventoried canonical routes use the complete matrix above. Rendered same-origin links discovered from those pages use desktop, tablet, and mobile representatives in both themes plus archival desktop dark. This accounts for every finite link target without repeating deep captures for query variants that render the same page template. `coverage-plan.json` records both matrices and the sampling rationale.

Every captured route state receives a deterministic keyboard skip-link focus and activation check. Deep archival-dark capture on canonical routes opens disclosures, lightboxes, media pickers, inline editing, Studio editors, media inspectors, validation states, visualizer boundaries, and the element atlas. Long pages and independently scrollable surfaces use 12 percent overlapping raw tiles, stitched PNGs, tile manifests, and image-correlation seam checks. Chromium uses the container's explicit shared-memory mount rather than spilling into the bounded `/tmp` tmpfs; the audit runner has a 512 MiB scratch ceiling for browser profiles and temporary files.

## Snapshot Lab

Prepare a new isolated lab for every mutation-state run:

```bash
cd /volume2/docker_ssd/woodsmith
visual-audit/scripts/prepare-snapshot-lab.sh
visual-audit/scripts/run-snapshot-lab.sh
```

Preparation performs an online SQLite backup with `VACUUM INTO`, verifies `PRAGMA quick_check`, copies the database into a unique lab root, and creates a Btrfs reflink media copy when supported. If reflinks are unavailable, it performs a full `rsync -a` copy. Hardlinks are forbidden because lab rename/delete operations must not alter production originals.

Both lab mounts contain a matching run marker. The runner rejects missing markers, production paths, mismatched run IDs, and unavailable clones. The lab container health check verifies the cloned database before capture begins. The internal Docker network blocks outbound provider access.

The Compose files assign the private audit and image-cache tmpfs mounts to the configured `PUID:PGID`. Keep those values aligned with the container user; a root-owned mode-700 tmpfs prevents the non-root app or runner from writing its disposable cache.

The lab archive performs one bounded commission-draft save, reads the saved record back, captures the visible saved state, and deletes the draft before continuing. Validation requires exactly those two successful unsafe responses and the saved-state capture. Form error-state capture uses browser-native constraint validation without submitting, and synthetic `/api/visits` telemetry is blocked so the archive does not create visitor sessions. These mutations run only in `snapshot-lab`; `live-readonly` continues to reject every capture-time unsafe request.

Do not run `docker compose down -v`; the scripts use ordinary `down` and preserve bind-mounted evidence for review.

## Artifacts

Each restricted run directory uses mode 700 and contains mode-600 files:

```text
visual-audits/<run-id>/
  coverage-plan.json
  manifest.json
  comparison.json
  validation.json
  checksums.json
  checksums.sha256
  png/
  report/index.html
  report/print.html
  report/selection.json
  report/report-index.json
  woodmat-visual-atlas.pdf
  shareable/index.html
  shareable/manifest.redacted.json
  shareable/woodmat-visual-atlas-redacted.pdf
```

Raw tiles and tile manifests live beside their stitched capture. The restricted HTML report remains complete and searchable across every capture. `report/selection.json` records a deterministic maximum of 16 print representatives per authenticated route, covering route, theme, viewport, accessibility, header, and available deep-state families. PDFKit streams only that reviewed selection as bounded A3 image slices with selectable route/state metadata and native bookmarks. This prevents query variants and element atlases from expanding derived PDFs without bound; no raw restricted PNG is removed. Report reruns clear only their generated report/shareable directories and atomically replace both PDFs. The PNG/raw-tile tree and complete restricted HTML remain the highest-resolution sources of truth.

The shareable edition includes the same deterministic representatives filtered to anonymous, nonsensitive captures only. Its copied image assets use opaque sequence names and preserve only a safe image extension; captions and PDF labels do not reuse source filenames. The redacted manifest records both source and selected counts. Review it before moving it outside the restricted NAS archive.

## Validation Contract

`dist/validate.js` fails the run for:

- incomplete or truncated inventory;
- missing canonical or discovered-link route/theme/viewport combinations;
- missing focused or activated skip-link evidence for any rendered route;
- discovered same-origin links not captured;
- missing deep states that were present in the rendered surface inventory;
- unexpected status codes, redirects, console/page errors, request failures, broken media, or horizontal overflow;
- invalid, blank, missing, or duplicate PNG captures;
- raw-tile coverage gaps or seam-correlation failures;
- missing HTML contents targets, PDFs, PDF pages, or bookmark trees;
- a report selection count mismatch, unknown capture key, or omitted route;
- commit/run/mode mismatches;
- successful unsafe live requests;
- exact secret values found in any output artifact;
- permissive archive directory modes on Linux.

Checksums cover the final report, validation record, PNGs, raw tiles, manifests, HTML, PDFs, and comparison output.

## Scheduling And Retention

Use Synology Task Scheduler as `root` after deployment and after the first manual full run succeeds:

```bash
AUDIT_SCOPE=full /volume2/docker_ssd/woodsmith/visual-audit/scripts/run-live-audit.sh \
  >> /volume2/docker_ssd/woodsmith/visual-audits/scheduler.log 2>&1
```

The run script uses a lock directory to prevent overlap. Retention is dry-run by default:

```bash
AUDIT_RETENTION_DAYS=90 visual-audit/scripts/prune-audits.sh
```

After reviewing the listed paths:

```bash
AUDIT_RETENTION_DAYS=90 visual-audit/scripts/prune-audits.sh --apply
```

Retention refuses roots outside `/volume2/docker_ssd/woodsmith/visual-audits` and refuses periods shorter than 30 days.

## Release Gate

Do not deploy merely to obtain screenshots. The application candidate must first pass the normal database backup, `quick_check`, no-embedded-database, disposable-data, mounted media/data/cache, route, log, rollback-image, and public canonical-origin gates. Run the smoke archive against the promoted candidate, then the full live archive and isolated lab archive. Keep the previous image and database backup until the post-deployment archive validates.
