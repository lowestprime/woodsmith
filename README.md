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
- Private Woodshop dashboard with focused workspace tabs for editing settings, pages, pieces, custom work types, users, media, process notes, projects, orders, reviews, and notifications through structured browser forms
- Admin-only pencil controls that edit mapped public text and links in place, with an explicit full-editor link for structural work
- A compact browser media desk with whole-library and AI-state filters, in-place paging and edits, explicit candidate review, guided local training actions, training-weighted visual ranking, upload/rename/delete safety, persistent assignment, crop/focal controls, and source credit against the writable NAS photo library
- Email notification queueing, Stripe invoice creation, and EasyPost shipping-label requests when the related environment variables are configured
- Full-size image lightbox support with zoom, pan, arrow navigation, plus `Esc` and close-button exit behavior
- Keyword/metadata search plus visual search across public content and, for admins, private media, visual labels, clusters, unpublished content, and project records. The optional local sidecar supplies shared image/text CLIP vectors; Gemini or OpenAI embeddings remain opt-in alternatives.
- Persistent light/day and black OLED night themes using the local ITC New Rennie Mackintosh font assets
- Programmatic Beaman Woodworks favicon and brand mark
- Safe profile administration for renaming accounts, replacing legacy developer emails, and deleting non-current users from the dashboard
- Compact auto-hide navigation that keeps the public and dashboard workspaces usable on narrow and desktop viewports
- A pinned two-mode Playwright visual archive with protected source/database/link inventory, read-only production capture, isolated snapshot-lab states, overlapping high-resolution tiles, HTML/PDF reports, checksums, and baseline comparisons

## 📃 Production Notes

- Persistence uses `node:sqlite`, which emits Node's experimental warning during build and runtime.
- Studio overview reports the active `DATA_ROOT`, SQLite `quick_check`, journal mode, and seed version so rebuild-safe persistence can be verified from the browser. Seed upgrades are non-destructive for existing Studio-edited records.
- `/journal` and `/journal/[slug]` now redirect to Process. New public writing should be published as Process notes.
- The public custom work flow is contact-first and includes a credential-free, dynamically loaded React Three Fiber conceptual proportional preview. A deterministic SVG drawing remains available for fallback, printing, and submitted snapshots. Optional photorealistic preview generation is available only when explicitly configured with a server-side OpenAI key and feature flag.
- The public site exposes admin-only edit controls when an admin is signed in. Mapped text and link fields save in place without a page reload; structural changes remain available through the linked `/studio` editor.
- Scientist Desk remains published without photos until the correct black phenolic resin top, birds-eye maple rails, and white maple legs media are verified.
- New piece records can be created without guessed photos. Media should be assigned only after review in the Woodshop dashboard.
- Payment capture, invoice delivery, shipping-label creation, outbound email, image cleanup, photorealistic preview generation, and AI media analysis require their documented runtime configuration before they work live.
- ChatGPT Plus is not an API backend and does not include OpenAI API usage. The classification workflow is local-first; OpenAI remains an explicitly enabled compatibility option.

## 🖇️ Repository Architecture

- `site/`: the Next.js application
- `tools/media-ai-sidecar/`: optional Python service for local image hashes, pixel embeddings, zero-shot labels, deterministic clusters, and Ollama/Gemini arbitration
- The repo-local `pics/` folder is legacy/ignored and should not be used as the source of truth. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics`, and `MEDIA_ROOT` defaults to `/app/pics` rather than creating a local media folder.
- `design/Beaman_Woodworks_V2_Google_Stitch_Beta/`: Beaman Woodworks 2.0 prototypes audited for layout, theme, and dashboard direction
- `ITC_New_Rennie_Mackintosh_Complete_Family_Pack/`: source font assets for the site typography
- `docker-compose.synology.yml`: Synology runtime model
- `visual-audit/`: pinned Playwright capture, report, comparison, validation, and NAS automation package
- `docs/visual-archive.md`: private live-readonly and snapshot-lab operating guide
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
- private ignored secret files prepared by `visual-audit/scripts/prepare-live-secrets.sh`

Local-first media AI configuration:

- `AI_PROVIDER`, `AI_ANALYSIS_PROVIDER`, `AI_EMBEDDING_PROVIDER`, `AI_FALLBACK_PROVIDER`
- `LOCAL_AI_SIDECAR_URL`, optional `LOCAL_AI_SIDECAR_TOKEN`, and `LOCAL_EMBEDDING_MODEL`
- `OLLAMA_BASE_URL` and `OLLAMA_VISION_MODEL`
- `ENABLE_AI_MEDIA_ANALYSIS`, `ENABLE_EMBEDDING_SEARCH`, and `ENABLE_LOCAL_IMAGE_EMBEDDINGS`
- `MEDIA_AI_MAX_BATCH`, `MEDIA_AI_CONFIDENCE_HIGH`, `MEDIA_AI_CONFIDENCE_MIN`, and `MEDIA_AI_AMBIGUITY_DELTA`
- sidecar-only `MEDIA_AI_MEDIA_ROOT`, `MEDIA_AI_CACHE`, `MEDIA_AI_SIDECAR_TOKEN`, `MEDIA_AI_USE_OLLAMA`, `MEDIA_AI_CLUSTER_SIMILARITY`, and `MEDIA_AI_DUPLICATE_HASH_DISTANCE`
- optional `GEMINI_API_KEY`, `GEMINI_VISION_MODEL`, `GEMINI_EMBEDDING_MODEL`, and `ENABLE_GEMINI_FALLBACK`

The sidecar processes bounded resumable batches through the Studio trainer: **Train selected**, **Improve page**, and **Continue library** run scan/analyze/embed/cluster/rank steps in the correct order without requiring the woodshop user to manage those internals. Manual accepted assignments and rejected suggestions are persisted as training labels and influence later rankings; raw Scan/Analyze/Embed/Cluster actions remain available inside the Advanced section for diagnostics. The sidecar writes SHA-256/perceptual hashes, generated 768px review thumbnails, embeddings, analyses, and cluster state only to its configured cache directory outside the mounted photo tree.

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

Private Woodshop:

- `/studio/login`
- `/studio`

## 🚀 Deployment

The supported deployment target is Synology NAS with Docker Compose and reverse proxy termination. The compose file mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`; do not remount or bind the repo-local `pics/` folder under `docker_ssd`. `MEDIA_ROOT` must be an absolute container path.

After deploying a build from this branch, the startup migration updates legacy `lowestprime@proton.me` developer references in persisted settings and seeded profile data to `cooperbeaman@proton.me`.

Use these docs together:

- `synology-nas-deploy.md`
- `admin.md`
- `woodsmith_DeepWiki_Merged_03222026.md`
- `docs/visual-archive.md`
