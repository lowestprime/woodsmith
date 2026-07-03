# Beaman Woodworks Private Dashboard Manual

This guide covers the private Woodshop dashboard at `/studio`.

## Login

- Open `/studio/login`.
- Use the admin email `woodsmithbb@proton.me`.
- Use the password stored in `STUDIO_PASSWORD` on the server.
- A successful login creates a secure session cookie and opens the dashboard.

## Dashboard areas

The dashboard opens on an overview workspace and lets you move between focused panels instead of loading every editor at once. Public pages also show admin-only pencil controls while you are signed in. Mapped text and links edit in place; **Full editor** opens the matching dashboard workspace for structural changes.

### Settings

The settings editor controls brand copy, homepage wording, contact email addresses, repository URL, tax/shipping defaults, coupon definitions, payment settings, social links, and the revenue model text. Changes save to SQLite and revalidate the live site.

### Pages

The Pages section can create, edit, publish, archive, or delete page records. It now uses a compact record picker with one active editor at a time instead of rendering every page form in a long stack. Built-in public pages include home, portfolio, shop, process, custom work contact, about, and extra pages such as care or warranty. `/journal` is retained only as a redirect path to Process.

Changes save into the mounted SQLite data store, revalidate the matching public routes immediately, and survive rebuilds as long as `site/data/` remains mounted persistently. On the home page record, `intro` feeds the hero copy and `body` feeds the secondary home copy block.

### Portfolio and shop pieces

The Pieces section can add drafts, update titles and descriptions, set category tabs, revise materials and tags, assign media paths, control publication status, manage inventory count, set asking-price data for shop items, and mark whether media has been verified.

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
- filter all indexed media, not only recent files
- browse a compact thumbnail workspace instead of a long full-page stack of editors
- assign media to a piece, process note, page, or project
- rename files in place
- edit alt text, tags, focal X/Y, zoom, and reviewed status
- use the visual crop editor to set focal point, zoom, crop frame, and crop notes through sliders and form controls
- set cleanup mode, photo quality, source credit, verified piece slug, visual search labels, and display order
- generate a cleaned copy of an image when `OPENAI_API_KEY` and `ENABLE_AI_BACKGROUND_CLEANUP=true` are configured
- delete files
- refresh the indexed library

The desk keeps one active inspector beside the thumbnail browser. `J`/`K` move between visible records, `F` focuses the instant page filter, `P` focuses piece assignment, `U` clears the assignment, `R` toggles review state, and `S` saves. Assignment changes update both media metadata and the affected piece galleries; unreviewed media stays private until approved.

Synology sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and AppleDouble `._*` files are filtered during indexing. Manual media assignments take priority over heuristic clustering. The verification queue suggests candidates from filenames, tags, folders, and metadata but never auto-assigns a piece.

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

The public custom work page collects contact details, location, budget, requested piece type, preferred material, pickup/delivery/shipping preference, attachments, an optional 3D scale preview, and a written brief. It creates a private project record and redirects the buyer to a reference page. If `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured, the visualizer can also generate a photorealistic preview and attach it only when the buyer chooses to include the preview.

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
- Embedding search re-ranking: `OPENAI_API_KEY` and `ENABLE_EMBEDDING_SEARCH=true`

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

### AI preview, cleanup, or embedding search is unavailable

Check `OPENAI_API_KEY` and the specific feature flag for the capability. The dashboard shows whether AI cleanup and embedding search are configured. Public custom-work preview generation intentionally returns a configuration-needed message instead of claiming image-model support when credentials are absent.
