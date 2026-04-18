# PLANS.md

## Beaman Woodworks 3.0 Completion Pass

- Status: SOURCE UPDATED; live deployment still requires redeploy to match this branch
- Last updated: 2026-04-18
- Branch: `codex/live-audit-hardening-20260411`

## 2026-04-18 Studio UX + Upgrade Batch

| ID | Status | Notes |
|----|--------|-------|
| 1 (no-jump studio media) | DONE | Media actions (`uploadMediaAction`, `renameMediaAction`, `deleteMediaAction`, `saveMediaMetadataAction`, `cleanupMediaBackgroundAction`, `assignMediaCandidateAction`, `refreshMediaLibraryAction`) now return `MediaActionResult` instead of `redirect(...)`. A new client `ActionForm` component wraps each form with `useActionState`, shows inline notices, and calls `router.refresh()` on success so the UI updates in-place without scrolling to the top. Pagination uses `<Link scroll={false}>` and the filter uses a client `StudioMediaFilter` with `router.replace({scroll:false})`. |
| 2 / 13 (preview dismiss & hover-zoom) | DONE | `MediaLightbox` already closes via X button, Esc key, and backdrop click, and supports zoom + pointer-drag pan + next/prev arrows. Confirmed no regression. |
| 6 (carousel) | DONE | Portfolio piece detail now uses a scroll-snap horizontal carousel (`.piece-media-carousel`) backed by `MediaLightbox`. |
| 9 (gradient avatar) | DONE | Logged-in avatar falls back to a deterministic HSL gradient seeded by email/name via `lib/avatar.ts` + `account-badge-gradient` styles. |
| 10 (forgot password) | VERIFIED | `forgotPasswordAction` / `resetPasswordAction` already present; no code change needed. |
| 11 (email notifications) | DONE | `signupAction` now queues a signup notification email to the configured `notificationForwardEmail`/`builderEmail` via `sendNotificationEmail` (best-effort; no failure propagation). |
| 12 (legacy domain) | DONE | `ws.lowestprime.synology.me` no longer appears in source (remains only in historical PLANS.md notes). |
| 16 (scroll-margin-top) | DONE | Added `scroll-margin-top: 6rem` for studio editor cards and all `[id^="page-"] [id^="piece-"] [id^="post-"] [id^="user-"] [id^="project-"]` anchors so pencil deep-links land below the sticky header. |
| 17 (compact header) | DONE | Reduced header vertical padding and tightened brand mark/emblem sizes at desktop widths. |
| 18 (/contact) | DONE | New `/contact` route renders `ContactRequestForm`; nav updated to point at `/contact` by default. |
| 20 (featured pieces editor) | DONE | Studio settings now exposes a `homepageFeaturedPieceSlugs` textarea; `saveSiteSettingsAction` persists the ordered list. |
| 21 (bandwidth tracker) | DONE | Removed the `StatusBand` bandwidth section from the homepage. |
| 22 (search bar) | DONE | Removed `Search` nav link from seed navigation and header render; added a compact `HeaderSearch` client bar that routes submit to `/search?q=...`. |

### Tasks explicitly **NOT DONE** in this pass and why

- 4 / 5 / 7 (media picker, interactive world map, advanced media selector UX): These are larger product features requiring new Cloudflare Analytics integrations and a dedicated image-library UI; deferred so they can be designed holistically instead of shipped as half-measures.
- 3 / 15 (intuitive automated classification UI beyond pagination + candidate cards): The verification queue already exposes candidate matches; deeper redesign is pending.
- 8 (email verification link): Requires a schema migration (`emailVerified`, `verificationToken`) and a `/account/verify` route; signup notification has been added as a first step.
- 14 (all delete buttons): The seven media delete/rename/save actions now run inline; non-media delete buttons still redirect back to their panel as before — behavior unchanged and verified working.
- 19 (persistence): Already guaranteed by the existing SQLite + mounted `data/` volume configuration; no new code change required.

The sections below include historical completion notes from the 2026-04-10 pass. The 2026-04-11 live audit found that the public site at `https://ws.lowestprime.synology.me/` was still serving stale persisted content and still exposed several source/runtime regressions that this branch corrects.

## Ground Rules Preserved

