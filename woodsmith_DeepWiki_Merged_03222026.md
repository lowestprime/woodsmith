# Beaman Woodworks Architecture Reference

This document replaces the earlier Woodsmith DeepWiki export with the current Beaman Woodworks 2.0 architecture.

## Overview

Beaman Woodworks is a self-hosted Next.js 16 application with a SQLite-backed content and operations layer. It is designed to run on a Synology NAS and to keep portfolio, shop, journal, project tracking, media management, and studio administration inside one deployment.

## Stack

- Next.js 16 App Router
- React 19
- Node `node:sqlite` via `DatabaseSync`
- Local ITC New Rennie Mackintosh font assets
- Plain CSS with CSS custom properties and theme tokens
- Nodemailer for SMTP delivery
- Stripe API for hosted checkout and invoice generation
- EasyPost API for shipment creation

## Core application areas

### Public site

Routes under `site/app/` provide:

- home page
- portfolio index and piece detail pages
- shop index and cart
- journal index and individual posts
- commissions intake page and project-status lookup
- about page and editable custom pages
- search page

### Buyer account and project access

The account system supports:

- signup
- login
- password reset
- profile updates
- profile image upload
- account-linked project listing

Project trackers live at `/requests/[reference]`. Access is allowed only when:

- the viewer is an admin, or
- the viewer is signed in with the linked account email, or
- the buyer email supplied in the request URL matches the project record

### Private studio dashboard

`/studio` is the main operations surface. It currently exposes JSON-backed editors for:

- site settings
- pages
- pieces
- posts
- commission types
- users and public profiles
- media metadata
- projects
- orders
- reviews
- queued notifications

The studio dashboard also provides browser-side media upload, rename, delete, and reassignment.

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

Seeds from `site/lib/seed.ts` initialize:

- site settings
- profile records
- pieces
- commission types
- posts
- core pages

## Media system

The master media library lives outside the app bundle in `pics/`. The application:

- indexes that library into `media_items`
- serves files through `/media/[...slug]`
- prevents path traversal in the media route
- stores alt text, clustering, associations, focal data, and tags in SQLite
- can write new uploads back into the mounted media root

Current clustering is heuristic and based on folder plus filename prefixes.

## Commerce and operations

The commerce layer currently supports:

- inventory items in the shop
- cart totals
- coupon handling
- tax estimate
- shipping estimate
- Stripe Checkout Session creation
- Stripe invoice creation from the studio dashboard
- EasyPost label requests from the studio dashboard

The commission layer currently supports:

- commission types
- material options
- dimension presets
- queue-aware lead-time estimates
- estimated labor and markup calculations
- attachment uploads
- optional visualization SVG storage with the project record

## Search

`searchSite()` searches across:

- pieces
- posts
- pages
- media
- projects

Admins receive private results. Public users see public content only.

## Theme and UI

The active design language came from `design/Beaman_Woodworks_V2_Google_Stitch_Beta/` and is represented in the application through:

- OLED-style dark theme by default
- persistent light/dark theme toggle
- local Mackintosh typography throughout the site
- editorials cards, rails, and quiet spacing
- lightbox overlays for large media viewing
- a modernized studio console layout for operations work

## Known caveats

- SQLite support still relies on Node's experimental `node:sqlite` API.
- The visualizer is a to-scale SVG system rather than a photorealistic renderer.
- Scientist Desk media is intentionally withheld until the correct images are verified.
- SMTP, Stripe, and EasyPost functionality remain configuration-dependent.

## Important files

- `site/lib/db.ts`: schema, data access, dashboard summaries, search
- `site/lib/actions.ts`: server actions for auth, checkout, content editing, media, projects, and orders
- `site/lib/seed.ts`: initial content and settings
- `site/lib/media.ts`: media scanning, upload, rename, delete, path resolution
- `site/lib/payments.ts`: Stripe and EasyPost integration
- `site/lib/notifications.ts`: SMTP and notification queue handling
- `site/components/forms.tsx`: public and account forms
- `site/components/site-chrome.tsx`: header, footer, cards, and shared layout pieces
- `site/components/visualizer.tsx`: commission visualizer and estimator fields
- `site/app/studio/page.tsx`: private studio dashboard
- `site/app/media/[...slug]/route.ts`: file-backed media serving route
- `docker-compose.synology.yml`: Synology deployment configuration
- `synology-nas-deploy.md`: deployment operations manual