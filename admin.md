# Beaman Woodworks Studio Admin Manual

This guide covers the private browser dashboard at `/studio`.

## Studio login

- Open `/studio/login`.
- Use the admin email `woodsmithbb@proton.me`.
- Use the password stored in `STUDIO_PASSWORD` on the server.
- A successful login creates a secure session cookie and opens the studio dashboard.

## What the studio dashboard manages

### Site settings

The Site Settings editor controls:

- brand copy
- navigation links
- homepage featured-piece logic
- coupon definitions
- tax and shipping defaults
- payment workflow settings
- contact details
- marketplace and revenue-model text
- social links

Changes save directly into SQLite and are reflected on the live site after revalidation.

### Pages

The Pages section can:

- edit any existing page record
- create new page records
- delete page records

This drives built-in pages such as the home, portfolio, shop, journal, commissions, and about pages, along with extra content pages like care and warranty.

### Portfolio pieces

The Pieces section can:

- add new draft pieces
- revise titles, summaries, materials, tags, and lead times
- assign media paths
- change publication state
- set inventory count and price
- remove pieces

Important note: the application does not guess media identity. If a piece is not yet verified, leave the media unassigned or mark that requirement clearly in `metadata`.

### Journal posts

The Posts section supports:

- new draft posts
- markdown body editing
- cover media assignment
- publication control
- source links for “Highlights from the Web”

### Commission types

Commission types define:

- buyer-facing labels and descriptions
- default dimensions
- base labor hours
- markup defaults
- material option lists

These records drive the commission form and the estimator defaults.

### Profiles and users

The Users section can create or update:

- admin accounts
- woodworker profiles
- public profile cards for the About page
- hidden buyer accounts created from signup

Use this section when adding additional woodworkers to the platform.

### Media library

The media section now supports browser-side operations against the shared `pics/` library:

- upload new files
- assign uploaded media to a piece, post, page, or project
- rename files in place
- edit media metadata JSON
- delete files
- refresh the indexed media library

The dashboard stores media metadata in SQLite and writes file changes to the mounted `pics/` path. On Synology, that mount must remain writable.

### Projects

Each project record can be updated with:

- status
- stage
- public notes
- internal notes
- lead time
- estimate data
- timeline messages
- public or private visibility on each timeline entry

Buyer access to `/requests/[reference]` now requires either:

- a matching signed-in account, or
- the buyer email used for the project

This is the current protection for the public project tracker.

### Orders

Orders can be reviewed and edited from the dashboard. When the relevant providers are configured, the dashboard can also:

- create Stripe invoices
- request EasyPost shipping labels
- store tracking numbers and shipping state

### Reviews

New buyer reviews are created as draft records. The studio dashboard is where they should be reviewed and either:

- published
- kept as draft
- removed

### Notifications

Every password reset, project update, and commission email queues a notification record. The Notifications section shows:

- current status
- recipient
- subject
- body
- send errors, if any

## Buyer-facing workflow notes

### Commission intake

The commission form collects:

- contact details
- location
- budget
- material selection
- dimensions
- project brief
- attachments
- optional visualization inclusion
- estimated total and lead-time data from the live estimator

### Shop checkout

The cart calculates:

- subtotal
- coupon discount
- shipping estimate
- tax estimate
- total

If Stripe is configured, the app creates a hosted Checkout Session. If Stripe is not configured, the cart stops at a configuration-needed state.

### Buyer project lookup

Buyers can use:

- `/commissions/status`
- `/requests/[reference]?email=buyer@example.com`

The dedicated request page is meant to be shared only with the buyer and trusted collaborators.

## Environment-dependent services

These features require server configuration before they work live:

- SMTP notifications: `SMTP_*`
- Stripe checkout and invoices: `STRIPE_*`
- EasyPost labels: `EASYPOST_API_KEY` and `SHIP_FROM_*`

If SMTP is missing, notifications still queue in the database but do not send.

## Recommended operating routine

1. Open `/studio`.
2. Review queued notifications and active project count.
3. Update buyer-facing statuses and lead times.
4. Keep published pieces and inventory counts current.
5. Moderate new reviews.
6. Keep media assignments accurate before publishing new content.
7. Use the Orders section for invoice or shipment operations when providers are configured.

## Troubleshooting

### The site sent no email

Check:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

Then review the Notifications section for a queued or failed status.

### Checkout did not open Stripe

Check:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`

### Shipping labels fail

Check:

- `EASYPOST_API_KEY`
- `SHIP_FROM_*`
- the order shipping address fields

### Media uploads fail on Synology

Check that `/volume2/docker_ssd/woodsmith/pics` is mounted to `/app/pics` without `:ro` and that the container user has write permission.