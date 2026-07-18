# Deterministic Visual Archive

The visual archive is a private, repository-integrated Playwright system for rendered-browser QA and long-term evidence. It uses pinned Playwright 1.61.0, Sharp 0.35.3, and PDFKit 0.19.1, records the deployed commit, and reconciles routes from source files, the protected SQLite inventory, and rendered same-origin links.

Generated archives are runtime artifacts. They must remain outside Git and private unless the redacted edition has been reviewed for sharing.

## Safety Model

The two modes are intentionally separate:

- `live-readonly` authenticates to the deployed site, then blocks every unsafe same-origin and cross-origin request in Playwright. Same-origin requests also carry `x-woodsmith-audit-readonly: 1`, which makes `site/proxy.ts` reject unsafe methods with HTTP 409. The one Studio login POST is the explicit authentication exception.
- `snapshot-lab` runs against a verified SQLite `VACUUM INTO` clone and a reflink or full-copy media tree. Its Docker network is internal, provider keys are empty, paid/local model providers are disabled, and the production data/media paths are rejected.

The inventory endpoint requires both normal admin authentication and a separate audit token. It returns bounded route-driving metadata, counts, and public-media aggregates, not users, customer contact details, notification bodies, payment data, reset tokens, session state, or media paths. Public media references and mounted file versions are represented only by SHA-256 digests. Inventory acquisition permits only the exact same-origin GET endpoint. The ordinary capture context adds the audit token only to that endpoint and authenticated `audit=all` Studio pages.

Network diagnostics are evidence-based. A blocked mutation is expected only when its unsafe method and exact URL match a route-guard policy record. An aborted request is expected only when it is a same-origin fetch/XHR with Next.js RSC or prefetch evidence, or a safe same-origin font/image/media request canceled after the page has completed capture, passed the final visual/request drain, and entered deliberate teardown. The teardown exception is lifecycle-scoped: aborts during navigation, screenshots, interactions, or settling remain failures, and diagnostics include the active capture phase. Aborted documents, scripts, stylesheets, API calls, inventory calls, cross-origin resources, and unrelated resources remain validation failures.

Secrets, storage state, SQLite files, media, raw tiles, PNGs, HTML, PDFs, traces, and reports are ignored by Git. Authentication state is held under the runner tmpfs and removed in `finally`.

## Evidence Tiers

Every schema-v5 archive has one explicit evidence tier. Resume refuses a different tier, schema, mode, origin, commit, or accelerator record.

- `tier-1-synthetic` is the bounded Windows/local Docker smoke. The app must report `WOODSMITH_MEDIA_PROVENANCE=synthetic-fixture`. It proves application, browser, policy, report, and cleanup behavior but is not production-media evidence.
- `tier-2-production-clone` requires `snapshot-lab`, a verified SQLite clone, and a reflink or full copy of the production media mount. The app must report `production-clone`. It is the predeployment exact-candidate media and mutation-state gate.
- `tier-3-live-production` requires `live-readonly` against a non-loopback HTTPS origin. The deployed app must report `production-live`. It is the postdeployment public/admin rendered-state gate and never permits a capture-time production mutation.

`live-media.json` reconciles the protected public-reference aggregate with hashed rendered mounted-media observations. `placeholder-report.json` records bounded placeholder digests and reasons. Tier 2 and Tier 3 reject synthetic markers, missing public files, absence of mounted media on anonymous routes, visible load failures, and any visible placeholder without an explicit audited allowance. Intentional “media verification pending” surfaces are marked in source and remain counted rather than silently ignored. Raw media paths are never written to these reports or the shareable manifest.

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

The runner permits `WOODSMITH_BUILD_SHA=unknown` only for the bounded loopback disposable smoke in either read-only or cloned-lab mode. It rejects missing or mismatched build identity for remote or full targets. After committing a candidate, rebuild both images with the exact commit before accepting Tier 2 or release evidence.

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