- No guessed piece-to-photo assignments were introduced.
- Scientist Desk remains photo-withheld until the black phenolic resin top, bird's-eye maple rails, and white maple legs photos are verified.
- The repo-local `pics/` folder is legacy only. Production uses `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw`.
- OpenAI-backed rendering, background cleanup, and embedding re-ranking are disabled by default and require server-side credentials plus explicit feature flags.
- Public custom work remains contact-first. Backend project records and estimator data continue to support the Woodshop workflow.

## What Was Implemented In The 2026-04-11 Live Audit Hardening Pass

- Audited the live public deployment and confirmed it was still serving stale homepage copy and the legacy developer email; this branch now includes the migration path needed to replace that persisted data on next deploy/startup.
- Fixed the day/night toggle markup and CSS so the thumb stays inside the track and the control reads clearly in both themes.
- Fixed the logged-in account badge by resolving local seeded profile assets such as `profiles/cooper-beaman.svg` and by rendering a proper guest placeholder icon when signed out.
- Added admin-only pencil edit links across public sections so signed-in admins can jump directly from the live page to the matching Woodshop workspace.
- Refactored the dashboard into focused workspaces with panel-preserving redirects so saves, uploads, deletes, invoice actions, and shipping actions return to the correct panel instead of dropping back to the overview.
- Removed the remaining silent studio-login fallback that accepted an empty email and defaulted to the primary admin account.
- Added safe profile deletion from the People workspace and preserved protections for the current signed-in admin and the last remaining admin.
- Updated new draft ownership defaults and project timeline updates to use the current admin account instead of hard-coded seed emails.

## Additional 2026-04-11 Ledger Items

| ID | Status | Outcome |
|----|--------|---------|
| 45 | DONE | The dashboard is more compact and functional: it now opens on an overview and loads one focused workspace at a time instead of rendering every editor at once. |
| 46 | DONE | The day/night toggle thumb, labels, and track alignment were corrected in shared markup and CSS. |
| 47 | DONE | Logged-in avatars now render correctly for seeded local profile assets; signed-out users see a consistent circular placeholder icon. |
| 48 | DONE / DEPLOY | The legacy `lowestprime@proton.me` seed profile was replaced in active seed data, the People workspace can now delete profiles safely, and a startup migration updates persisted legacy developer references on next deploy. |

## 2026-04-11 Validation Snapshot

- `npm run typecheck`: passed.
- `npm run lint`: passed with existing `<img>` warnings only.
- `npm run build`: passed and emitted the full route table.
- Built-server smoke: `node --experimental-sqlite ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3104` returned `200` for `/` and `/studio/login`, and the `/about` HTML contained `cooperbeaman@proton.me`, `theme-toggle-thumb`, and `account-badge-placeholder`.

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

## What Was Implemented In the 3.0 AI & Audit Enhancement Pass

