<h1 align="center" id="woodsmith">
  <a href="https://woodmat.ch"><img src="site/app/woodsmith_readme-lockup.svg" alt="woodsmith" width="390"></a>
  <br>
  <a href="https://github.com/lowestprime/woodsmith"><img src="https://img.shields.io/badge/GitHub-lowestprime%2Fwoodsmith-002366?labelColor=000000&logo=github&logoColor=002366" alt="GitHub repository: lowestprime/woodsmith"></a>
  &nbsp;
  <a href="https://woodmat.ch"><img src="https://badgen.net/badge/Live/woodmat.ch/8f592b?labelColor=000000&icon=https://raw.githubusercontent.com/lowestprime/woodsmith/refs/heads/master/site/app/icon.svg" alt="Live website: woodmat.ch"></a>
  &nbsp;
  <a href="https://deepwiki.com/lowestprime/woodsmith"><img src="https://badgen.net/badge/woodsmith/DeepWiki/800000?labelColor=000000&icon=https://freelogovectors.net/svg18/devin-logo-icon-freeloogvectors.net.svg" alt="Woodsmith DeepWiki"></a>
</h1>

Woodsmith is a self-hosted Next.js application for the Beaman Woodworks company website. It combines a public portfolio, shop, process writing, buyer account flow, contact-first custom work intake, project tracking, media library management, and a private Woodshop dashboard in one deployment.

## 📃 Description