The default `live-readonly` mode uses fake credentials, synthetic media, a network-isolated app, non-root containers, disabled external providers, and uniquely named disposable volumes. It is always labeled `tier-1-synthetic`; the harness verifies that the app reports `synthetic-fixture`, both media reports pass, and every container and volume is removed in `finally`.

During a dirty pre-commit loop, build the app with its default `WOODSMITH_BUILD_SHA=unknown`; the same command accepts that identity only for its loopback disposable smoke modes and reports `APP_BUILD_IDENTITY=unknown-loopback-smoke`. Never stamp a dirty image with the current committed SHA. Once the slice is committed, rebuild and require `APP_BUILD_IDENTITY=exact`.

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

The live Compose runner fixes `AUDIT_EVIDENCE_TIER=tier-3-live-production`, while the production app fixes `WOODSMITH_MEDIA_PROVENANCE=production-live`. Do not override either value to make a mismatched archive pass.

Full mode covers dark and light themes at:

- 1440 x 900, 1280 x 800, and 1024 x 768 desktop profiles;
- 1024 x 1366 tablet at DPR 2;
- 430 x 932, 390 x 844, 375 x 812, and 320 x 720 mobile profiles at DPR 3;
- 2560 x 1440 archival desktop at DPR 2.

Source- and database-inventoried canonical routes use the complete matrix above. Rendered same-origin links discovered from those pages use desktop, tablet, and mobile representatives in both themes plus archival desktop dark. This accounts for every finite link target without repeating deep captures for query variants that render the same page template. `coverage-plan.json` records both matrices and the sampling rationale.

Every captured route state receives a deterministic keyboard skip-link focus and activation check. Deep archival-dark capture on canonical routes opens disclosures, lightboxes, media pickers, inline editing, Studio editors, media inspectors, validation states, visualizer boundaries, and the element atlas. Every full-page capture and every independently scrollable surface uses 12 percent overlapping viewport tiles, stitched PNGs, tile manifests, and image-correlation seam checks. The runner does not use Playwright's geometry-changing `fullPage: true` path: repeated disposable runs proved that it could intermittently cancel six responsive Next Image candidates on `/portfolio`, while the tiled path preserved responsive selection and completed three consecutive strict smokes without unexpected diagnostics. Chromium uses the container's explicit shared-memory mount rather than spilling into the bounded `/tmp` tmpfs; the audit runner has a 512 MiB scratch ceiling for browser profiles and temporary files.

## Bounded Parallelism And Benchmarks

`VISUAL_AUDIT_CAPTURE_WORKERS`, `VISUAL_AUDIT_VALIDATION_WORKERS`, and `VISUAL_AUDIT_REPORT_WORKERS` accept `auto` or a bounded integer. `auto` uses the available CPU parallelism with measured caps of 2 capture workers and 6 validation/report workers. Explicit capture values are limited to 1-6; validation and report values are limited to 1-8. Snapshot-lab capture is always forced to one worker because its mutation states are ordered, although its post-capture validation and report work can remain bounded and parallel.

A disposable live-readonly capture matrix kept the serial mutation-sensitive special stage separate and preserved 310 captures, 27 routes, zero unexpected diagnostics, zero successful unsafe requests, and complete cleanup at each worker count:

| Capture workers | Anonymous seconds | Admin seconds | Serial special seconds | Total capture seconds | Speedup |
|---:|---:|---:|---:|---:|---:|
| 1 | 35.118 | 58.493 | 45.192 | 138.803 | 1.00x |
| 2 | 18.496 | 31.121 | 45.234 | 94.851 | 1.46x |
| 4 | 11.216 | 18.047 | 45.159 | 74.422 | 1.87x |
| 6 | 8.517 | 12.303 | 45.139 | 65.959 | 2.10x |