- **Vision-based image analysis** (`ai-services.ts`): `describeImageContent()` sends images to OpenAI's Vision API and returns structured JSON with piece type, wood species, finish, joinery, photo context, tags, and description.
- **Batch media analysis** (`ai-services.ts`): `batchDescribeMedia()` processes multiple images sequentially with the Vision API.
- **Embedding serialization** (`ai-services.ts`): `serializeEmbedding()` / `deserializeEmbedding()` for Float32Array round-tripping to JSON storage.
- **Enhanced background removal** (`ai-services.ts`): `removeImageBackground()` now explicitly prompts for pure transparent backgrounds.
- **Persistent embedding cache** (`db.ts`): New `embedding_cache` table with `saveEmbeddingCache`, `getEmbeddingCache`, `listEmbeddingsByKind`, `deleteEmbeddingCache` functions; supports caching both piece-description and media-description embeddings keyed by kind.
- **AI media metadata** (`db.ts`): `listMediaWithoutAiTags`, `markMediaAiAnalyzed`, `mergeMediaTags` enable tracking which media has been AI-analyzed and surfacing AI-generated tags alongside manual tags.
- **Embedding-augmented media audit** (`media-audit.ts`): `embeddingScore()` computes cosine similarity between cached piece and media embeddings; `buildMediaVerificationQueue()` now combines heuristic + embedding scores for suggestions. New public functions: `computePieceEmbeddings`, `computeMediaEmbeddings`, `autoAnalyzeUntaggedMedia`, `autoClusterByEmbedding`, `autoPieceToPhotoMatch`.
- **`/api/media-analysis` route**: POST endpoint accepting actions `analyze`, `embed`, `cluster`, `match`, or `full` to trigger batch AI media intelligence from the dashboard or CLI.
- **Embedding-cached search** (`search.ts`): `getQueryEmbedding` caches query embeddings; `rerankWithCachedEmbeddings` scores results using stored embeddings; `buildCandidates` includes AI-generated tags and descriptions in searchable text; `searchSite` returns `visualSearchEnabled` status.
- **Advanced client-side visual search** (`visual-search.tsx`): `describeDominantRegions()` and `analyzeImageAdvanced()` analyze subject vs. background regions for richer client-side tags.
- **Account badge avatar** (`site-chrome.tsx`, `globals.css`): `AccountBadge` displays the user's avatar image when `avatarPath` is set, with circular styling.
- **Lightbox navigation and zoom** (`lightbox.tsx`): Previous/next arrows, dynamic zoom percentage display, and item counter.
- **Studio AI status panel** (`studio/page.tsx`): Dashboard shows enabled/disabled status and model for each AI service (background cleanup, embedding search, media analysis, photorealistic rendering) with guidance on triggering batch analysis.
- **Layout CSS** (`globals.css`): Added `.shop-grid`, `.piece-detail-grid`, `.meta-grid`, `.detail-stack`, `.detail-bullets`, `.split-section` styles with responsive breakpoints.
- **Environment config** (`.env.example`): Added `OPENAI_VISION_MODEL` and `ENABLE_AI_MEDIA_ANALYSIS` entries.

## 44-Item Completion Ledger

| ID | Status | Outcome |
|----|--------|---------|
| 1 | DONE / BLOCKED | Full library truth still needs human verification; repo safeguards, review queue, withheld Scientist Desk media, no-guess rules, and AI-powered `autoPieceToPhotoMatch` with embedding+heuristic scoring are implemented. Automatic matching is available via `/api/media-analysis?action=match` when AI services are configured. |
| 2 | DONE | Portfolio category tabs now include category iconography and counts. |
| 3 | DONE | Public media display remains selective via per-piece limits and verified/review-marked media rules. |
| 4 | DONE | Browser media rename, alt text, tags, labels, source credit, display order, crop metadata, and review metadata are supported. |
| 5 | DONE | Portfolio cards/details avoid price display; pricing remains shop/cart/request-only. |
| 6 | DONE / BLOCKED | Photo-quality fields, cleanup modes, crop controls, and optional AI-cleaned copies exist; fully automatic cleanup needs external credentials. |
| 7 | DONE | User-facing language uses Woodshop/Shop/Process; `/studio` remains the private route name only. |
| 8 | PARTIAL / BLOCKED | Known requested pieces are represented; unknown raw-library pieces require human inventory/verification before publication. |
| 9 | DONE / BLOCKED | Non-destructive cleanup metadata and optional AI cleanup are integrated; `removeImageBackground` now explicitly requests transparent backgrounds. Automatic background removal is credential-dependent. |
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
| 25 | DONE | Header account entry is a circular profile badge/placeholder; displays user avatar image when `avatarPath` is set. |
| 26 | DONE FOUNDATION | Multi-woodworker-ready users/profiles/reviews/revenue-model settings exist; full marketplace scale-up remains future product work. |
| 27 | DONE | Brand mark and favicon were replaced with Beaman Woodworks joinery-inspired identity. |
| 28 | DONE | Lightbox has X close, plus/minus zoom, dynamic zoom percentage display, pan, previous/next arrows with item counter, and Esc close. |
| 29 | DONE | Built-in non-destructive crop/focal/zoom editor is integrated; AI cleanup creates separate copies when configured. |
| 30 | DONE | `SYNOINDEX_MEDIA_INFO`, `.DS_Store`, `Thumbs.db`, and AppleDouble sidecars are ignored during media indexing. |
| 31 | DONE | Dashboard media manager lists all indexed media with filtering, not only recent media. |
| 32 | DONE | Palette is biased toward bird's-eye maple, ebony, and white maple. |
| 33 | DONE | Project/media preview strips support candidate assignment; media records support ordering, cropping, grouping metadata, and manual correction. |
| 34 | DONE | Dashboard editing is structured browser forms; visible developer-syntax editing surfaces are removed. |
| 35 | DONE / BLOCKED | Heuristic clustering, embedding-based `autoClusterByEmbedding`, and manual correction are implemented; full pipeline available via `/api/media-analysis?action=cluster`. Accuracy improves with AI vision analysis enabled. |
| 36 | DONE | Shared UI, buttons, icons, panels, brand mark, and media tools were modernized. |
| 37 | DONE | Bandwidth/lead-time estimator and material dropdowns are integrated in custom-work flow. |
| 38 | DONE / BLOCKED | Procedural to-scale visualizer and optional OpenAI `gpt-image-1` photorealistic preview are integrated; true always-on photorealistic 3D/LLM rendering requires credentials and `ENABLE_PUBLIC_AI_RENDERING=true`. |
| 39 | DONE | New tab favicon and icon route build successfully. |
| 40 | DONE | Upload, refresh, rename, delete, select, assign, and generated-media write paths use writable `/app/pics`. |
| 41 | DONE | Full-size image preview has zoom, pan, X, Esc, and keyboard navigation. |
| 42 | DONE | Signup, login, forgot/reset password, profile editing, profile picture upload, and project listing exist. |
| 43 | DONE / BLOCKED | Full search pipeline: local keyword/metadata, client-side visual tag analysis, server-side AI-generated tags/descriptions in search candidates, cached embedding re-ranking via `getQueryEmbedding`/`rerankWithCachedEmbeddings`, and `visualSearchByImageTags` bridge. True embedding visual search requires `ENABLE_EMBEDDING_SEARCH=true` and `ENABLE_AI_MEDIA_ANALYSIS=true`. |
| 44 | DONE | Dates and metadata are shown across pieces, process notes, media, orders, projects, notifications, and search/admin surfaces. |

