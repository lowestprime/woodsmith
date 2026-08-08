# Beaman Woodworks Private Dashboard Manual

This guide covers the private Woodshop dashboard at `/studio`.

## Login

- Open `/studio/login`.
- Use the admin email `woodsmithbb@proton.me`.
- Use the password stored in `STUDIO_PASSWORD` on the server.
- A successful login creates a secure session cookie and opens the dashboard.

## Dashboard areas

The dashboard opens on an overview workspace and lets you move between focused panels instead of loading every editor at once. Public pages also show admin-only pencil controls while you are signed in. Mapped text and links edit in place; use `Ctrl+S` to save, `Esc` to exit, **Reset unsaved** to restore the value shown when editing opened, or **Undo last save** to reverse the most recent inline batch. **Full editor** opens the matching visual dashboard workspace for structural changes. Inline batches are validated from a typed field registry, saved in one SQLite transaction, checked for concurrent changes, and recorded in the admin edit audit. The site header is intentionally compact and hides while scrolling down; scroll up, focus a header control, or move the pointer over the header area to reveal it again. When focus returns to page content, the header reveals without covering the focused control. The inline URL editor and media browser keep keyboard focus inside their modal surfaces and restore it when closed.

### Site search

The Overview workspace reports the FTS5 site-search index version, indexed/expected document counts, mismatch counts, and latest integrity check. Page, piece, Process, media-metadata, and project changes update the index in the same SQLite transaction as the source record. **Check index** runs SQLite's FTS integrity check and compares every indexed key with its source. **Rebuild index** recreates only the derived search rows, verifies them, and records the operation in the redacted admin audit. Both actions update in place without a document reload or jump to the top.

Public search returns published pages, pieces, and Process notes. Signed-in administrators can additionally find draft/archived content, indexed media metadata, and private project records. Normal results are Unicode-aware BM25 lexical matches with prefixes and snippets. Optional semantic enrichment is limited to the first 24 lexical candidates, reads only precomputed candidate vectors, and never replaces or delays the lexical fallback beyond the configured timeout.

### Settings

The settings editor controls brand copy, homepage wording, contact email addresses, repository URL, tax/shipping defaults, coupon definitions, payment settings, social links, and the revenue model text. Changes save to SQLite and revalidate the live site.

### Pages

The Pages section can create, edit, publish, archive, or delete page records. It now uses a compact record picker with one active editor at a time instead of rendering every page form in a long stack. Built-in public pages include home, portfolio, shop, process, custom work contact, about, and extra pages such as care or warranty. `/journal` is retained only as a redirect path to Process.

Changes save into the mounted SQLite data store, revalidate the matching public routes immediately, and survive rebuilds as long as `site/data/` remains mounted persistently. The Studio overview shows the active data root, SQLite database health, journal mode, and seed version; use that card to confirm edits are going to `/app/site/data` before rebuilding. On the home page record, `intro` feeds the hero copy and `body` feeds the secondary home copy block.

### Portfolio and shop pieces

The Pieces section can add drafts, update titles and descriptions, set category tabs, revise materials and tags, select and order media visually by role, control publication status, manage inventory count, set asking-price data for shop items, and mark whether media has been verified. Raw path entry is not the normal workflow.

The Categories section manages the public portfolio filters. Each category has a stable key, public label, matching terms, and icon style. Categories can be renamed safely; deletion requires that assigned pieces are either absent or reassigned to another category.

Do not guess piece-to-photo identity. If a piece is not verified, leave media unassigned or keep it marked for review. Scientist Desk media must stay withheld until the correct black phenolic resin top, birds-eye maple rails, and white maple legs photos are verified.

### Custom work types

Custom work types define labels, descriptions, default dimensions, base labor hours, markup defaults, and material option lists. These records support the contact workflow and lead-time/estimate context.

### People