End-to-end wall time also includes application startup, comparison, report generation, validation, and cleanup; the measured totals were 156.226, 109.242, 90.804, and 80.292 seconds respectively. Two workers remain the automatic capture cap because they materially reduce route capture time without imposing the four- or six-browser peak load on the NAS. After replacing resize-based full-page screenshots with tiled capture, three consecutive two-worker smokes completed in stable 104.750-105.029 second capture-stage totals. Each produced 310 captures, 39 tile manifests, 689 checksums, zero unexpected diagnostics, zero successful unsafe requests, 29 blocked unsafe requests, zero cross-origin requests, no temporary files, and zero residual containers or volumes.

The validator reads decoded pixel channels as a sequential stream and computes the same sample standard deviation used by Sharp without materializing full raw images or asking libvips for random-access statistics. This prevents large full-page PNG validation from spilling temporary images into the bounded scratch filesystem. Decode dimensions, blank-image thresholds, checksums, diagnostics, seam checks, and canonical output ordering remain unchanged.

A corrected full-clone benchmark over 37,957 checksummed artifacts produced the same 23 pre-existing validation failures, two diagnostics, semantic digest `2d20c9c564fc4dae4e468936aa5a054f7f2326a8613aaf3af6084e53fc080d74`, validation hash, and checksum hashes at every worker count:

| Validation workers | Artifact seconds | Total seconds | Speedup | CPU seconds | Peak container bytes |
|---:|---:|---:|---:|---:|---:|
| 1 | 1350.314 | 1359.808 | 1.00x | 1840.969 | 1,360,478,208 |
| 4 | 429.744 | 437.022 | 3.11x | 1776.173 | 2,195,255,296 |
| 6 | 342.494 | 348.317 | 3.90x | 2112.510 | 2,603,417,600 |
| 8 | 322.335 | 328.050 | 4.15x | 2635.124 | 3,154,866,176 |

Eight workers improved total time by only 5.8 percent over six while consuming about 24.7 percent more CPU time and 21.2 percent more peak memory, so six is the automatic validation/report cap. Six simultaneous report-slice tasks converted 156 slices from six 1170 x 39996 sources in 8.502 seconds under the production 512 MiB tmpfs, and a repeated run produced identical slice hashes.

The validator benchmark utility operates only on a disposable clone of a retained output volume and removes that clone in `finally`:

```powershell
visual-audit/scripts/benchmark-validator-volume.ps1 `
  -SourceVolume <retained-read-only-output-volume> `
  -RunId <full-run-id> `
  -Workers 6 `
  -AuditImage woodsmith-visual-audit:<exact-sha> `
  -TargetCommit <full-40-character-sha>