## What Was Implemented In the Bug Fix & High-Leverage Enhancement Pass

- **Lightbox robustness and a11y** (`lightbox.tsx`): Fixed mod-zero crash when `items` is empty; added `role="dialog"`, `aria-modal="true"`; restored `objectPosition` from focal-point metadata in full-size view; added body scroll lock when lightbox is open; focus management (auto-focus close, restore focus on dismiss).
- **Commission status error state** (`commissions/status/page.tsx`): Explicit "Project not found" alert when reference+email lookup fails instead of silent blank page.
- **Cart coupon UX** (`shop/cart/page.tsx`): Added notice that coupon discounts are applied at checkout; added checkout error display via query param.
- **Theme fallback** (`globals.css`): `:root` now includes default light-theme color variables so the page renders correctly when the `data-theme` cookie is absent.
- **Reduced motion** (`globals.css`): Added `@media (prefers-reduced-motion: reduce)` that disables smooth scroll, transitions, and animations site-wide.
- **Form UX** (`forms.tsx`, `actions.ts`):
  - Budget field renamed from `budgetCents` to `budgetDollars` with "$" label and server-side dollar-to-cents conversion.
  - Confirm-password field added to signup with `minLength={8}` validation.
  - Signup action: duplicate-email guard redirects to login with descriptive error; password mismatch and length checks redirect to signup with error.
  - Checkout action: missing-price items no longer throw unhandled errors; redirect to cart with user-facing error message instead.
- **File and range input styling** (`globals.css`): `input[type="file"]` and `input[type="range"]` receive themed custom styling matching the design system.
- **Visualizer notes** (`visualizer.tsx`): Added missing notes `<textarea>` to `CommissionVisualizerFields` so the `notes` field is user-editable.
- **Login error display** (`account/login/page.tsx`): Error query param now shows the actual error message instead of hardcoded text.
- **Signup error display** (`account/signup/page.tsx`): New `error` query param support with alert panel.
- **SQL-optimized media listing** (`db.ts`): `listMedia` now uses SQL `WHERE` clauses for `reviewed`, `piece_slug`, `post_slug`, and `LIKE`-based query filtering instead of loading all rows and filtering in JavaScript. Added `limit` and `offset` parameters for pagination.
- **Global error boundary** (`error.tsx`): Client-side error boundary with retry and home navigation.
- **Custom 404 page** (`not-found.tsx`): Branded 404 with portfolio/shop/search navigation.
- **Loading skeleton** (`loading.tsx`): Animated pulse skeleton for route transitions.
- **SEO metadata** (`layout.tsx`, portfolio, shop, commissions, process, about pages): Root layout includes `metadataBase`, Open Graph, Twitter card, and robots directives. Key public pages have dedicated `title`, `description`, and `openGraph` metadata. Portfolio `[slug]` uses `generateMetadata` with dynamic piece images.
- **Web app manifest** (`manifest.ts`): PWA manifest with name, icons, colors, and standalone display mode.
- **Alert panel styling** (`globals.css`): `.notice-panel[role="alert"]` with danger-colored left border.

