# Beaman Woodworks

Beaman Woodworks is a self-hosted Next.js application for a woodworking business. It combines a public portfolio, shop, process writing, buyer account flow, contact-first custom work intake, project tracking, media library management, and a private Woodshop dashboard in one deployment.

## What is in the app

- Public portfolio pages backed only by verified or explicitly review-marked media from the NAS photo library mounted at `/app/pics`
- Portfolio category filtering for tables, benches, stepstools, cabinets, and smaller objects
- Shop pages with asking-price language, cart totals, coupon handling, tax estimate, pickup/delivery/shipping labels, and Stripe checkout plumbing
- Process writing under `/process` and the Shop process section, with markdown content and optional source-credit links for outside references
- Contact-first custom work requests with attachments, lead-time context, material preferences, project tracking, and an optional live procedural 3D scale preview
- Buyer account pages for signup, login, password reset, profile editing, profile images, and account-linked projects
- Private Woodshop dashboard for editing settings, pages, pieces, custom work types, users, media, process notes, projects, orders, reviews, and notifications without visible raw JSON panels
- Browser media management for upload, rename, delete, assignment, tags, review state, focal point, cleanup mode, display order, source credit, and zoom metadata against the writable NAS photo library
- Email notification queueing, Stripe invoice creation, and EasyPost shipping-label requests when the related environment variables are configured
- Full-size image lightbox support with zoom, pan, arrow navigation, plus `Esc` and close-button exit behavior
- Semantic-style text search plus browser-assisted visual search across public content and, for admins, private media, visual labels, clusters, unpublished content, and project records
- Persistent light/day and black OLED night themes using the local ITC New Rennie Mackintosh font assets
- Programmatic Beaman Woodworks favicon and brand mark

## Current production notes

- Persistence uses `node:sqlite`, which emits Node's experimental warning during build and runtime.
- `/journal` and `/journal/[slug]` now redirect to Process. New public writing should be published as Process notes.
- The public custom work flow is contact-first and now includes a credential-free procedural 3D scale preview. The older SVG renderer remains for stored visualization snapshots.
- Scientist Desk remains published without photos until the correct black phenolic resin top, birds-eye maple rails, and white maple legs media are verified.
- New piece records can be created without guessed photos. Media should be assigned only after review in the Woodshop dashboard.
- Payment capture, invoice delivery, shipping-label creation, and outbound email require environment configuration before they work live.

## Repository layout

- `site/`: the Next.js application
- The repo-local `pics/` folder is legacy/ignored and should not be used as the source of truth. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics`, and `MEDIA_ROOT` defaults to `/app/pics` rather than creating a local media folder.
- `design/Beaman_Woodworks_V2_Google_Stitch_Beta/`: Beaman Woodworks 2.0 prototypes audited for layout, theme, and dashboard direction
- `ITC_New_Rennie_Mackintosh_Complete_Family_Pack/`: source font assets for the site typography
- `docker-compose.synology.yml`: Synology runtime model
- `synology-nas-deploy.md`: deployment and NAS operations guide
- `admin.md`: private Woodshop dashboard manual
- `woodsmith_DeepWiki_Merged_03222026.md`: codebase architecture reference

## Local development

1. Install dependencies from the repo root with `npm install`.
2. Copy `.env.example` to `.env` and fill the values you intend to use locally.
3. Start the app with `npm run dev`.
4. Open `http://127.0.0.1:3000`.

Root scripts proxy into `site/`:

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run start`

## Environment variables

Use the root `.env.example` as the canonical reference.

Required for a secure deployment:

- `STUDIO_PASSWORD`
- `SESSION_SECRET`
- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`

Required for optional live services:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `EASYPOST_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SHIP_FROM_NAME`
- `SHIP_FROM_STREET1`
- `SHIP_FROM_CITY`
- `SHIP_FROM_STATE`
- `SHIP_FROM_ZIP`
- `SHIP_FROM_COUNTRY`

## Key routes

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

## Deployment

The supported deployment target is Synology NAS with Docker Compose and reverse proxy termination. The compose file mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`; do not remount or bind the repo-local `pics/` folder under `docker_ssd`.

Use these docs together:

- `synology-nas-deploy.md`
- `admin.md`
- `woodsmith_DeepWiki_Merged_03222026.md`