The People section can update admin, woodworker, customer, developer, and public profile records. It is the current foundation for future multi-woodworker support, public profile cards, and role-aware dashboard behavior.

It also supports:

- safe email renames that rewrite related project, order, review, session, and post references
- deleting non-current users directly from the dashboard
- protecting the current signed-in admin and the last remaining admin from deletion
- buyer profile editing with uploaded or customizable gradient avatars
- email-verified buyer logins; new customer signups must confirm the verification link before login succeeds

### Process notes

Process notes replace the old Journal surface and remain in the dedicated `/process` archive rather than inside Shop. The editor supports title, excerpt, markdown body, publication state, cover media, tags, and source-credit links for outside references or inspiration.

### Media library

The media section operates against the NAS photo library mounted directly to `/app/pics`:

- upload files into a selected folder
- search all indexed media by path, filename, alt text, tags, metadata, assignment, and project reference
- filter by assignment/review state, media type, high-confidence/ambiguous/detail/unanalyzed/missing-alt/cluster-representative state, choose 24–96 records per page, and retain the view in the URL
- browse a compact thumbnail workspace instead of a long full-page stack of editors
- assign media to a piece, process note, page, or project
- rename files in place
- select up to 96 cards and apply one folder, deterministic name pattern, piece assignment, normalized role/stage/visibility, review state, quality rating, and tag change as a compensated batch
- roll back a recent completed batch when none of its media/link snapshots have been changed afterward
- edit alt text, tags, focal X/Y, zoom, and reviewed status
- use the visual crop editor to set focal point, zoom, crop frame, and crop notes through sliders and form controls
- set cleanup mode, photo quality, source credit, visual search labels, and display order; verified-piece metadata is derived from the reviewed piece assignment
- generate an unpublished cleaned derivative under `derivatives/background-cleanup/` when `OPENAI_API_KEY` and `ENABLE_AI_BACKGROUND_CLEANUP=true` are configured; the source file is never overwritten, derivatives cannot be chained, and manual review remains required
- delete files
- refresh the indexed library
- select one or more cards and run **Train selected**, **Improve page**, or **Continue library** without choosing individual scan/analyze/embed/cluster steps
- inspect provider/model status, visual/VLM/text/cluster evidence, runner-up margin, ambiguity, and persisted review reasons
- copy an AI alt-text draft or merge AI tags into the editable fields without auto-approving them
- reject a wrong piece suggestion so it becomes a negative training label for future rankings

The desk keeps one active inspector beside the thumbnail browser on desktop; phones use a fixed-height Tools / Library / Inspector switcher to avoid stacking three long panes. Routine saves, assignments, renames, uploads, and deletes update in place without reloading the Studio route. `J`/`K` move between visible records, `F` focuses whole-library search, `P` focuses piece assignment, `U` clears the assignment, `R` toggles review state, `I` analyzes, `E` embeds, `C` inspects the current cluster, `S` saves, `Shift+S` saves and advances, and `A` approves and advances. Assignment changes update both media metadata and the affected piece galleries; unreviewed media stays private until approved. Reviewed assignments, reviewer rejections, verified cluster neighbors, and same-folder review history are saved as training evidence and weighted into later candidate rankings.

The **Organize selected** panel uses `{name}`, `{index}`, and `{folder}` rename tokens. Every batch is preflighted for collisions, limited to 96 records, recorded in `media_operation_batches` / `media_operation_items`, and applied with one SQLite reference transaction after the filesystem moves succeed. If a move or database update fails, completed moves are reversed. Rollback performs the same checks in reverse and stops rather than overwriting a media record or normalized link changed after the original batch. Back up `site/data/` and the mounted photo tree together before large production reorganizations.

Synology sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, AppleDouble `._*`, `@eaDir`, and `SYNOFILE_THUMB*` files are filtered during indexing and querying. Manual media assignments take priority over heuristic clustering. The verification queue offers at most one sufficiently separated best-piece proposal per unassigned image; ambiguous matches remain in the library for manual review. Inspecting a candidate never assigns it.

