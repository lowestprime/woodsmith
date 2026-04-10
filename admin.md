# Beaman Woodworks Private Dashboard Manual

This guide covers the private Woodshop dashboard at `/studio`.

## Login

- Open `/studio/login`.
- Use the admin email `woodsmithbb@proton.me`.
- Use the password stored in `STUDIO_PASSWORD` on the server.
- A successful login creates a secure session cookie and opens the dashboard.

## Dashboard areas

### Settings

The settings editor controls brand copy, homepage wording, contact email addresses, repository URL, piece divider names, tax/shipping defaults, coupon definitions, payment settings, social links, and the revenue model text. Changes save to SQLite and revalidate the live site.

### Pages

The Pages section can create, edit, publish, archive, or delete page records. Built-in public pages include home, portfolio, shop, process, custom work contact, about, and extra pages such as care or warranty. `/journal` is retained only as a redirect path to Process.

### Portfolio and shop pieces

The Pieces section can add drafts, update titles and descriptions, set category tabs, revise materials and tags, assign media paths, control publication status, manage inventory count, set asking-price data for shop items, and mark whether media has been verified.

Do not guess piece-to-photo identity. If a piece is not verified, leave media unassigned or keep it marked for review. Scientist Desk media must stay withheld until the correct black phenolic resin top, birds-eye maple rails, and white maple legs photos are verified.

### Custom work types

Custom work types define labels, descriptions, default dimensions, base labor hours, markup defaults, and material option lists. These records support the contact workflow and lead-time/estimate context.

### People

The People section can update admin, woodworker, customer, developer, and public profile records. It is the current foundation for future multi-woodworker support, public profile cards, and role-aware dashboard behavior.

### Process notes

Process notes replace the old Journal surface. The editor supports title, excerpt, markdown body, publication state, cover media, tags, and source-credit links for outside references or inspiration.

### Media library

The media section operates against the NAS photo library mounted directly to `/app/pics`:

- upload files into a selected folder
- filter all indexed media, not only recent files
- assign media to a piece, process note, page, or project
- rename files in place
- edit alt text, tags, focal X/Y, zoom, and reviewed status
- use the visual crop editor to set focal point, zoom, crop frame, and crop notes through sliders and form controls
- set cleanup mode, photo quality, source credit, verified piece slug, visual search labels, and display order
- generate a cleaned copy of an image when `OPENAI_API_KEY` and `ENABLE_AI_BACKGROUND_CLEANUP=true` are configured
- delete files
- refresh the indexed library

Synology sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and AppleDouble `._*` files are filtered during indexing. Manual media assignments take priority over heuristic clustering. The verification queue suggests candidates from filenames, tags, folders, and metadata but never auto-assigns a piece.

### Projects

Projects can be updated with status, stage, public notes, internal notes, lead time, and timeline entries. Buyer access to `/requests/[reference]` requires either an admin session, a matching signed-in account, or the buyer email used for the project.

### Orders

Orders can be reviewed and updated from the dashboard. When providers are configured, the dashboard can create Stripe invoices, request EasyPost shipping labels, store tracking numbers, and update payment/shipping state.

### Reviews

Reviews are moderated from the dashboard. They can remain draft, be published, or be removed.

### Notifications

Password resets, project updates, contact requests, and commerce emails queue notification records. If SMTP is missing, notifications stay in the database and show the send failure instead of pretending delivery succeeded.

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
2. Review active project count, queued notifications, and order status.
3. Update buyer-facing project stages and lead times.
4. Keep portfolio categories, inventory counts, asking prices, and fulfillment options current.
5. Review and assign media before publishing pieces.
6. Publish process notes only when source credits, media, and wording are ready.
7. Moderate new reviews.

## Troubleshooting

### The site sent no email

Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD`, then review the Notifications section for queued or failed records.

### Checkout did not open Stripe

Check `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SITE_URL`, and `NEXT_PUBLIC_SITE_URL`.

### Shipping labels fail

Check `EASYPOST_API_KEY`, all `SHIP_FROM_*` values, and the order shipping address fields.

### Media uploads fail on Synology

Check that `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` is mounted directly to `/app/pics:rw` and that the container user has write permission. Do not use `/volume2/docker_ssd/woodsmith/pics` as an intermediate mount point.

### AI preview, cleanup, or embedding search is unavailable

Check `OPENAI_API_KEY` and the specific feature flag for the capability. The dashboard shows whether AI cleanup and embedding search are configured. Public custom-work preview generation intentionally returns a configuration-needed message instead of claiming image-model support when credentials are absent.
