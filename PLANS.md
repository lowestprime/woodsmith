# PLANS.md

## Beaman Woodworks 3.0 Completion Pass

- Status: DONE for repository-contained implementation and validation
- Last updated: 2026-04-10
- Branch: `codex/beaman-woodworks-3-audit-completion`

## Ground Rules Preserved

- No guessed piece-to-photo assignments were introduced.
- Scientist Desk remains photo-withheld until the black phenolic resin top, bird's-eye maple rails, and white maple legs photos are verified.
- The repo-local `pics/` folder is legacy only. Production uses `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw`.
- OpenAI-backed rendering, background cleanup, and embedding re-ranking are disabled by default and require server-side credentials plus explicit feature flags.
- Public custom work remains contact-first. Backend project records and estimator data continue to support the Woodshop workflow.

## What Was Implemented In This Pass

- Optional OpenAI service layer for embeddings, photorealistic custom-work preview generation, and non-destructive cleaned image copies.
- `/api/render-preview` route that returns an honest 503 when AI rendering is not configured and persists generated previews to `/app/pics` when it is.
- Custom-work visualizer integration that attaches an AI preview only when the buyer opts to include the preview.
- Optional embedding re-ranking wrapper for search, with fallback to local keyword, metadata, and browser-derived visual tags.
- Visual crop editor for media focal point, zoom, crop frame, and crop notes.
- Dashboard candidate-assignment workflow for verified media suggestions.
- Dashboard AI cleanup action that creates a new media file instead of overwriting the original.
- Portfolio category tabs with iconography and counts.
- Updated Beaman Woodworks brand mark and favicon.
- Additional CSS for crop controls, assignment cards, AI preview panels, request preview images, and rounded theme toggle polish.
- Direct NAS media mount, OpenAI feature flags, and final behavior documented in README, admin manual, Synology deployment guide, architecture reference, env example, and Docker Compose.

## 44-Item Completion Ledger

