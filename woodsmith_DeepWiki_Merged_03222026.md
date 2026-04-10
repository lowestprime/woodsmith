# Beaman Woodworks Architecture Reference

This document replaces the earlier Woodsmith DeepWiki export with the current Beaman Woodworks 3.0 architecture.

## Overview

Beaman Woodworks is a self-hosted Next.js 16 application with a SQLite-backed content and operations layer. It is designed to run on a Synology NAS and keep portfolio, shop, process writing, contact-first custom work intake, project tracking, media management, commerce operations, and private Woodshop administration inside one deployment.

## Stack

- Next.js 16 App Router
- React 19
- Node `node:sqlite` via `DatabaseSync`
- Local ITC New Rennie Mackintosh font assets
- Plain CSS with CSS custom properties and theme tokens
- Nodemailer for SMTP delivery
- Stripe API for hosted checkout and invoice generation
- EasyPost API for shipment creation
- Credential-free procedural 3D preview UI for custom work, with Three.js and React Three Fiber dependencies retained for future rendering work

## Core application areas

### Public site

Routes under `site/app/` provide:

- home page
- categorized portfolio index and piece detail pages
- shop index and cart
- process index and individual process notes
- custom work contact page and project-status lookup
- about page and editable custom pages
- search page

`/journal` and `/journal/[slug]` are legacy redirects to Process.

### Buyer account and project access

The account system supports signup, login, password reset, profile updates, profile image upload, and account-linked project listing.

Project trackers live at `/requests/[reference]`. Access is allowed only when the viewer is an admin, the viewer is signed in with the linked account email, or the buyer email supplied in the request URL matches the project record.

### Private Woodshop dashboard

`/studio` remains the private route name, but the product language is Woodshop dashboard. The dashboard exposes structured browser forms rather than visible raw JSON panels for:

- site settings
- pages
- portfolio and shop pieces
- custom work types
- users and public profiles
- process notes
- media metadata, cleanup controls, visual labels, verification queue, and media file operations
- projects and timeline updates
- orders, invoices, shipping labels, and tracking state
- reviews
- queued notifications

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

Seeds from `site/lib/seed.ts` initialize site settings, profile records, pages, pieces, custom work types, and process notes. Existing databases with an older seeded version are upgraded to the current v3 seed set without deleting runtime orders, projects, users, or media metadata.

## Media system

The master media library lives outside the app bundle and outside `docker_ssd`. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`. The repo-local `pics/` folder is legacy/ignored and is not the source of truth; `MEDIA_ROOT` defaults to `/app/pics` and media scans return an empty library instead of creating a repo-local fallback when the mount is absent. The application:

- indexes that library into `media_items`
- serves files through `/media/[...slug]`
- prevents path traversal in the media route
- filters Synology and OS sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and `._*`
- stores alt text, clustering, associations, focal data, zoom, cleanup mode, visual labels, source credit, display order, review state, and tags in SQLite
- can upload, rename, delete, and assign files in the mounted media root

Current clustering is heuristic and based on folder, filename, and date-like patterns. The media verification queue suggests candidates but does not assign them automatically. Manual dashboard assignments take priority and are the source of truth for published piece-media identity.

## Commerce and operations

The commerce layer supports inventory items in the shop, asking-price presentation, cart totals, coupon handling, tax estimate, pickup/delivery/shipping labels, Stripe Checkout Session creation, Stripe invoice creation from the dashboard, and EasyPost label requests from the dashboard.

Payment capture, invoice delivery, shipping labels, and outbound email degrade safely when provider environment variables are missing.

## Custom work workflow

The public custom work route is contact-first. It captures buyer contact details, location, budget, project type, material preference, fulfillment preference, attachments, optional procedural 3D scale preview data, and a written brief. Submission creates a project record, queues notifications, and redirects the buyer to a reference page.

Custom work type records still store default dimensions, material options, labor hours, and markup settings so the woodshop can maintain estimator context and future richer intake flows.

`site/components/visualizer.tsx` now provides a live 3D CSS/procedural scale preview and still stores an SVG snapshot with submitted project data when the buyer opts in.

## Search

`searchSite()` searches across pieces, process notes, pages, media, and projects. Admin users receive private results including unpublished content, media paths, tags, cluster keys, and project records. Public users see public content only.

The search layer includes synonym expansion for common woodworking terms, material/color cues, cleanup labels, delivery, pickup, custom work, and Mackintosh or Stickley references. The browser-assisted visual search reads a reference image locally, derives color/material cues, and converts them into searchable tags.

## Theme and UI

The active design language is based on the Beaman Woodworks 2.0 prototypes but updated for the 3.0 client feedback:

- birds-eye maple, ebony, and white-maple palette
- persistent light/day and black OLED night theme toggle
- local Mackintosh typography throughout the site
- rounded controls, larger form fields, and more legible button language
- categorized portfolio tabs with icon-like labels
- shop-first Process section replacing Journal
- account button as a rounded profile badge
- full-size lightbox overlays with zoom, pan, arrows, close button, and `Esc` support
- private dashboard media preview cards with crop/focal controls, cleanup modes, project media strips, and verification candidates
- programmatic Beaman Woodworks favicon and header mark

## Known caveats

- SQLite support still relies on Node's experimental `node:sqlite` API.
- The visualizer is a procedural 3D scale preview, not a cloud photorealistic renderer.
- Scientist Desk media is intentionally withheld until the correct images are verified.
- Cleanup modes and browser-assisted visual search are implemented locally. Cloud photorealistic rendering, segmentation, or embedding services can be added later if credentials are provided.
- SMTP, Stripe, and EasyPost functionality remain configuration-dependent.

## Important files

- `site/lib/db.ts`: schema, data access, dashboard summaries, seed upgrade, and search
- `site/lib/actions.ts`: server actions for auth, checkout, content editing, custom work, media, projects, and orders
- `site/lib/seed.ts`: initial content, settings, and v3 content truth
- `site/lib/catalog.ts`: portfolio categories, media display rules, and fulfillment labels
- `site/lib/media.ts`: media scanning, upload, rename, delete, sidecar filtering, and path resolution
- `site/lib/payments.ts`: Stripe and EasyPost integration
- `site/lib/notifications.ts`: SMTP and notification queue handling
- `site/components/forms.tsx`: public, account, profile, and custom work forms
- `site/components/site-chrome.tsx`: header, footer, cards, shared layout pieces, and account badge
- `site/components/visualizer.tsx`: legacy to-scale SVG visualizer and estimator fields
- `site/app/icon.tsx`: generated favicon
- `site/app/studio/page.tsx`: private Woodshop dashboard
- `site/app/media/[...slug]/route.ts`: file-backed media serving route
- `docker-compose.synology.yml`: Synology deployment configuration
- `synology-nas-deploy.md`: deployment operations manual