### Media automation providers

The normal automation surface is **Guided media trainer**. Use **Train selected** for hand-picked records, **Improve page** for the current filtered page, and **Continue library** for the next uncached batch. The card shows the active local provider, cache counts, indexed media, accepted/rejected training labels, analyzed files, vectors, and clusters in one place. **Preview only** performs a dry run without saving AI evidence; it is off by default because normal runs still cannot assign, approve, or publish media.

Advanced actions expose **Rescan files**, **Analyze page**, **Analyze selected**, **Embed page**, **Embed selected**, **Cluster page**, **Rank matches**, and **Preview page run** for diagnostics. The underlying API still supports status, scan, analyze, embed, cluster, match, full, cancel, and dry-run. Work is synchronous and bounded by `MEDIA_AI_MAX_BATCH`; no fake background job is presented. **Continue library** resumes with uncached work, while **Include reviewed media** is an explicit opt-in for page/library batches. Direct per-image Analyze/Embed actions remain intentional reprocessing actions even when that record is already reviewed.

- `local-sidecar` is the default bulk path. It hashes source files, computes perceptual hashes and true image-pixel CLIP embeddings, caches outside `/app/pics`, and can run entirely on the Windows/WSL laptop or another GPU host.
- Ollama is an optional local vision classifier for ambiguous images or explicit re-analysis. It is not called blindly for every near-duplicate.
- Gemini 3.1 Flash-Lite and Gemini Embedding 2 are optional fallback/cloud-quality paths. Google quotas, pricing, and data terms apply and can change by project.
- OpenAI remains backwards compatible only when explicitly selected and configured. ChatGPT Plus is a separate product and cannot authenticate this API.

Every cache record includes provider, model, version, source hash, and timestamp. Changing embedding model/provider creates a separate vector space and requires re-embedding. The local cache also holds generated 768px review thumbnails outside the source photo library. Cluster IDs and membership are persisted to media metadata, and partial cluster runs update only their selected paths instead of deleting unrelated cluster state. A cluster can inform ranking, but only manually reviewed labels provide the strongest propagation prior. Reviewer-rejected candidates and contradicted same-folder examples suppress later suggestions. The public gate still requires `reviewed=true`, accurate alt text, and an explicit save/assign action.

The authenticated sidecar health response reports whether work is active, the last action/outcome, actual CPU or CUDA selection, bounded PyTorch allocator memory, the cross-process GPU lease owner, and pending embedding/analysis/cluster counts. Those queue counts are intentionally `indexed-cache-only`; use **Continue library** to discover and advance uncached files rather than interpreting health as a recursive count of the complete NAS tree. The cache makes completed batches resumable after a process restart, but an active synchronous request stops with the process.

On the validated Windows GPU host, `MEDIA_AI_ACCELERATOR=auto` selects CUDA only when PyTorch exposes a usable device. A representative twelve-image benchmark measured a 0.488176-second CPU median and 0.129774-second CUDA median (about 3.76x faster), with identical eight-label rankings, maximum score drift 0.000105856, and 670 MiB peak reserved VRAM. The visual archive remains CPU/SwiftShader because no deterministic beneficial GPU stage qualified there. Do not run a future CUDA audit and sidecar training concurrently until both use the same operator-controlled maintenance window and shared host lease. `tools/media-ai-sidecar/scripts/probe-sidecar.ps1` verifies health and wrong-token rejection without displaying the configured token.

The same visual picker is now used in Pages, Pieces, and Process editors, so cover images and piece galleries can be selected directly from the mounted library without typing raw paths.

Public piece and shop cards request responsive optimized thumbnails rather than each raw original. Opening a piece image still loads the source-resolution media in the full-screen viewer. Carousel arrows update an announced position; the viewer supports plus/minus/reset controls, bounded drag or arrow-key panning while zoomed, `Esc`, backdrop click, and the fixed X close control.

