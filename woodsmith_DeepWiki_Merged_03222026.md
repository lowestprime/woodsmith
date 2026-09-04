# Beaman Woodworks Architecture Reference

This document replaces the earlier Woodsmith DeepWiki export with the current Beaman Woodworks 3.0 architecture.

## Overview

Beaman Woodworks is a self-hosted Next.js 16.3 application with a SQLite-backed content and operations layer. It is designed to run on a Synology NAS and keep portfolio, shop, process writing, contact-first custom work intake, project tracking, media management, commerce operations, and private Woodshop administration inside one deployment.

## Stack

- Next.js 16.3 App Router
- React 19
- Node `node:sqlite` via `DatabaseSync`
- Local ITC New Rennie Mackintosh font assets
- Plain CSS with CSS custom properties and theme tokens
- Nodemailer for SMTP delivery
- Stripe API for hosted checkout and invoice generation
- EasyPost API for shipment creation
- Dynamically isolated React Three Fiber/Three.js conceptual proportional preview with deterministic SVG and textual fallbacks
- Optional OpenAI Image API and Embeddings API integration, disabled unless `OPENAI_API_KEY` and feature flags are configured server-side

## Core application areas

### Public site

Routes under `site/app/` provide:

- home page
- dynamically categorized portfolio index and piece detail pages
- shop index and cart
- process index and individual process notes
- custom work contact page and project-status lookup
- about page and editable custom pages
- search page

`/journal` and `/journal/[slug]` are legacy redirects to Process.

### Buyer account and project access

The account system supports signup, login, password reset, profile updates, profile image upload, and account-linked project listing.

Project trackers live at `/requests/[reference]`. Access is allowed only when the viewer is an administrator, is signed in with the linked account email, or holds an unexpired per-project capability cookie. The `/commissions/status` POST form exchanges a matching reference and buyer email for that `HttpOnly`, same-site cookie; buyer email is never accepted in a project URL.

### Private Woodshop dashboard

`/studio` remains the private route name, but the product language is Woodshop dashboard. The dashboard opens on an overview workspace, exposes focused workspace tabs, and exposes structured browser forms for:

- site settings
- pages
- portfolio and shop pieces
- portfolio category labels, matching rules, icons, and safe reassignment
- custom work types
- users and public profiles
- process notes
- durable typed autosave for media metadata and existing source-folder rules, visual crop controls, optional AI-cleaned copies, visual labels, a manual verification queue, transactional media operations, and Cancel-first file deletion
- projects and timeline updates
- orders, invoices, shipping labels, and tracking state
- reviews
- queued notifications
- privacy-preserving visitor aggregates, retention policy, country map/list, and pseudonym cohorts
- filtered, paginated, redacted administrative audit detail and export
- buyer email verification at `/account/verify`
- visitor-session logging endpoint at `/api/visits`

Admins signed into the public site get pencil controls on supported sections. Mapped text and link destinations save through `/api/studio/inline-edit` without a route change or full-page reload. A typed registry is the single server allowlist for text, rich text, URL, email, number, currency, boolean, date, enum, list, link-list, relation, and media-relation fields. Requests require admin authentication and a trusted same-origin mutation request; each batch validates before one SQLite transaction, detects stale expected values, writes an admin audit record, and returns reversible patches for one-step Undo. Structural changes use the explicit visual full-editor link; no raw JSON editor is exposed.

## Database model

The SQLite schema includes these primary tables:

- `settings`
- `users`
- `sessions`
- `pages`
- `pieces`
- `posts`
- `commission_types`
- `media_items`
- `projects`
- `project_updates`
- `cart_items`
- `orders`
- `reviews`
- `notifications`
- `schema_migrations`
- `notification_policies`
- `notification_templates`
- `notification_deliveries`
- `notification_delivery_attempts`
- `visitor_sessions`
- `visitor_pageviews`
- `visitor_analytics_policy`
- `smtp_verification_checks`
- `project_lifecycle_events`
- `project_deletion_ledger`
- `piece_media_links`
- `admin_edit_audit`
- `media_rename_history`
- `media_operation_batches`
- `media_operation_items`
- `commission_drafts`
- `commission_submissions`
- `project_access_grants`
- `commission_render_usage`
- `commission_render_assets`
- `commission_submission_usage`

