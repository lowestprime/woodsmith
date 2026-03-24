# Beaman Woodworks

Beaman Woodworks is a self-hosted Next.js application for a woodworking studio. It combines a public portfolio, shop, journal, buyer account flow, commission intake, project tracking, media library management, and a private browser-based studio dashboard in one deployment.

## What is in the app

- Public portfolio pages backed by verified media from `pics/`
- Shop pages with cart totals, coupon handling, tax estimate, and Stripe checkout plumbing
- Journal pages with markdown content and optional “Highlights from the Web” source links
- Commission intake with a live cost estimator and a to-scale SVG visualizer
- Buyer account pages for signup, login, password reset, profile editing, and project lookup
- Private studio dashboard for editing pages, pieces, posts, commission types, users, media metadata, projects, orders, reviews, and site settings
- Email notification queueing, Stripe invoice creation, and EasyPost shipping-label requests when the related environment variables are configured
- Full-size image lightbox support with zoom, pan, arrow navigation, and `Esc` close behavior
- Semantic-style site search across public content and, for admins, private media and project records

## Current production notes

- Persistence uses `node:sqlite`, which still emits Node's experimental warning during build and runtime.
- The commission visualizer is an interactive, to-scale SVG preview. It is not a photorealistic 3D renderer.
- Scientist Desk remains published without photos until its media is verified against the actual piece.
- Payment capture, invoice delivery, shipping-label creation, and outbound email all require environment configuration before they work live.

## Repository layout

- `site/`: the Next.js application
- `pics/`: the master media library served by `/media/[...slug]`
- `design/Beaman_Woodworks_V2_Google_Stitch_Beta/`: design prototypes that informed the Beaman Woodworks 2.0 layout, theme, and studio UX
- `ITC_New_Rennie_Mackintosh_Complete_Family_Pack/`: source font assets for the site typography
- `docker-compose.synology.yml`: Synology runtime model
- `synology-nas-deploy.md`: deployment and NAS operations guide
- `admin.md`: studio-owner browser admin manual
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
- `/journal`
- `/journal/[slug]`
- `/commissions`
- `/commissions/status`
- `/about`
- `/search`

Buyer account and request access:

- `/account/signup`
- `/account/login`
- `/account/forgot`
- `/account/reset`
- `/account/profile`
- `/account/projects`
- `/requests/[reference]`

Private studio:

- `/studio/login`
- `/studio`

## Deployment

The supported deployment target is Synology NAS with Docker Compose and reverse proxy termination. The compose file now mounts `pics/` read-write because the studio dashboard can upload, rename, and delete media directly inside the shared library.

Use these docs together:

- `synology-nas-deploy.md`
- `admin.md`
- `woodsmith_DeepWiki_Merged_03222026.md`