```

Do not increase worker counts blindly. Re-run the matrix against representative full-run evidence after changing the capture matrix, image sizes, NAS CPU/memory limits, Sharp, libvips, Playwright, or report selection logic.

## Accelerator Contract And GPU Evidence

`VISUAL_AUDIT_ACCELERATOR` accepts only `auto`, `cpu`, or `cuda`:

- `auto` probes `nvidia-smi` with a three-second bound and selects CUDA only for stages that this build explicitly marks benchmark-verified.
- `cpu` forces the portable canonical pipeline even when a device is visible.
- `cuda` fails before capture when no CUDA device is visible or when this build has no deterministic benchmark-verified CUDA stage. It never falls through while claiming acceleration.

The restricted manifest records the requested and selected mode, bounded CUDA-device facts, the Chromium renderer reported by `SystemInfo.getInfo`, and one backend decision for each browser, PNG, resize/print, tile/seam, hash/redaction, and PDF phase. The redacted manifest retains the mode and stage decisions but omits device identity. Resume refuses to combine output produced under different accelerator provenance. Archive schema version 5 also records the evidence tier, protected mounted-media aggregates, hashed rendered-source observations, and placeholder evidence. It is intentionally incompatible with older incomplete manifests.

The 2026-07-17 workstation probe used Docker Engine 29.6.1, BuildKit 0.31.1, an RTX 3070 Ti Laptop GPU with 8,192 MiB, driver 573.91, CUDA compatibility 12.8, and compute capability 8.6. A minimal isolated container successfully loaded `libcuda.so.1` and enumerated one device. That proves device access, not an accelerated audit stage.

Three browser launches per candidate used the pinned Playwright image, `linux/amd64`, `--gpus all`, no network, a four-GiB memory limit, twelve CPUs, and the deterministic 1440 x 900 benchmark surface:

| Candidate | CDP renderer | Warm total seconds | Pixel result | Decision |
|---|---|---:|---|---|
| Canonical | ANGLE SwiftShader | 0.257-0.280 | Stable `a38cf990...` | Retain |
| Explicit SwiftShader GPU flags | ANGLE SwiftShader | 0.571-0.579 | Different `1b150fc8...` | Reject: slower and noncanonical |
| CUDA/Vulkan flags | ANGLE SwiftShader | 0.290-0.295 | Canonical | Reject: hardware backend unavailable |
| CUDA/GL flags | ANGLE SwiftShader | 0.263-0.281 | Canonical | Reject: hardware backend unavailable |

NVIDIA nvImageCodec 0.9.0.20 was evaluated separately against all 299 retained PNGs (24,768,208 encoded bytes; 288 RGB and 11 RGBA). `CPU_ONLY` with `I_UNCHANGED` reproduced every Sharp raw-pixel hash, including alpha. `GPU_ONLY`, `HYBRID_CPU_GPU`, and `HW_GPU_ONLY` could not create a PNG decoder. The default decoder used the CPU PNG plugin and copied its result to device memory; that is transfer overhead, not GPU decode. The 32.1-MiB wheel and temporary 399-MiB benchmark image are not production dependencies.

The reproducible three-pass phase profiler preserved the same semantic digest on every pass and removed its scratch root in `finally`:

| Phase | Cold seconds | Warm seconds |
|---|---:|---:|
| Directory inventory | 0.012 | 0.008 |
| Streaming SHA-256 | 0.058 | 0.042-0.049 |
| PNG metadata | 0.031 | 0.027-0.029 |
| PNG decode and blankness | 4.442 | 3.215-3.235 |
| PNG thumbnail resize/encode | 0.542 | 0.527-0.531 |
| Seam resize/difference (64 pairs) | 0.293 | 0.283-0.301 |
| Tile composite/PNG (16 tiles) | 0.113 | 0.106-0.108 |
| Print resize/JPEG (12 files) | 0.365 | 0.356-0.357 |
| Redacted copy/hash (64 files) | 0.031 | 0.022-0.024 |
| JSON manifest | 0.001 | 0.001 |
| PDF atlas (12 image pages) | 0.058 | 0.014 |

The decode/blankness phase is the only material post-processing hotspot in this representative corpus, and the tested NVIDIA library provides no PNG GPU backend. NPP resize/composite would not preserve Sharp/libvips interpolation, blend, PNG, and JPEG byte semantics without a separately maintained native implementation; the measured resize/composite phases are also subsecond. Hashing, JSON, copy/redaction, and PDF assembly are I/O or serial metadata/document work rather than suitable GPU kernels. The current zero-stage CUDA allowlist is therefore an evidence-based result, not a claim that CUDA was enabled.

Re-run the source-controlled benchmarks after changing Playwright, Chromium, Sharp/libvips, capture sizes, codecs, GPU runtime, or the representative corpus:

```bash
BENCHMARK_RUN_ROOT=/restricted/archive/png \
BENCHMARK_REPEATS=3 \
VISUAL_AUDIT_VALIDATION_WORKERS=6 \
npm --prefix visual-audit run benchmark:phases