Seeds from `site/lib/seed.ts` initialize site settings, profile records, pages, pieces, custom work types, and process notes. Existing databases are upgraded through seed v6 without deleting runtime orders, projects, users, media metadata, dashboard edits, or deletion tombstones. Seed v3 and later migrations are non-destructive for existing Studio-edited content; they normalize legacy developer-email references, replace only exact stale seed wording, and remove the obsolete public Process navigation entry.

The source additive migration ledger applies through schema version 15. Versions 9-11 normalize notification/lifecycle records, version 12 minimizes visitor/audit data, and version 13 installs synchronized FTS5 search. Version 14 normalizes exact legacy public copy with history while preserving custom content. Version 15 inserts missing operator correspondence policies/templates and adds transactional account-link recipient provenance. Legacy notification history is preserved; queued old authentication links without recipient proof cannot be retried to potentially incorrect destinations and require a fresh request.

`notification-routing.ts` is the shared pure address/recipient resolver. The typed Notifications Overview editor saves the existing `site.email.forwardTo` with explicit clear, expected-version conflict handling and audit provenance. Global/category/event BCC is deduplicated and excludes To/CC. Authentication-link delivery ignores all copies and configured-recipient overrides. Operator inquiry/reply/review notices use independent templates and durable queues; replies/reviews/order requests commit their queue entries atomically. See [notification routing](docs/notification-routing.md). Production remains at the accepted v19 boundary until the post-v19 release gates pass.

Projects retain active/archived/cancelled lifecycle state, assignment and target dates, completion/archive/cancellation timestamps, and cancellation reason. Lifecycle transitions and dependency-aware deletion previews/refusals/deletions are separately audited; media quarantine prevents a hard-delete request from silently destroying referenced files.

User records keep buyer email-verification state in dedicated `email_verified`, `verification_token`, and `verification_expires_at` columns. Visitor telemetry uses purpose-separated HMAC visitor/session pseudonyms plus a public `pseudonym_key_id`; new records persist only minimized host/path, country/optional city-region, optional referrer host, and device class data. Raw IP addresses, full user-agent strings, complete referrer URLs, Cloudflare ray IDs, and precise coordinates are not stored. The dashboard renders aggregate trends, an accessible world map/list, recent sessions, retention controls, and key-cohort labels without a third-party analytics dependency. Visitor-session email is separately policy-controlled and disabled by default.

## Media system