### Visitor map

Open **Notifications → Visitors** for privacy-preserving aggregate analytics. The workspace shows unique visitors, sessions, and pageviews; a paginated trend; an accessible country map and equivalent text list; recent minimized sessions; and the active pseudonym-key cohorts. The map is responsive in both themes and never replaces the text alternative.

- visitor-session email is represented by a dedicated notification policy and is disabled by default; session recording alone does not send mail
- enabling that policy is an explicit administrative action and still requires a working SMTP configuration and recipient policy
- country detail uses Cloudflare's `CF-IPCountry` header when available
- city, region, latitude, and longitude require Cloudflare visitor-location headers to be enabled
- precise coordinates are parsed only transiently from trusted Cloudflare headers and discarded before persistence; the map uses the retained country code
- new records do not store raw IP addresses, full user-agent strings, complete referrer URLs, Cloudflare ray IDs, or precise coordinates
- visitor and session identities are separate keyed HMAC pseudonyms; set `VISITOR_HMAC_SECRET` independently from `SESSION_SECRET`, label it with `VISITOR_HMAC_KEY_ID`, and rotate both together to start a new unlinkable cohort
- `VISITOR_TRACK_INTERNAL=false` excludes local/private traffic, and common automated clients are ignored
- if Cloudflare location headers are not present, the dashboard still records the minimized host/path/session data but shows unknown location data

Use the policy form to enable or pause recording, retain or omit city and referrer-host fields, and choose a retention period from 1 to 730 days. The retained **Save** button is an explicit flush for the same in-place autosave queue; saving must not navigate, reset scroll, or create a duplicate audit entry. **Purge expired records** removes only sessions/pageviews older than the configured cutoff and records the administrative action.

### Audit log

Open **Notifications → Audit** to inspect administrative changes without exposing private values. Filter by operation, entity type, or search text; page through bounded summaries; open details only when needed; and export a maximum of 500 matching records as redacted JSON. Secrets, passwords, tokens, cookies, authorization values, raw visitor identifiers, private contact fields, and equivalent nested values remain redacted both on screen and in exports. Opening or exporting the log is itself auditable.

### Projects

Projects use a compact master-detail workspace. Status, stage, public notes, internal notes, lead time, assignee, and target dates autosave in place; the retained **Save** control is a manual flush for operators who prefer an explicit checkpoint. Timeline entries are separate buyer-visible records, and sending a project-status email is an explicit action rather than a side effect of an ordinary edit.

Archive, cancel, and reopen preserve the project and record actor/time/reason in the lifecycle ledger. Hard deletion is a separate guarded workflow: first inspect the dependency preview, then supply the displayed confirmation and reason. Referenced private media is quarantined rather than silently destroyed, unsafe dependencies cause refusal, and every preview/refusal/deletion decision is recorded. Buyer access to `/requests/[reference]` still requires an administrator session, a matching signed-in account, or the buyer email used for the project.

### Orders

Orders can be reviewed and updated from the dashboard. When providers are configured, the dashboard can create Stripe invoices, request EasyPost shipping labels, store tracking numbers, and update payment/shipping state.

### Reviews

Reviews are moderated from the dashboard. They can remain draft, be published, or be removed.

### Notifications

The compact Notifications workspace has **Overview**, **Types**, **Templates**, **Delivery**, **Visitors**, **Audit**, and **SMTP** views. The tab list supports arrow keys plus Home/End and exposes one labelled active tabpanel. Password resets, verification links, account notices, custom requests, project updates, order updates, invoices, shipping notices, optional visitor notices, and authenticated SMTP tests all use typed policies and allowlisted template variables.

Policies control enablement, recipient mode, optional forwarding recipients, retention, maximum attempts, and retry delay. Disabled categories are recorded as suppressed rather than sent. Manual retry rechecks the current policy and cannot bypass a disabled category. Idempotency keys prevent duplicate logical deliveries, and bounded retry attempts retain redacted error summaries for diagnosis.

