# Beaman Woodworks Private Dashboard Manual

This guide covers the private Woodshop dashboard at `/studio`.

## Login

- Open `/studio/login`.
- Use the admin email `woodsmithbb@proton.me`.
- Use the password stored in `STUDIO_PASSWORD` on the server.
- A successful login creates a secure session cookie and opens the dashboard.

## Dashboard areas

The dashboard opens on an overview workspace and lets you move between focused panels instead of loading every editor at once. Public pages also show admin-only pencil controls while you are signed in. Mapped text and links edit in place; use `Ctrl+S` to save, `Esc` to exit, **Reset unsaved** to restore the value shown when editing opened, or **Undo last save** to reverse the most recent inline batch. **Full editor** opens the matching visual dashboard workspace for structural changes. Inline batches are validated from a typed field registry, saved in one SQLite transaction, checked for concurrent changes, and recorded in the admin edit audit. The site header is intentionally compact and hides while scrolling down; scroll up, focus a header control, or move the pointer over the header area to reveal it again.

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
- edit alt text, tags, focal X/Y, zoom, and reviewed status
- use the visual crop editor to set focal point, zoom, crop frame, and crop notes through sliders and form controls
- set cleanup mode, photo quality, source credit, visual search labels, and display order; verified-piece metadata is derived from the reviewed piece assignment
- generate a cleaned copy of an image when `OPENAI_API_KEY` and `ENABLE_AI_BACKGROUND_CLEANUP=true` are configured
- delete files
- refresh the indexed library
- select one or more cards and run **Train selected**, **Improve page**, or **Continue library** without choosing individual scan/analyze/embed/cluster steps
- inspect provider/model status, visual/VLM/text/cluster evidence, runner-up margin, ambiguity, and persisted review reasons
- copy an AI alt-text draft or merge AI tags into the editable fields without auto-approving them
- reject a wrong piece suggestion so it becomes a negative training label for future rankings

The desk keeps one active inspector beside the thumbnail browser on desktop; phones use a fixed-height Tools / Library / Inspector switcher to avoid stacking three long panes. Routine saves, assignments, renames, uploads, and deletes update in place without reloading the Studio route. `J`/`K` move between visible records, `F` focuses whole-library search, `P` focuses piece assignment, `U` clears the assignment, `R` toggles review state, `I` analyzes, `E` embeds, `C` inspects the current cluster, `S` saves, `Shift+S` saves and advances, and `A` approves and advances. Assignment changes update both media metadata and the affected piece galleries; unreviewed media stays private until approved. Reviewed assignments, reviewer rejections, verified cluster neighbors, and same-folder review history are saved as training evidence and weighted into later candidate rankings.

Synology sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, AppleDouble `._*`, `@eaDir`, and `SYNOFILE_THUMB*` files are filtered during indexing and querying. Manual media assignments take priority over heuristic clustering. The verification queue offers at most one sufficiently separated best-piece proposal per unassigned image; ambiguous matches remain in the library for manual review. Inspecting a candidate never assigns it.

### Media automation providers

The normal automation surface is **Guided media trainer**. Use **Train selected** for hand-picked records, **Improve page** for the current filtered page, and **Continue library** for the next uncached batch. The card shows the active local provider, cache counts, indexed media, accepted/rejected training labels, analyzed files, vectors, and clusters in one place. **Preview only** performs a dry run without saving AI evidence; it is off by default because normal runs still cannot assign, approve, or publish media.

Advanced actions expose **Rescan files**, **Analyze page**, **Analyze selected**, **Embed page**, **Embed selected**, **Cluster page**, **Rank matches**, and **Preview page run** for diagnostics. The underlying API still supports status, scan, analyze, embed, cluster, match, full, cancel, and dry-run. Work is synchronous and bounded by `MEDIA_AI_MAX_BATCH`; no fake background job is presented. **Continue library** resumes with uncached work, while **Include reviewed media** is an explicit opt-in for page/library batches. Direct per-image Analyze/Embed actions remain intentional reprocessing actions even when that record is already reviewed.

- `local-sidecar` is the default bulk path. It hashes source files, computes perceptual hashes and true image-pixel CLIP embeddings, caches outside `/app/pics`, and can run entirely on the Windows/WSL laptop or another GPU host.
- Ollama is an optional local vision classifier for ambiguous images or explicit re-analysis. It is not called blindly for every near-duplicate.
- Gemini 3.1 Flash-Lite and Gemini Embedding 2 are optional fallback/cloud-quality paths. Google quotas, pricing, and data terms apply and can change by project.
- OpenAI remains backwards compatible only when explicitly selected and configured. ChatGPT Plus is a separate product and cannot authenticate this API.