The master media library lives outside the app bundle and outside `docker_ssd`. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`. The repo-local `pics/` folder is legacy/ignored and is not the source of truth; `MEDIA_ROOT` defaults to `/app/pics` and media scans return an empty library instead of creating a repo-local fallback when the mount is absent. The application:

- indexes that library into `media_items`
- serves files through `/media/[...slug]`
- prevents path traversal in the media route
- filters Synology and OS sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and `._*`
- stores alt text, clustering, associations, focal data, zoom, cleanup mode, visual labels, source credit, display order, review state, and tags in SQLite
- can upload, rename, delete, and assign files in the mounted media root
- can apply collision-checked selected-item folder/name/tag/quality/assignment/role/stage/visibility changes with SQLite snapshots, reverse-order filesystem compensation, normalized/legacy reference synchronization, and guarded rollback
- synchronizes reviewed piece assignments with public piece galleries while keeping unreviewed assignments private
- can create unpublished source-linked cleanup derivatives under `derivatives/background-cleanup/` when the optional OpenAI cleanup feature is configured; originals are never overwritten and derivative chaining is rejected

Media automation is provider-agnostic and local-first. `tools/media-ai-sidecar/` scans the configured library, excludes Synology/hidden sidecars, stores SHA-256 and perceptual hashes plus generated 768px review thumbnails outside the source tree, computes true image-pixel and text embeddings in a shared SentenceTransformers CLIP space, applies deterministic visual clustering, and can use Ollama or Gemini only for ambiguity arbitration. Bounded guided trainer runs resume changed or uncached files, heavy work is serialized, and partial cluster updates preserve unrelated cluster state. The compact media desk exposes Organize selected, Train selected, Improve page, and Continue library as the primary workflows, with raw scan/analyze/embed/cluster/rank/dry-run controls kept under Advanced actions. The status card shows provider/cache/training totals; AI-state filters, evidence and margin breakdowns, rejection memory, and J/K/F/P/U/R/I/E/C/S/Shift+S/A keyboard controls remain available.

The sidecar accelerator state is explicit `auto|cpu|cuda`. It probes the real PyTorch runtime, binds SentenceTransformer to the selected device, bounds batch size and allocator memory, serializes each process, and uses a cross-process file lease containing PID/action/start metadata for CUDA-heavy work. Automatic CUDA runtime/OOM failure clears CUDA model state and retries the failed inference batch on CPU; forced CUDA fails closed. Authenticated health exposes actual versions/device/memory, active and last work, lease ownership, and indexed-cache-only pending embedding/analysis/cluster counts without walking the full media tree. The validated Windows benchmark found a material, semantically equivalent CUDA benefit for CLIP inference; the independent visual archive remains CPU/SwiftShader, so they do not currently contend for the RTX GPU.

Runtime recovery is paired rather than database-only. The production image includes `/app/site/ops/runtime-state.mjs`, which creates an online-consistent SQLite snapshot, copies and hashes the matching media tree, optionally protects a copy of `.env`, rejects symlinks and changing sources, and writes an exact manifest. Verification checks every hash, rejects missing or extra files, and runs SQLite `quick_check`; restore refuses existing targets and writes only to new staging paths before an explicit stopped-service swap.

SQLite media metadata stores analysis schema/provider/model/time, object/class/context/stage, tags and alt draft, candidate confidence/evidence, uncertainty, unsafe reason, embedding provider/model/version/hash/time, cluster ID/representative/score/label, human-review reason, accepted training labels, and rejected training labels. Existing media fields and source-folder rules use optimistic, replay-safe typed autosave with monotonic record versions and one redacted audit row per operation. Piece assignment compatibility fields and normalized links synchronize in the same transaction without a nested duplicate audit. The ranker combines visual similarity, VLM candidate confidence, lexical overlap, verified cluster propagation, folder context, and manual priors, then subtracts negative reviewer signals. It requires a configurable minimum score and runner-up margin. Context/detail/ambiguous or reviewer-rejected matches are not proposed. Manual reviewed assignment plus accurate alt text remains the only public publishing gate; folder-rule application and AI suggestions remain explicit.

## Commerce and operations

The commerce layer supports inventory items in the shop, asking-price presentation, cart totals, coupon handling, tax estimate, pickup/delivery/shipping labels, Stripe Checkout Session creation, Stripe invoice creation from the dashboard, and EasyPost label requests from the dashboard.

Payment capture, invoice delivery, shipping labels, and outbound email degrade safely when provider environment variables are missing. SMTP success requires acceptance of the primary recipient; transport failures are surfaced to the verification UI.

## Custom work workflow

The public custom work route is a ten-step guided request covering intent, category, room/use, dimensions, materials, private reference files, conceptual preview, fulfillment, contact identity, and final review. Every browser gets local autosave. Verified accounts additionally get optimistic, serialized server drafts with 30-day expiry and cross-browser recovery. The server treats browser totals and lead times as advisory, recalculates the estimator from normalized dimensions/options plus the live queue, and stores the exact submitted options separately.

Submission uses a client-generated idempotency key backed by `commission_submissions`, a honeypot, and hashed owner-window quotas. Allowlisted images are staged before the database insert, moved into `projects/<reference>/references/` after creation, and rolled back with the project/idempotency row if finalization fails. Project status access uses expiring opaque capability cookies rather than email query parameters.

Custom work type records still store default dimensions, material options, labor hours, and markup settings so the woodshop can maintain estimator context and future richer intake flows.

`site/components/visualizer.tsx` dynamically loads `site/components/commission-scene.tsx` only on the custom-work route. The React Three Fiber scene supports category-specific and generic templates, exact submitted dimensions, material cues, perspective/orthographic cameras, front/side/top/isometric presets, orbit/zoom/reset controls, and demand rendering. A deterministic SVG drawing and textual dimensions remain available for printing, submission, reduced motion, and WebGL failure. When `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured, `/api/render-preview` can generate a photorealistic conceptual image, persist it under `/app/pics`, and attach it only once when the submitting owner explicitly includes it. Render and submission quotas store only hashed owner keys.