- Public portfolio pages backed only by verified or explicitly review-marked media from the NAS photo library mounted at `/app/pics`
- Portfolio category filtering managed through editable labels, matching terms, and icon styles in the Woodshop dashboard
- Shop pages with asking-price language, cart totals, coupon handling, tax estimate, pickup/delivery/shipping labels, and Stripe checkout plumbing
- Process writing under the dedicated `/process` archive, with markdown content and optional source-credit links for outside references
- Contact-first custom work requests with attachments, lead-time context, material preferences, project tracking, and an optional route-local React Three Fiber conceptual scale preview
- Optional server-side OpenAI image-model previews for custom work when `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured; generated previews are stored back into `/app/pics`
- Buyer account pages for signup, login, password reset, profile editing, profile images, and account-linked projects
- Private Woodshop dashboard with focused workspace tabs and typed, conflict-aware autosave for every existing ordinary record field across settings, pages, pieces, categories, custom work types, users, media, process notes, projects, orders, reviews, and notifications
- Admin-only pencil controls backed by a typed field registry, atomic audited saves, conflict detection, URL/origin validation, reset/undo controls, and an explicit visual full-editor link for structural work
- A compact browser media desk with whole-library and AI-state filters, serialized metadata and source-folder-rule autosave, pending-save flush before record changes, explicit candidate/rule approval, guided local training actions, transactional selected-item folder/name/assignment/role/stage changes with rollback, Cancel-first file deletion, crop/focal controls, and source credit against the writable NAS photo library
- Typed notification policies, editable templates, redacted delivery history, bounded retries, retention controls, and authenticated SMTP checks; delivery remains fail-closed until the related environment variables are configured
- Privacy-preserving visitor insights with rotatable keyed pseudonyms, unique-visitor/session/pageview trends, an accessible country map/list, bounded retention and purge controls, and no storage of raw IP addresses, full user-agent strings, complete referrer URLs, or precise coordinates for new visits
- A paginated administrative audit workspace with server-side filters, on-demand redacted detail, and bounded redacted JSON export
- Compact project lifecycle management with autosaved operational fields, buyer-visible timeline updates, explicit status-email dispatch, archive/cancel/reopen controls, and dependency-aware deletion with quarantine and audit records
- Responsive piece carousels with announced position and full-size lightboxes that trap focus, restore the opener, support bounded keyboard/touch pan and zoom, and close through `Esc`, backdrop click, or the visible X control
- FTS5 lexical-first search with BM25 ranking, Unicode-safe prefix matching, and snippets across public content and, for admins, private media metadata, unpublished content, and project records. SQLite triggers synchronize the derived index in the same transaction as content writes. Optional semantic ranking uses only precomputed vectors for the first 24 lexical candidates and falls back to the already-rendered lexical results within 100-2500 ms when its provider is disabled, offline, or slow. Browser-side reference-image analysis remains available for visual search cues.
- Persistent light/day and black OLED night themes using the local ITC New Rennie Mackintosh font assets; the cookie-backed initial theme and client store are synchronized without hydration overwriting the saved choice
- WCAG-oriented skip navigation, current-page navigation state, visible high-contrast focus, reduced-motion handling, compact 24px-or-larger targets, and focus clearance for the auto-hiding header
- Responsive optimized thumbnail requests on portfolio, shop, cart, and carousel surfaces; the raw source remains available in the full-screen viewer and direct media responses use ETag/Last-Modified revalidation
- Programmatic Beaman Woodworks favicon and brand mark
- Safe profile administration for renaming accounts, replacing legacy developer emails, and deleting non-current users from the dashboard
- Compact auto-hide navigation that keeps the public and dashboard workspaces usable on narrow and desktop viewports
- A pinned two-mode Playwright visual archive with protected source/database/link inventory, stable v19 Studio subview coverage, inventory-derived clone-only autosave/search round trips, evidence-based network diagnostics, keyboard skip-link states, read-only production capture, viewport-correct high-resolution tiles, complete restricted searchable HTML, deterministic representative bookmarked PDF/shareable atlases with bounded large-file validation, checksums, baseline comparisons, and strict benchmark-gated CPU/CUDA provenance
- A fail-closed paired recovery tool that creates and verifies an online-consistent SQLite backup, a hashed copy of the mounted media tree, and an optional protected environment-file copy, then restores only to new staging destinations

## 📃 Production Notes

- Persistence uses `node:sqlite`, which emits Node's experimental warning during build and runtime.
- The post-v19 source uses the security-patched Next.js 16.3.4 line. Production remains on the evidence-bound v19 image until the new exact candidate passes recovery, image, runtime, browser, and deployment gates. The additive SQLite migration ledger applies through schema version 13: versions 9-11 add notification policy/delivery records and project lifecycle/deletion ledgers, version 12 adds minimized visitor pageviews/policy data and scrubs legacy raw visitor and audit fields, and version 13 creates and rebuilds the synchronized FTS5 site-search index. Migrations update the mounted database in place and are idempotent.
- Studio overview reports the active `DATA_ROOT`, SQLite `quick_check`, journal mode, and seed version so rebuild-safe persistence can be verified from the browser. Seed upgrades are non-destructive for existing Studio-edited records.
- `/journal` and `/journal/[slug]` now redirect to Process. New public writing should be published as Process notes.
- The public custom work flow is contact-first and includes a credential-free, dynamically loaded React Three Fiber conceptual proportional preview. A deterministic SVG drawing remains available for fallback, printing, and submitted snapshots. Optional photorealistic preview generation is available only when explicitly configured with a server-side OpenAI key and feature flag.
- The public site exposes admin-only edit controls when an admin is signed in. Mapped text and link fields save in place without a page reload; structural changes remain available through the linked `/studio` editor.
- Scientist Desk remains published without photos until the correct black phenolic resin top, birds-eye maple rails, and white maple legs media are verified.
- New piece records can be created without guessed photos. Media should be assigned only after review in the Woodshop dashboard.
- Payment capture, invoice delivery, shipping-label creation, outbound email, image cleanup, photorealistic preview generation, and AI media analysis require their documented runtime configuration before they work live.
- Visitor-session email is an explicit notification type and is disabled by default. Session recording does not imply email delivery; an administrator must deliberately enable the policy and configure its recipients.
- Visitor identity uses purpose-separated HMAC pseudonyms. Configure an independent `VISITOR_HMAC_SECRET`, label it with `VISITOR_HMAC_KEY_ID`, and rotate both together to begin a deliberately unlinkable cohort. `VISITOR_TRACK_INTERNAL=false` excludes local/private traffic by default; the dashboard policy controls collection, city/referrer-host storage, 1-730 day retention, and manual purge.
- SMTP passwords remain environment-only. The dashboard reports configuration and verification state without returning or rendering the password, and notification bodies are fetched only when an administrator opens a delivery detail.
- ChatGPT Plus is not an API backend and does not include OpenAI API usage. The classification workflow is local-first; OpenAI remains an explicitly enabled compatibility option.

## 🖇️ Repository Architecture

- `site/`: the Next.js application
- `tools/media-ai-sidecar/`: optional Python service for local image hashes, pixel embeddings, zero-shot labels, deterministic clusters, and Ollama/Gemini arbitration
- The repo-local `pics/` folder is legacy/ignored and should not be used as the source of truth. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics`, and `MEDIA_ROOT` defaults to `/app/pics` rather than creating a local media folder.
- `design/Beaman_Woodworks_V2_Google_Stitch_Beta/`: Beaman Woodworks 2.0 prototypes audited for layout, theme, and dashboard direction
- `ITC_New_Rennie_Mackintosh_Complete_Family_Pack/`: source font assets for the site typography
- `docker-compose.synology.yml`: Synology runtime model
- `visual-audit/`: pinned Playwright capture, report, comparison, validation, and NAS automation package
- `visual-audit/scripts/run-local-disposable-smoke.ps1`: exact-image Windows live-readonly or clone-only snapshot-lab validation using fake credentials, synthetic media, non-root containers, automatic cleanup, and opt-in retention of a validated full-archive output volume
- `visual-audit/scripts/docker-command.sh`: fail-closed Docker resolution and exact `linux/amd64` image/build-identity checks for Synology archive runs
- `site/scripts/runtime-state.mjs`: backup, verify, and staging-only restore CLI included in the production image at `/app/site/ops/runtime-state.mjs`
- `docs/visual-archive.md`: private live-readonly and snapshot-lab operating guide
- `docs/v19-requirements-traceability.md`: R1-R13 implementation, evidence, Studio mutation classification, and remaining release gates
- `synology-nas-deploy.md`: deployment and NAS operations guide
- `admin.md`: private Woodshop dashboard manual
- `woodsmith_DeepWiki_Merged_03222026.md`: codebase architecture reference