Delivery rows are summary-only until opened; message bodies and attempt details are loaded on demand. SMTP verification reports host/port/sender and categorized failures but never returns or renders `SMTP_PASSWORD`. Delivery is reported as successful only when the SMTP transport accepts the primary recipient. Configuration, authentication, sender, connection, and recipient failures remain explicit instead of being reported as sent.

## Buyer-facing workflow

### Custom work contact

The public custom work page is a ten-step guided request covering intent, category, room/use, exact working dimensions, materials, private reference uploads, conceptual preview, fulfillment, contact details, and final review. Browser autosave is always available; verified accounts also receive serialized server-side drafts that can resume on another browser. The server, not hidden browser fields, recalculates material, labor, overhead, markup, queue-aware lead time, and the planning total before creating the project.

Reference uploads are limited to eight allowlisted image files, 20 MB each and 60 MB total. They are staged under the writable media mount, moved into the private project folder only after an idempotent project insert, and removed with the retry key if finalization fails. A honeypot and hashed per-owner submission window limit reduce automated abuse without storing raw IP addresses in quota tables.

The preview uses a dynamically loaded React Three Fiber scene with perspective/orthographic and front/side/top/isometric controls, while the deterministic SVG drawing remains available if WebGL or motion is unavailable. If `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured, generated previews have a separate owner-bound quota and can attach only once to the request that owns them.

## Private visual archive

The visual archive is an operational QA tool, not a Studio content panel. It inventories public and authenticated routes, captures the final rendered interfaces, verifies keyboard skip navigation, and produces restricted PNG/HTML/PDF evidence. Schema-v5 runs are explicitly Tier 1 synthetic, Tier 2 production clone, or Tier 3 live production. The protected inventory returns only media counts and hashes; `live-media.json` and `placeholder-report.json` prove mounted public media and account for intentional or unexpected placeholders without recording filenames. Canonical routes retain the complete responsive/theme matrix and deep states; rendered link variants use desktop/tablet/mobile theme representatives plus archival desktop. Every raw restricted capture remains available in the searchable HTML, while the PDF and redacted edition use a recorded per-route representative selection so derived reports remain reviewable. Production capture is read-only at both browser and server layers. Save, upload, rename, delete, invoice, shipping, email, and model actions are captured only against an isolated SQLite/media clone. Read-only mutation failures are accepted only when they match an exact client policy record; aborted resources are accepted only when they carry same-origin Next.js RSC/prefetch evidence.

Set `VISUAL_AUDIT_ACCELERATOR=auto` for normal operation. The runner records actual CUDA visibility and Chromium CDP renderer details, but enables a CUDA stage only after its representative benchmark is allowlisted in the build. `cpu` explicitly chooses the portable pipeline. `cuda` is a strict diagnostic mode and fails if the device or a verified deterministic CUDA stage is unavailable; it never silently falls back while reporting CUDA. Current RTX/Docker evidence retains CPU/SwiftShader because NVIDIA's tested codec exposed no GPU PNG decoder and headless Chromium remained on SwiftShader. See [docs/visual-archive.md](docs/visual-archive.md) for the complete phase matrix and rerun commands.

Use [`docs/visual-archive.md`](docs/visual-archive.md) for secret preparation, smoke/full runs, snapshot-lab setup, validation, retention, and post-deployment gates. Never upload the restricted archive or its authentication state to public CI or Git.

### Shop checkout

The cart calculates subtotal, coupon discount, tax estimate, shipping estimate, and total. If Stripe is configured, the app creates a hosted Checkout Session. If Stripe is not configured, checkout stops at a configuration-needed state.

### Buyer project lookup

Buyers use `/commissions/status` to exchange the project reference and buyer email through a POST form for a 30-day, `HttpOnly`, same-site capability cookie. Email addresses are never placed in request URLs. A signed-in buyer whose account email matches the project can open it directly; administrators retain operational access.

## Environment-dependent services

These features require server configuration before they work live:

- SMTP notifications: `SMTP_*`
- Stripe checkout and invoices: `STRIPE_*`
- EasyPost labels: `EASYPOST_API_KEY` and `SHIP_FROM_*`
- AI custom-work previews: `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true`
- AI cleaned image copies: `OPENAI_API_KEY` and `ENABLE_AI_BACKGROUND_CLEANUP=true`
- Local image/text embeddings: sidecar running at `LOCAL_AI_SIDECAR_URL` plus `ENABLE_EMBEDDING_SEARCH=true`
- Optional Gemini fallback: `GEMINI_API_KEY` and `ENABLE_GEMINI_FALLBACK=true`
- Optional OpenAI compatibility: `OPENAI_API_KEY` plus explicit OpenAI provider/feature flags

## Recommended operating routine

1. Open `/studio`.
2. Start from the overview workspace and open the focused panel you need.
3. Update buyer-facing project stages and lead times.
4. Keep portfolio categories, inventory counts, asking prices, and fulfillment options current.
5. Review and assign media before publishing pieces.
6. Publish process notes only when source credits, media, and wording are ready.
7. Moderate new reviews.

## Troubleshooting

### The site sent no email

Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`, and `SMTP_FROM_ADDRESS`, then open Notifications → SMTP for the redacted configuration check and Notifications → Delivery for queued, failed, pending-configuration, or suppressed records. Buyer verification and any deliberately enabled visitor notice use the same outbound transport; visitor notices remain disabled by default.