## Visual archive and rendered QA

`visual-audit/` is an independent TypeScript package pinned to Playwright 1.61.0, Sharp 0.35.3, and PDFKit 0.19.1. It reconciles source routes, a token-and-admin-protected bounded database inventory, and rendered same-origin links. Schema-v5 manifests identify Tier 1 synthetic, Tier 2 production-clone, or Tier 3 live-production evidence. Protected inventory schema 3 adds stable query-addressable routes for the search-index workspace, Projects editor, and all Notifications subviews, plus each eligible clone-only mutation state. The inventory exposes public-media counts and SHA-256 fingerprints but no paths; route evidence hashes direct and Next-optimized mounted sources. Deterministic `live-media.json` and `placeholder-report.json` files fail production tiers for provenance mismatch, missing public media, synthetic markers, absent anonymous mounted-media observations, load failures, or unapproved visible placeholders. `live-readonly` blocks unsafe browser requests and adds a server read-only header; `snapshot-lab` uses a verified SQLite/media clone on an internal Docker network with external providers disabled. It round-trips and restores notification, template, visitor and optional Project fields, exercises both search-index operations, and removes its commission draft. Expected states and successful-write counts are derived from protected inventory, so an unrelated successful write fails validation. Diagnostic exceptions require exact mutation-policy, same-origin RSC/prefetch evidence, a successful response already observed for the exact clone mutation request, or a safe visual request canceled only after deliberate post-drain page teardown rather than matching generic browser error text. Diagnostics retain their active capture phase.

The runner captures the complete desktop/tablet/mobile/theme matrix plus a 5120 x 2880 archival viewport on canonical source/database routes, and uses recorded desktop/tablet/mobile theme representatives plus archival desktop for rendered link variants. Canonical archival-dark states cover keyboard skip-link focus/activation, dialogs, disclosures, lightboxes, Studio/media/inline editing, visualizer boundaries, overlapping raw tiles and stitched surfaces, and the element atlas. Every full-page capture uses viewport tiling rather than geometry-changing browser full-page mode, so responsive image selection stays stable and every page has raw tiles, a stitch manifest, and seam validation. The restricted PNG tree and searchable HTML retain every capture. A deterministic per-route selection manifest bounds the streamed bookmarked PDF and redacted shareable editions without deleting raw evidence. Capture, validation, and report stages use deterministic bounded worker pools; snapshot-lab capture remains serial, while full-image blankness validation streams decoded channels in constant memory. Corrected capture and full-clone validation worker matrices established automatic caps of two capture workers and six validation/report workers. The Windows disposable harness validates either strict live-readonly behavior or the bounded snapshot-lab mutation flow against an online SQLite clone and separately copied synthetic media, then proves source immutability and full Docker cleanup. SHA-256 manifests, route/network/render diagnostics, tile-seam validation, and baseline comparisons remain release gates. See `docs/visual-archive.md` for the exact safety and operating contract.

## Search

`site/lib/search-index.ts` owns a managed FTS5 index over pages, pieces, Process notes, eligible indexed media metadata, and projects. Source-table insert/update/delete triggers rewrite the matching index document in the same SQLite transaction, including slug/path renames and publication visibility changes. The integrity workspace compares source and indexed keys, detects missing/stale/duplicate rows, runs FTS5's integrity command, and can rebuild only the derived index. Public queries filter to published records; authenticated administrator queries can include private content, media metadata, and projects.

Lexical search is always first and uses Unicode61 tokenization with diacritic handling, two-to-four-character prefix indexes, punctuation-safe query construction, weighted BM25 ranking, and bounded snippets. Empty or punctuation-only input returns no rows rather than an invalid MATCH expression. The browser-assisted visual search reads a reference image locally, derives color/material cues, and converts them into lexical search terms.