## 💻 Local Development

1. Install dependencies from the repo root with `npm install`.
2. Copy `.env.example` to `.env` and fill the values you intend to use locally.
3. Start the app with `npm run dev`.
4. Open `http://127.0.0.1:3000`.

Root scripts proxy into `site/`:

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run start`

## 🔡 Environment Variables

Use the root `.env.example` as the canonical reference.

Required for a secure deployment:

- `STUDIO_PASSWORD`
- `SESSION_SECRET`
- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `DATA_ROOT` (production: `/app/site/data`)

Required only when the private visual archive is enabled:

- `VISUAL_AUDIT_TOKEN` and optional `VISUAL_AUDIT_MAX_RECORDS`
- `WOODSMITH_MEDIA_PROVENANCE=production-live` for the production app; isolated runners set stricter provenance themselves
- private ignored secret files prepared by `visual-audit/scripts/prepare-live-secrets.sh`

Local-first media AI configuration:

- `AI_PROVIDER`, `AI_ANALYSIS_PROVIDER`, `AI_EMBEDDING_PROVIDER`, `AI_FALLBACK_PROVIDER`
- `LOCAL_AI_SIDECAR_URL`, optional `LOCAL_AI_SIDECAR_TOKEN`, and `LOCAL_EMBEDDING_MODEL`
- `OLLAMA_BASE_URL` and `OLLAMA_VISION_MODEL`
- `ENABLE_AI_MEDIA_ANALYSIS`, `ENABLE_EMBEDDING_SEARCH`, `ENABLE_LOCAL_IMAGE_EMBEDDINGS`, and bounded `SEARCH_SEMANTIC_TIMEOUT_MS` (100-2500 ms; default 2000)
- `MEDIA_AI_MAX_BATCH`, `MEDIA_AI_CONFIDENCE_HIGH`, `MEDIA_AI_CONFIDENCE_MIN`, and `MEDIA_AI_AMBIGUITY_DELTA`
- sidecar-only `MEDIA_AI_MEDIA_ROOT`, `MEDIA_AI_CACHE`, `MEDIA_AI_SIDECAR_TOKEN`, `MEDIA_AI_ACCELERATOR`, `MEDIA_AI_CUDA_DEVICE`, `MEDIA_AI_GPU_MEMORY_LIMIT_MB`, `MEDIA_AI_GPU_LEASE_FILE`, `MEDIA_AI_EMBED_BATCH_SIZE`, `MEDIA_AI_MODEL_LOCAL_ONLY`, `MEDIA_AI_USE_OLLAMA`, `MEDIA_AI_CLUSTER_SIMILARITY`, and `MEDIA_AI_DUPLICATE_HASH_DISTANCE`
- optional `GEMINI_API_KEY`, `GEMINI_VISION_MODEL`, `GEMINI_EMBEDDING_MODEL`, and `ENABLE_GEMINI_FALLBACK`

The sidecar processes bounded resumable batches through the Studio trainer: **Train selected**, **Improve page**, and **Continue library** run scan/analyze/embed/cluster/rank steps in the correct order without requiring the woodshop user to manage those internals. Manual accepted assignments and rejected suggestions are persisted as training labels and influence later rankings; raw Scan/Analyze/Embed/Cluster actions remain available inside the Advanced section for diagnostics. The sidecar writes SHA-256/perceptual hashes, generated 768px review thumbnails, embeddings, analyses, and cluster state only to its configured cache directory outside the mounted photo tree. Its authenticated health response reports actual CPU/CUDA selection, bounded allocator memory, active work and lease ownership, and indexed-cache queue counts. CUDA-heavy work is single-flight and protected by a cross-process lease; automatic CUDA runtime failure retries the failed inference batch on CPU, while forced CUDA fails rather than claiming a fallback.

Required for optional live services:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `EASYPOST_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_NAME`
- `SMTP_FROM_ADDRESS`
- `SHIP_FROM_NAME`
- `SHIP_FROM_STREET1`
- `SHIP_FROM_CITY`
- `SHIP_FROM_STATE`
- `SHIP_FROM_ZIP`
- `SHIP_FROM_COUNTRY`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `OPENAI_IMAGE_QUALITY`
- `OPENAI_EMBEDDING_MODEL`
- `ENABLE_PUBLIC_AI_RENDERING`
- `ENABLE_AI_BACKGROUND_CLEANUP`

See [`tools/media-ai-sidecar/README.md`](tools/media-ai-sidecar/README.md) for Windows/WSL and GPU-host setup. If no sidecar or cloud provider is configured, the complete manual media workflow remains available.

## 🛣️ Main Routes

Public:

- `/`
- `/portfolio`
- `/portfolio/[slug]`
- `/shop`
- `/shop/cart`
- `/process`
- `/process/[slug]`
- `/commissions`
- `/commissions/status`
- `/contact`
- `/care-and-warranty`
- `/about`
- `/search`

Legacy redirects:

- `/journal`
- `/journal/[slug]`

Buyer account and request access:

- `/account/signup`
- `/account/login`
- `/account/forgot`
- `/account/reset`
- `/account/profile`
- `/account/projects`
- `/requests/[reference]`

Custom work uses a ten-step, locally autosaved request flow. Verified accounts also receive resumable server drafts. Submission is idempotent, rate-limited by a hashed owner key, recalculates the estimate and lead time on the server, stages allowlisted private image references safely, and redirects without putting buyer email in the URL. Existing projects are opened through the POST lookup at `/commissions/status`, which issues an expiring `HttpOnly` capability cookie.

Private Woodshop:

- `/studio/login`
- `/studio`

## 🚀 Deployment

The supported deployment target is Synology NAS with Docker Compose and reverse proxy termination. The compose file mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`; do not remount or bind the repo-local `pics/` folder under `docker_ssd`. `MEDIA_ROOT` must be an absolute container path.