## What Was Implemented In the Full Codebase Audit Pass

- **CRITICAL auth fix** (`auth.ts`): `getCurrentUser` was falling back to `getUserById(session.userEmail)` when email lookup failed — but sessions store emails, not IDs, so this fallback always failed silently. Removed the broken fallback; stale sessions now cleanly expire.
- **Stripe/EasyPost error handling** (`payments.ts`): `stripeRequest` and EasyPost calls unconditionally called `response.json()` on error responses. Non-JSON error responses (502s, 503s, HTML error pages) would throw unhandled parse errors instead of surfacing useful error messages. Wrapped in try/catch with status-code context.
- **Studio login hardcoded email** (`studio/login/page.tsx`): Default email was hardcoded to `woodsmithbb@proton.me` — operational leak and wrong for multi-user. Changed to empty string.
- **Studio project deep link** (`studio/page.tsx`, `studio/request/[reference]/page.tsx`): The redirect to `/studio?project=...` was broken because the studio page didn't read the `project` query param. Added `project` to searchParams, `id` attribute on project cards, and CSS highlight for deep-linked projects.
- **Reset password validation** (`actions.ts`, `forms.tsx`): `resetPasswordAction` had no password length enforcement (signup requires 8+ chars). Added server-side 8-char minimum and `minLength` to the form.
- **HTML sanitization** (`format.ts`, 4 page files): All `dangerouslySetInnerHTML` usages of `marked.parse()` and stored SVG now pass through `sanitizeHtml()` — strips `<script>`, `<style>`, inline event handlers, `javascript:` URIs, and non-allowlisted tags/attributes. Protects against stored XSS from CMS content or commission SVG data.
- **getBandwidthSnapshot double query** (`db.ts`): Called `listOrders()` twice (once for open orders, once for shipped count). Consolidated into single call.
- **listReviews SQL-side filter** (`db.ts`): Previously loaded all reviews then filtered by `pieceSlug` in JS. Now uses SQL `WHERE piece_slug = ?` when a slug is provided.
- **formatLeadTime falsy-zero** (`format.ts`): `!days` treated `0` as missing. Changed to `days == null || days < 0`.
- **Visual search error handling** (`visual-search.tsx`): `analyzeFile` had no try/catch around `createImageBitmap`/canvas APIs. Analysis failures now show a user-friendly message instead of crashing.
- **Media zoom NaN** (`actions.ts`): `Number(formData.get("zoom")?.toString() || 1)` could yield NaN with bad input. Added `|| 1` fallback.
- **About page empty name tokens** (`about/page.tsx`): `displayName.split(" ").map(part => part[0])` could crash on names with consecutive spaces. Added `.filter(Boolean)`.
- **Portfolio ARIA** (`portfolio/page.tsx`): Category filter used `role="tablist"`/`role="tab"` on navigation Links — incorrect ARIA pattern. Replaced with `<nav>` and `aria-current="page"`.
- **Search results prefetching** (`search/page.tsx`): Results used raw `<a>` tags. Switched to `next/link` `<Link>` for client-side navigation and prefetching.
- **Cart media consistency** (`shop/cart/page.tsx`): Used `piece.mediaPaths[0]` instead of `getDisplayMediaPaths()`, potentially showing unreviewed media. Now uses the same catalog helper as the shop page.
- **Unused imports removed**: `PageRecord` from `site-chrome.tsx`, `listEmbeddingsByKind` from `search.ts`, `getUserById` from `auth.ts`.
- **Home page metadata** (`page.tsx`): Added explicit `title`, `description`, and `openGraph` metadata.
- **Highlight card CSS** (`globals.css`): `.highlight-card` style for deep-linked project cards with accent outline and scroll margin.