`site/lib/search-rerank.ts` may semantically reorder only the first 24 lexical candidates. Candidate vectors must already exist in the embedding cache; request handling never embeds the corpus or writes candidate/query cache rows. At most one query vector is requested, bounded by `SEARCH_SEMANTIC_TIMEOUT_MS` (clamped to 100-2500 ms). Disabled providers, missing candidate vectors, sidecar errors, and timeouts leave the lexical result set unchanged. The search page streams the lexical result boundary while optional enrichment resolves, so semantic work never blocks the first useful result.

## Theme and UI

The active design language is based on the Beaman Woodworks 2.0 prototypes but updated for the 3.0 client feedback:

- birds-eye maple, ebony, and white-maple palette
- persistent light/day and black OLED night theme toggle whose server cookie and client store hydrate without overwriting the saved choice
- compact header shell that condenses on scroll and hides while scrolling down
- repaired toggle track/thumb alignment and admin-aware account/profile badge resolution
- local Mackintosh typography throughout the site
- rounded controls, compact dense form rhythm, and more legible button language
- an auto-hiding compact header that stays narrow on desktop and reduces to two rows only when viewport width requires it
- categorized portfolio tabs with icon-like labels
- dedicated Process archive replacing Journal without duplicating Process inside Shop
- account button as a rounded profile badge
- route-aware current navigation, a skip-to-main link, high-contrast focus rings, reduced-motion behavior, and header focus clearance
- responsive carousels with announced position and optimized thumbnails; full-size lightboxes retain raw source quality, trap/restore focus, and support bounded keyboard/touch pan, zoom, arrows, reset, close button, backdrop click, and `Esc`
- ETag and Last-Modified revalidation on direct media responses so unchanged originals are not retransferred while same-path updates remain visible after revalidation
- private dashboard media preview cards with crop/focal controls, cleanup modes, project media strips, and verification candidates
- programmatic Beaman Woodworks favicon and header mark

## Known caveats

- SQLite support still relies on Node's experimental `node:sqlite` API.
- The visualizer is a conceptual proportional R3F preview, not fabrication-ready CAD. Optional generated images are also conceptual and provider-dependent.
- Scientist Desk media is intentionally withheld until the correct images are verified.
- Local pixel embeddings require the optional sidecar model dependencies and a sidecar URL reachable from the web container. The manual workflow remains available when it is offline.
- OpenAI-backed rendering and cleaned image copies remain separate explicit feature flags. ChatGPT Plus is not an API credential.
- SMTP, Stripe, and EasyPost functionality remain configuration-dependent.

## Important files

