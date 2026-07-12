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

Project trackers live at `/requests/[reference]`. Access is allowed only when the viewer is an admin, the viewer is signed in with the linked account email, or the buyer email supplied in the request URL matches the project record.

### Private Woodshop dashboard

`/studio` remains the private route name, but the product language is Woodshop dashboard. The dashboard opens on an overview workspace, exposes focused workspace tabs, and exposes structured browser forms for:

- site settings
- pages
- portfolio and shop pieces
- portfolio category labels, matching rules, icons, and safe reassignment
- custom work types
- users and public profiles
- process notes
- media metadata, visual crop controls, optional AI-cleaned copies, visual labels, verification queue, and media file operations
- projects and timeline updates
- orders, invoices, shipping labels, and tracking state
- reviews
- queued notifications
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
- `piece_media_links`
- `admin_edit_audit`
- `media_rename_history`

Seeds from `site/lib/seed.ts` initialize site settings, profile records, pages, pieces, custom work types, and process notes. Existing databases are upgraded through seed v5 without deleting runtime orders, projects, users, media metadata, dashboard edits, or deletion tombstones. Seed v3 and later migrations are non-destructive for existing Studio-edited content; they normalize legacy developer-email references, replace only exact stale seed wording, and remove the obsolete public Process navigation entry.

User records keep buyer email-verification state in dedicated `email_verified`, `verification_token`, and `verification_expires_at` columns. Visitor-session telemetry is persisted in the `visitor_sessions` table so the dashboard can render a world map and recent-session list without any third-party analytics dependency.

## Media system

The master media library lives outside the app bundle and outside `docker_ssd`. Production mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` directly to `/app/pics:rw`. The repo-local `pics/` folder is legacy/ignored and is not the source of truth; `MEDIA_ROOT` defaults to `/app/pics` and media scans return an empty library instead of creating a repo-local fallback when the mount is absent. The application:

- indexes that library into `media_items`
- serves files through `/media/[...slug]`
- prevents path traversal in the media route
- filters Synology and OS sidecar files such as `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and `._*`
- stores alt text, clustering, associations, focal data, zoom, cleanup mode, visual labels, source credit, display order, review state, and tags in SQLite
- can upload, rename, delete, and assign files in the mounted media root
- synchronizes reviewed piece assignments with public piece galleries while keeping unreviewed assignments private
- can create non-destructive cleaned copies under the same mounted media root when the optional OpenAI cleanup feature is configured

Media automation is provider-agnostic and local-first. `tools/media-ai-sidecar/` scans the configured library, excludes Synology/hidden sidecars, stores SHA-256 and perceptual hashes plus generated 768px review thumbnails outside the source tree, computes true image-pixel and text embeddings in a shared SentenceTransformers CLIP space, applies deterministic visual clustering, and can use Ollama or Gemini only for ambiguity arbitration. Bounded guided trainer runs resume changed or uncached files, heavy work is serialized, and partial cluster updates preserve unrelated cluster state. The compact media desk exposes Train selected, Improve page, and Continue library as the primary workflow, with raw scan/analyze/embed/cluster/rank/dry-run controls kept under Advanced actions. The status card shows provider/cache/training totals; AI-state filters, evidence and margin breakdowns, rejection memory, and J/K/F/P/U/R/I/E/C/S/Shift+S/A keyboard controls remain available.

SQLite media metadata stores analysis schema/provider/model/time, object/class/context/stage, tags and alt draft, candidate confidence/evidence, uncertainty, unsafe reason, embedding provider/model/version/hash/time, cluster ID/representative/score/label, human-review reason, accepted training labels, and rejected training labels. The ranker combines visual similarity, VLM candidate confidence, lexical overlap, verified cluster propagation, folder context, and manual priors, then subtracts negative reviewer signals. It requires a configurable minimum score and runner-up margin. Context/detail/ambiguous or reviewer-rejected matches are not proposed. Manual reviewed assignment plus accurate alt text remains the only public publishing gate.

## Commerce and operations

The commerce layer supports inventory items in the shop, asking-price presentation, cart totals, coupon handling, tax estimate, pickup/delivery/shipping labels, Stripe Checkout Session creation, Stripe invoice creation from the dashboard, and EasyPost label requests from the dashboard.

Payment capture, invoice delivery, shipping labels, and outbound email degrade safely when provider environment variables are missing. SMTP success requires acceptance of the primary recipient; transport failures are surfaced to the verification UI.

## Custom work workflow

The public custom work route is contact-first. It captures buyer contact details, location, budget, project type, material preference, fulfillment preference, attachments, optional procedural 3D scale preview data, and a written brief. Submission creates a project record, queues notifications, and redirects the buyer to a reference page.

Custom work type records still store default dimensions, material options, labor hours, and markup settings so the woodshop can maintain estimator context and future richer intake flows.