`npm run build` uses disposable build-time data and media roots and fails if Next standalone output contains SQLite, WAL/SHM, or backup files. Production state must enter the container only through the writable runtime mounts.

Before deployment or a large media operation, use the paired runtime-state procedure in `synology-nas-deploy.md`. A completed backup is accepted only after its manifest hashes, exact file inventory, and SQLite `quick_check` pass; restore never overwrites the live data, media, or environment paths.

After deploying a build from this branch, the startup migration updates legacy `lowestprime@proton.me` developer references in persisted settings and seeded profile data to `cooperbeaman@proton.me`.

Use these docs together:

- `synology-nas-deploy.md`
- `admin.md`
- `woodsmith_DeepWiki_Merged_03222026.md`
- `docs/visual-archive.md`
- `docs/v19-release-evidence-ledger-20260901.md`

## Current production release

The validated production application is source `0067488abb058829f3b94584c02ea666e552c9a8`, running on the NAS as image `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`. Later audit-runner-only repairs culminate at `686a69c0cc5011394f35add750c29663626990f8`; the application `site` tree is identical at both commits, so no application redeploy was required.

Exact Tier 1, production-clone Tier 2, paired backup/staged restore, deployment, forced-recreation persistence, rollback/return-to-candidate, and final Tier 3 passed. The full live-production run `tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1` validated 1,784 routes, 22,347 observations, and 5,948 captures with zero validation failures, unexpected diagnostics, unapproved cross-origin requests, or successful unsafe requests. See the release evidence ledger for exact paths, hashes, image IDs, and classified caveats.