Every cache record includes provider, model, version, source hash, and timestamp. Changing embedding model/provider creates a separate vector space and requires re-embedding. The local cache also holds generated 768px review thumbnails outside the source photo library. Cluster IDs and membership are persisted to media metadata, and partial cluster runs update only their selected paths instead of deleting unrelated cluster state. A cluster can inform ranking, but only manually reviewed labels provide the strongest propagation prior. Reviewer-rejected candidates and contradicted same-folder examples suppress later suggestions. The public gate still requires `reviewed=true`, accurate alt text, and an explicit save/assign action.

The same visual picker is now used in Pages, Pieces, and Process editors, so cover images and piece galleries can be selected directly from the mounted library without typing raw paths.

### Visitor map

The overview workspace now shows recent visitor sessions on a world map and in a recent-session list. The map is sourced from session records stored in SQLite.

- a new visitor session queues an email when SMTP is configured
- country detail uses Cloudflare's `CF-IPCountry` header when available
- city, region, latitude, and longitude require Cloudflare visitor-location headers to be enabled
- if Cloudflare location headers are not present, the dashboard still records the session and host/path but shows unknown location data

### Projects

Projects can be updated with status, stage, public notes, internal notes, lead time, and timeline entries. Buyer access to `/requests/[reference]` requires either an admin session, a matching signed-in account, or the buyer email used for the project.

### Orders

Orders can be reviewed and updated from the dashboard. When providers are configured, the dashboard can create Stripe invoices, request EasyPost shipping labels, store tracking numbers, and update payment/shipping state.

### Reviews

Reviews are moderated from the dashboard. They can remain draft, be published, or be removed.

### Notifications

Password resets, verification links, project updates, contact requests, and commerce emails queue notification records. Delivery is reported as successful only when the SMTP transport accepts the primary recipient. Configuration, authentication, sender, connection, and recipient failures are shown accurately instead of being reported as sent.

## Buyer-facing workflow

### Custom work contact

The public custom work page collects contact details, location, budget, requested piece type, preferred material, pickup/delivery/shipping preference, attachments, an optional conceptual proportional preview, and a written brief. The preview uses a dynamically loaded React Three Fiber scene with perspective/orthographic and front/side/top/isometric controls, while the deterministic SVG drawing remains available if WebGL or motion is unavailable. It creates a private project record and redirects the buyer to a reference page. If `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured, the visualizer can also generate a photorealistic preview and attach it only when the buyer chooses to include the preview.

## Private visual archive

The visual archive is an operational QA tool, not a Studio content panel. It inventories public and authenticated routes, captures the final rendered interfaces, and produces restricted PNG/HTML/PDF evidence. Production capture is read-only at both browser and server layers. Save, upload, rename, delete, invoice, shipping, email, and model actions are captured only against an isolated SQLite/media clone.

Use [`docs/visual-archive.md`](docs/visual-archive.md) for secret preparation, smoke/full runs, snapshot-lab setup, validation, retention, and post-deployment gates. Never upload the restricted archive or its authentication state to public CI or Git.

### Shop checkout

The cart calculates subtotal, coupon discount, tax estimate, shipping estimate, and total. If Stripe is configured, the app creates a hosted Checkout Session. If Stripe is not configured, checkout stops at a configuration-needed state.

### Buyer project lookup

Buyers can use `/commissions/status` or `/requests/[reference]?email=buyer@example.com`. Reference links should be shared only with the buyer and trusted collaborators.

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

Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`, and `SMTP_FROM_ADDRESS`, then review the Notifications section for queued or failed records. Buyer email verification and visitor-session alerts use the same outbound email transport.

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

Open Studio overview and check the Persistence card first. It should show a configured, writable `/app/site/data`, `quick_check=ok`, WAL journal mode, and the expected seed version. If it shows a different path or a warning, verify `DATA_ROOT=/app/site/data`, the Compose mount `/volume2/docker_ssd/woodsmith/site/data:/app/site/data`, and write access for the configured `PUID:PGID`. The application rejects a relative `DATA_ROOT` so a changed working directory cannot silently create a second SQLite database, and seed upgrades no longer overwrite browser-edited pages or settings. Back up `woodsmith.sqlite`, `woodsmith.sqlite-wal`, and `woodsmith.sqlite-shm` together or use SQLite's online backup command.