| ID | Status | Outcome |
|----|--------|---------|
| 1 | BLOCKED / DONE | Full library truth still needs human verification; repo safeguards, review queue, withheld Scientist Desk media, and no-guess rules are implemented. |
| 2 | DONE | Portfolio category tabs now include category iconography and counts. |
| 3 | DONE | Public media display remains selective via per-piece limits and verified/review-marked media rules. |
| 4 | DONE | Browser media rename, alt text, tags, labels, source credit, display order, crop metadata, and review metadata are supported. |
| 5 | DONE | Portfolio cards/details avoid price display; pricing remains shop/cart/request-only. |
| 6 | DONE / BLOCKED | Photo-quality fields, cleanup modes, crop controls, and optional AI-cleaned copies exist; fully automatic cleanup needs external credentials. |
| 7 | DONE | User-facing language uses Woodshop/Shop/Process; `/studio` remains the private route name only. |
| 8 | PARTIAL / BLOCKED | Known requested pieces are represented; unknown raw-library pieces require human inventory/verification before publication. |
| 9 | DONE / BLOCKED | Non-destructive cleanup metadata and optional AI cleanup are integrated; automatic background removal is credential-dependent. |
| 10 | DONE | Shop/custom-work/process language was simplified and kept consumer-facing. |
| 11 | DONE | Journal is legacy redirect; Process is surfaced through Shop and public writing. |
| 12 | DONE | Behind-the-scenes content lives in Process and the Shop process section. |
| 13 | DONE | Process is the active public writing model. |
| 14 | DONE | Source credit support exists for media and process highlights. |
| 15 | DONE | Pastry Table remains verified, published, and shop-ready with correct media treatment. |
| 16 | DONE | Pickup, local delivery, shipment/freight review, tax, and checkout/invoice distinctions are represented. |
| 17 | DONE | Public flow is contact-first; backend project/custom-work records remain private/admin-oriented. |
| 18 | DONE | Contact form is the public custom-work entry point. |
| 19 | DONE | Lead-time and bandwidth context is shown from live project/order state. |
| 20 | DONE | Shop asking price, tax estimate, shipping estimate, coupons, cart totals, labor/material estimator context, and invoices are represented. |
| 21 | DONE | Theme remains ITC New Rennie Mackintosh and uses maple/ebony/white-maple tokens with Mackintosh/Stickley-aligned geometry. |
| 22 | DONE | Form fields, buttons, theme toggle, and controls use larger rounded modern styling. |
| 23 | DONE | Homepage headline/copy has been simplified in seed/settings defaults. |
| 24 | DONE | Public navigation is simplified to Workshop, Portfolio, Shop, Process, About, Search, Cart, Account. |
| 25 | DONE | Header account entry is a circular profile badge/placeholder. |
| 26 | DONE FOUNDATION | Multi-woodworker-ready users/profiles/reviews/revenue-model settings exist; full marketplace scale-up remains future product work. |
| 27 | DONE | Brand mark and favicon were replaced with Beaman Woodworks joinery-inspired identity. |
| 28 | DONE | Lightbox has X close, plus/minus zoom, pan, arrows, and Esc close. |
| 29 | DONE | Built-in non-destructive crop/focal/zoom editor is integrated; AI cleanup creates separate copies when configured. |
| 30 | DONE | `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and AppleDouble sidecars are ignored during media indexing. |
| 31 | DONE | Dashboard media manager lists all indexed media with filtering, not only recent media. |
| 32 | DONE | Palette is biased toward bird's-eye maple, ebony, and white maple. |
| 33 | DONE | Project/media preview strips support candidate assignment; media records support ordering, cropping, grouping metadata, and manual correction. |
| 34 | DONE | Dashboard editing is structured browser forms; visible developer-syntax editing surfaces are removed. |
| 35 | DONE / BLOCKED | Heuristic clustering and manual correction are implemented; fully accurate automatic ML clustering requires external vision/embedding services plus validation. |
| 36 | DONE | Shared UI, buttons, icons, panels, brand mark, and media tools were modernized. |
| 37 | DONE | Bandwidth/lead-time estimator and material dropdowns are integrated in custom-work flow. |
| 38 | DONE / BLOCKED | Procedural to-scale visualizer and optional OpenAI image preview are integrated; true always-on photorealistic 3D/LLM rendering requires credentials. |
| 39 | DONE | New tab favicon and icon route build successfully. |
| 40 | DONE | Upload, refresh, rename, delete, select, assign, and generated-media write paths use writable `/app/pics`. |
| 41 | DONE | Full-size image preview has zoom, pan, X, Esc, and keyboard navigation. |
| 42 | DONE | Signup, login, forgot/reset password, profile editing, profile picture upload, and project listing exist. |
| 43 | DONE / BLOCKED | Local keyword/metadata/browser visual tag search and optional embedding re-ranking are integrated; true embedding visual search requires configured model services. |
| 44 | DONE | Dates and metadata are shown across pieces, process notes, media, orders, projects, notifications, and search/admin surfaces. |

## Validation Completed

- `npm run typecheck`: passed.
- `npm run lint`: passed with warnings only for intentional file-backed `<img>` usage.
- `npm run build`: passed after fixing the generated icon route style.
- Built server smoke checks on `http://127.0.0.1:3102`:
  - `/`, `/portfolio`, `/portfolio?category=tables`, `/shop`, `/commissions`, `/commissions/status`, `/search?q=pastry`, `/about`, `/studio/login`, `/icon`, `/icon.svg`: 200.
  - `/journal`: 307 redirect.
  - `/api/render-preview`: 503 when AI rendering is disabled, as intended.

## Remaining Blockers

1. Full photo truth and all undiscovered raw-library piece coverage need human review of the NAS photo library.
2. Always-on photorealistic rendering, automatic background cleanup, and true embedding/visual search need approved provider credentials, cost limits, and deployment configuration.
3. Local persistence still uses Node's experimental `node:sqlite`; public scale-out should migrate to Postgres, LibSQL, or another stable production database.