### Checkout did not open Stripe

Check `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SITE_URL`, and `NEXT_PUBLIC_SITE_URL`.

### Shipping labels fail

Check `EASYPOST_API_KEY`, all `SHIP_FROM_*` values, and the order shipping address fields.

### Media uploads fail on Synology

Check that `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` is mounted directly to `/app/pics:rw` and that the container user has write permission. Do not use `/volume2/docker_ssd/woodsmith/pics` as an intermediate mount point.

### Visitor locations are blank

The site can log sessions without location data, but the dashboard map needs Cloudflare visitor-location headers. Enable Cloudflare IP geolocation or the Add visitor location headers Managed Transform for the zone, then redeploy or reload the app.

### Media automation is unavailable

Open Media → Guided media trainer and click **Refresh status**. For the default provider, verify the sidecar is running, the URL is reachable from inside the NAS container, and `LOCAL_AI_SIDECAR_TOKEN` matches. If the sidecar runs on Windows/WSL, `127.0.0.1` inside the container is not the laptop; use the laptop LAN address and restrict the host firewall to the NAS. Provider failures are shown as unavailable/skipped while the manual editor remains functional. Public custom-work preview generation and OpenAI background cleanup still use their separate explicit OpenAI flags.

### Page edits do not survive rebuilds

Open Studio overview and check the Persistence card first. It should show a configured, writable `/app/site/data`, `quick_check=ok`, WAL journal mode, and the expected seed version. If it shows a different path or a warning, verify `DATA_ROOT=/app/site/data`, the Compose mount `/volume2/docker_ssd/woodsmith/site/data:/app/site/data`, and write access for the configured `PUID:PGID`. The application rejects a relative `DATA_ROOT` so a changed working directory cannot silently create a second SQLite database, and seed upgrades no longer overwrite browser-edited pages or settings.

Do not copy a live WAL database file by itself. Follow the paired runtime-state procedure in `synology-nas-deploy.md`; it uses SQLite `VACUUM INTO`, copies the matching media tree and protected environment file, records SHA-256 evidence, verifies `quick_check`, and restores only into new staging paths. Keep the pre-deploy data, media, environment, and rollback image until the replacement survives recreation and public validation.