- `site/lib/db.ts`: schema, data access, dashboard summaries, seed upgrade, and search
- `site/lib/actions.ts`: server actions for auth, checkout, content editing, custom work, media, projects, and orders
- `site/lib/seed.ts`: initial content, settings, and v3 content truth
- `site/lib/catalog.ts`: portfolio categories, media display rules, and fulfillment labels
- `site/lib/categories.ts`: persisted category normalization, matching rules, and icon definitions
- `site/lib/media.ts`: media scanning, upload, rename, delete, sidecar filtering, and path resolution
- `site/lib/ai-services.ts` + `site/lib/ai/providers/`: provider registry and local/Ollama/Gemini/OpenAI capability adapters
- `site/lib/media-audit.ts` + `site/lib/media-scoring.ts`: deterministic embedding persistence, clustering, weighted candidate evidence, thresholds, and human-review gating
- `tools/media-ai-sidecar/`: local HTTP service, file/hash cache, CLIP image/text embeddings, structured analysis, clustering, and provider arbitration
- `site/lib/search-index.ts`: FTS5 schema, source synchronization triggers, integrity/rebuild operations, and lexical ranking
- `site/lib/search-rerank.ts` + `site/lib/search.ts`: bounded precomputed-vector reranking and provider fallback around the immediate lexical path
- `site/lib/payments.ts`: Stripe and EasyPost integration
- `site/lib/notification-policy.ts`: typed notification definitions, recipient policy, template validation, retry/retention defaults, and variable allowlists
- `site/lib/notifications.ts`: pooled SMTP transport, normalized delivery queue, idempotency, bounded retry processing, redacted diagnostics, and legacy compatibility
- `site/lib/visitor-privacy.ts`: keyed visitor/session pseudonyms, bot/internal filtering, trusted Cloudflare location parsing, and telemetry minimization
- `site/lib/audit-redaction.ts`: recursive administrative payload redaction shared by migration, detail, and export paths
- `site/components/studio/studio-notifications-admin.tsx`: accessible seven-panel notification, visitor, audit, and SMTP administration shell
- `site/components/studio/studio-visitor-insights.tsx`: aggregate visitor trends, responsive map/list, session pagination, policy, retention, and cohort controls
- `site/components/studio/studio-audit-log.tsx`: paginated filters plus on-demand redacted detail and bounded redacted JSON export
- `site/components/studio/studio-projects-admin.tsx`: compact project master-detail editing, lifecycle transitions, timelines, and guarded dependency-aware deletion
- `site/components/forms.tsx`: public, account, profile, and custom work forms
- `site/components/inline-edit-assistant.tsx`: capture-phase in-place editing and structural-editor handoff
- `site/components/verification-resend-panel.tsx`: email-based verification resend with accurate delivery status
- `site/components/site-chrome.tsx`: header, footer, cards, shared layout pieces, and account badge
- `site/components/header-shell.tsx`: client scroll-state wrapper that compacts and hides the header chrome during downward scrolling
- `site/components/media-picker.tsx`: visual library picker used by page, piece, and process editors
- `site/components/studio-media-workspace.tsx`: compact media-management workspace for `/studio?panel=media`
- `site/components/visitor-tracker.tsx`: minimized client pageview dispatch; aggregation and administrative rendering remain server-side
- `site/components/visualizer.tsx`: route-local R3F conceptual preview orchestration, deterministic SVG/text fallback payloads, optional AI preview trigger, and server-authoritative estimator fields
- `site/components/commission-scene.tsx`: route-local React Three Fiber templates, cameras, lighting, dimensions, and fallback-safe scene controls
- `visual-audit/`: deterministic two-mode visual archive, reports, validation, comparison, NAS scripts, strict benchmark-gated accelerator selection, and recorded per-stage/browser backend provenance
- `docs/visual-archive.md`: visual-archive security and operations manual
- `site/app/icon.tsx`: generated favicon
- `site/app/studio/page.tsx`: private Woodshop dashboard
- `site/app/media/[...slug]/route.ts`: file-backed media serving route
- `docker-compose.synology.yml`: Synology deployment configuration
- `synology-nas-deploy.md`: deployment operations manual

## 2026-09-01 v19 release state

The validated production application is `0067488abb058829f3b94584c02ea666e552c9a8`, running on the NAS as image `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`. Later audit-runner repairs through `686a69c0cc5011394f35add750c29663626990f8` modify only `visual-audit/src`; the application `site` tree remains `60afd107a3b4d6c805497f79dc7cc01aaaeb38c2` at both identities.

Exact Tier 1, production-clone Tier 2, deterministic release packaging, paired backup/staged restore, deployment, route/database/search/SMTP/sidecar checks, forced-recreation persistence, legacy-host retirement, rollback/return-to-candidate, and final live-production Tier 3 passed. The authoritative full Tier-3 run is `tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1`. See [`docs/v19-release-evidence-ledger-20260901.md`](docs/v19-release-evidence-ledger-20260901.md) for exact run IDs, evidence paths, hashes, image IDs, retained diagnostic history, and classified caveats.
# Post-v19 source update (pending release)

The launch branch adds schema v14 audited, exact-match content normalization, location-neutral public defaults, a configured home hero image, a compact contact form separate from the guided commission planner, and a shared progressive scroll rail. Owner-customized persisted values survive normalization. Developer account administration and repository credit remain in technical documentation, not default commercial-page promotion. These are locally validated source changes, not a claim of deployment. Current release gates are tracked in `PLANS.md` and `docs/post-v19-launch-audit-20260902.md`.