docker run --rm --init --gpus all --network none \
  --ipc private --shm-size 1g --memory 4g --cpus 12 \
  -e BENCHMARK_BROWSER_VARIANTS=all \
  -e BENCHMARK_REPEATS=3 \
  --entrypoint node woodsmith-visual-audit:<exact-sha> \
  dist/benchmark-browser-gpu.js
```

The browser procedure follows Chromium's official headless GPU guidance and verifies the actual renderer rather than flags alone. nvImageCodec backend expectations follow NVIDIA's codec documentation. See [Chromium headless GPU guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md), [Docker Desktop GPU support](https://docs.docker.com/desktop/features/gpu/), and [NVIDIA nvImageCodec](https://docs.nvidia.com/cuda/nvimagecodec/).

## Snapshot Lab

Prepare a new isolated lab for every mutation-state run:

```bash
cd /volume2/docker_ssd/woodsmith
visual-audit/scripts/prepare-snapshot-lab.sh
visual-audit/scripts/run-snapshot-lab.sh
```

Preparation performs an online SQLite backup with `VACUUM INTO`, verifies `PRAGMA quick_check`, copies the database into a unique lab root, and creates a Btrfs reflink media copy when supported. If reflinks are unavailable, it performs a full `rsync -a` copy. Hardlinks are forbidden because lab rename/delete operations must not alter production originals.

Preparation writes the ignored lab environment with `AUDIT_EVIDENCE_TIER=tier-2-production-clone` and `AUDIT_MEDIA_PROVENANCE=production-clone`. The runner refuses a mismatch before starting Compose.

Preparation also resolves `woodsmith:candidate-<short-sha>` and `woodsmith-visual-audit:candidate-<short-sha>` by default, requires both images to be `linux/amd64`, and requires the application image to report the exact full Git commit through `WOODSMITH_BUILD_SHA`. Override `WOODSMITH_AUDIT_APP_IMAGE` or `WOODSMITH_VISUAL_AUDIT_IMAGE` only with another exact, prevalidated tag. The operational scripts use direct Docker access when available and otherwise use Synology's noninteractive `/usr/local/bin/docker` through `sudo -n`; only an explicit nonsecret Compose-selector allowlist crosses that `sudo` boundary. Passwords and tokens remain restricted files or env-file inputs. The scripts never silently substitute a source rebuild.

Both lab mounts contain a matching run marker. The runner rejects missing markers, production paths, mismatched run IDs, and unavailable clones. The lab container health check verifies the cloned database before capture begins. The internal Docker network blocks outbound provider access.

The runner creates the restricted `visual-audits/` root before Compose starts and uses a dedicated `woodsmith-visual-audit-lab` Compose project. Live runs use `woodsmith-visual-audit-live`. This keeps archive networks and lifecycle cleanup separate from the production Compose project.

The Compose files assign the private audit and image-cache tmpfs mounts to the configured `PUID:PGID`. Keep those values aligned with the container user; a root-owned mode-700 tmpfs prevents the non-root app or runner from writing its disposable cache.

The lab archive performs one bounded commission-draft save, reads the saved record back, captures the visible saved state, and deletes the draft before continuing. Validation requires exactly those two successful unsafe responses and the saved-state capture. Form error-state capture uses browser-native constraint validation without submitting, and synthetic `/api/visits` telemetry is blocked so the archive does not create visitor sessions. These mutations run only in `snapshot-lab`; `live-readonly` continues to reject every capture-time unsafe request.

Do not run `docker compose down -v`; the scripts use ordinary `down` and preserve bind-mounted evidence for review.

## Artifacts

Each restricted run directory uses mode 700 and contains mode-600 files:

```text
visual-audits/<run-id>/
  coverage-plan.json
  manifest.json
  live-media.json
  placeholder-report.json
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
- evidence-tier, target-mode, or media-provenance mismatch;
- missing public mounted files, synthetic markers in production tiers, or no anonymous mounted-media observation;
- visible media load failures or unapproved visible placeholders;
- media/placeholder report content that does not exactly reproduce from the final manifest;
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