## What Was Implemented In the Studio Crash & Media Hardening Pass (2026-04)

Root cause (from production logs `woodsmith_logs.txt`): `/media/[...slug]` used `createReadStream` on paths without an existence check. Missing files (stale DB rows, Synology `@eaDir` thumbnails, moved profile images) caused **ENOENT** and **failed to pipe response**, flooding the browser with broken image requests and exhausting RAM. The dashboard also rendered **every** media row as a full editor with eager images.

- **Safe media streaming** (`app/media/[...slug]/route.ts`): `existsSync` + `statSync` (regular file) before streaming; **404** with `Cache-Control: no-store` when missing; stream `error` handler calls `destroy()`.
- **Synology scan exclusions** (`lib/media.ts`): Skip `@eaDir` directories and files; skip paths containing `@eaDir` or `synofile_thumb`.
- **SQL exclusions** (`lib/db.ts`): `listMedia` / `countMedia` always exclude `relative_path` rows matching `@eaDir` / `synofile_thumb`; `listMediaWithoutAiTags` aligned; new **`countMedia`**, **`listMediaForProjectReferences`**.
- **Studio pagination** (`app/studio/page.tsx`): Default **48** media editors per page; `mediaPage` query param; prev/next links; verification queue uses up to **500** recent images for scoring (not the full library); project strips use **`listMediaForProjectReferences`** so thumbnails are not tied to the current page slice.
- **Lazy images** (`studio/page.tsx`): `loading="lazy"`, `decoding="async"`, `fetchPriority="low"` on dashboard thumbnails.
- **Removed live markdown preview** from `PostEditor` on the dashboard (huge HTML + `marked` per post); copy points editors to the public Process page.
- **Loading UI** (`app/loading.tsx`): Lightweight text-only global loading (no heavy skeleton animation). **`app/studio/loading.tsx`**: Studio-specific message.
- **Search caps** (`lib/db.ts` `searchSite` media loop, `lib/search.ts`): Bounded `listMedia` limits so admin search does not load unbounded media rows.

**PLANS.md tasks 30–31 / 40:** Synology junk paths are excluded from indexing and from list queries; dashboard lists are paginated (not “recent only” — still “all,” navigated by pages).

**Task 34 (full visual in-page editor, zero JSON):** **NOT DONE** in this pass — scope is a large product rewrite; current dashboard remains form-based. Crash fix and media hardening were prioritized.

## Validation Completed

- `npm run typecheck`: passed (0 errors).
- `npm run lint`: passed (0 errors, 14 pre-existing `<img>` warnings).
- `npm run build`: passed. All 31 routes compile and generate successfully.
- Built server smoke checks on `http://127.0.0.1:3102`:
  - `/`, `/portfolio`, `/portfolio?category=tables`, `/shop`, `/commissions`, `/commissions/status`, `/search?q=pastry`, `/about`, `/studio/login`, `/icon`, `/icon.svg`: 200.
  - `/journal`: 307 redirect.
  - `/api/render-preview`: 503 when AI rendering is disabled, as intended.

## Remaining Blockers

1. Full photo truth and all undiscovered raw-library piece coverage need human review of the NAS photo library. The `autoPieceToPhotoMatch` function and `/api/media-analysis?action=match` endpoint are ready to assist but require human validation of suggestions.
2. Always-on photorealistic rendering (`ENABLE_PUBLIC_AI_RENDERING`), automatic background cleanup (`ENABLE_AI_BACKGROUND_CLEANUP`), true embedding/visual search (`ENABLE_EMBEDDING_SEARCH`), and AI media analysis (`ENABLE_AI_MEDIA_ANALYSIS`) all need approved provider credentials (`OPENAI_API_KEY`), cost limits, and deployment configuration.
3. Local persistence still uses Node's experimental `node:sqlite`; public scale-out should migrate to Postgres, LibSQL, or another stable production database.
4. The `embedding_cache` table is created automatically on first access; no manual migration is needed for new deployments.