`site/components/visualizer.tsx` dynamically loads `site/components/commission-scene.tsx` only on the custom-work route. The React Three Fiber scene supports category-specific and generic templates, exact submitted dimensions, material cues, perspective/orthographic cameras, front/side/top/isometric presets, orbit/zoom/reset controls, and demand rendering. A deterministic SVG drawing and textual dimensions remain available for printing, submission, reduced motion, and WebGL failure. When `OPENAI_API_KEY` and `ENABLE_PUBLIC_AI_RENDERING=true` are configured, `/api/render-preview` can generate a photorealistic conceptual image, persist it under `/app/pics`, and attach it only when the buyer includes the preview.

## Visual archive and rendered QA

`visual-audit/` is an independent TypeScript package pinned to Playwright 1.61.0 and Sharp 0.35.3. It reconciles source routes, a token-and-admin-protected bounded database inventory, and rendered same-origin links. `live-readonly` blocks unsafe browser requests and adds a server read-only header; `snapshot-lab` uses a verified SQLite/media clone on an internal Docker network with external providers disabled.

The runner captures the required desktop/tablet/mobile/theme matrix plus a 5120 x 2880 archival viewport, deep dialog/disclosure/lightbox/Studio/media/inline-edit/visualizer states, overlapping raw tiles and stitched long surfaces, and an element atlas. It writes restricted and redacted searchable HTML/PDF editions, SHA-256 manifests, route/network/render diagnostics, tile-seam validation, and baseline comparisons. See `docs/visual-archive.md` for the exact safety and operating contract.

## Search

`searchSite()` searches across pieces, process notes, pages, media, and projects. Admin users receive private results including unpublished content, media paths, tags, cluster keys, and project records. Public users see public content only.

The search layer includes synonym expansion for common woodworking terms, material/color cues, cleanup labels, delivery, pickup, custom work, and Mackintosh or Stickley references. The browser-assisted visual search reads a reference image locally, derives color/material cues, and converts them into searchable tags.

The `site/lib/search.ts` wrapper preserves the SQLite keyword/metadata search path and can optionally use the configured local CLIP, Gemini, or OpenAI text embedding provider for semantic re-ranking. Without a reachable provider, search falls back to local keyword, metadata, and browser-derived visual tags.

## Theme and UI

The active design language is based on the Beaman Woodworks 2.0 prototypes but updated for the 3.0 client feedback:

- birds-eye maple, ebony, and white-maple palette
- persistent light/day and black OLED night theme toggle
- compact header shell that condenses on scroll and hides while scrolling down
- repaired toggle track/thumb alignment and admin-aware account/profile badge resolution
- local Mackintosh typography throughout the site
- rounded controls, compact dense form rhythm, and more legible button language
- an auto-hiding compact header that stays narrow on desktop and reduces to two rows only when viewport width requires it
- categorized portfolio tabs with icon-like labels
- dedicated Process archive replacing Journal without duplicating Process inside Shop
- account button as a rounded profile badge
- full-size lightbox overlays with zoom, pan, arrows, close button, and `Esc` support
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
- `site/lib/search.ts`: keyword search wrapper with optional embedding re-ranking
- `site/lib/payments.ts`: Stripe and EasyPost integration
- `site/lib/notifications.ts`: SMTP and notification queue handling
- `site/components/forms.tsx`: public, account, profile, and custom work forms
- `site/components/inline-edit-assistant.tsx`: capture-phase in-place editing and structural-editor handoff
- `site/components/verification-resend-panel.tsx`: email-based verification resend with accurate delivery status
- `site/components/site-chrome.tsx`: header, footer, cards, shared layout pieces, and account badge
- `site/components/header-shell.tsx`: client scroll-state wrapper that compacts and hides the header chrome during downward scrolling
- `site/components/media-picker.tsx`: visual library picker used by page, piece, and process editors
- `site/components/studio-media-workspace.tsx`: compact media-management workspace for `/studio?panel=media`
- `site/components/visitor-tracker.tsx` + `site/components/visitor-insights.tsx`: client visit logging and dashboard visitor map/list
- `site/components/visualizer.tsx`: procedural custom-work visualizer, optional AI preview trigger, legacy to-scale SVG snapshot, and estimator fields
- `site/components/commission-scene.tsx`: route-local React Three Fiber templates, cameras, lighting, dimensions, and fallback-safe scene controls
- `visual-audit/`: deterministic two-mode visual archive, reports, validation, comparison, and NAS scripts
- `docs/visual-archive.md`: visual-archive security and operations manual
- `site/app/icon.tsx`: generated favicon
- `site/app/studio/page.tsx`: private Woodshop dashboard
- `site/app/media/[...slug]/route.ts`: file-backed media serving route
- `docker-compose.synology.yml`: Synology deployment configuration
- `synology-nas-deploy.md`: deployment operations manual
