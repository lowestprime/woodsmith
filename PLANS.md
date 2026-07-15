# PLANS.md

## 2026-07-11 Sitewide UX, Data, Commission, And Visual Archive Overhaul

- Status: IN PROGRESS ON FEATURE BRANCH; NOT DEPLOYED
- Branch: `codex/sitewide-studio-ux-commission-overhaul-20260711`

| Slice | Status | Evidence |
|------|--------|----------|
| Additive data model and compatibility | DONE / COMMITTED | `d35eb35` adds the migration ledger, normalized piece media, typed commerce policies, edit/rename history, compatibility synchronization, transactional reference rewriting, and disposable-database tests. |
| Audit and category design | DONE / COMMITTED | `30c87f6` records the evidence audit; `959a2ca` adds managed visual category icons and tests. |
| Structured Studio and public content | DONE / COMMITTED | `8b2a39b` adds structured footer/home services, typed public pricing/inquiry/review behavior, visual media selection, compact Page/Piece/Process editing, media roles, and public build records. |
| Conceptual proportional 3D preview | DONE / COMMITTED | `9e143da` adds route-local R3F templates, view/camera controls, exact dimensions, deterministic SVG/text fallbacks, demand rendering, and estimator tests. |
| Deterministic visual archive | IMPLEMENTED / LOCAL DOCKER VALIDATED; FULL CURRENT-IMAGE AND NAS VALIDATION PENDING | The QA slice adds protected bounded inventory, exact same-origin token attachment, evidence-based aborted/blocked-request classification, keyboard skip-link focus/activation, strict live-readonly and isolated snapshot-lab modes, pinned Playwright Docker, route/link reconciliation, high-resolution overlapping tiles with seam checks, deep canonical UI state capture, complete restricted searchable HTML, deterministic representative PDF/shareable atlases, checksums, diffs, locks, and retention. Chromium now uses the explicit shared-memory mount and a 512 MiB browser scratch ceiling. The latest disposable live-readonly smoke validated 310 captures across 27 routes, 54 skip-link states, 602 checksummed artifacts, 29 blocked and zero successful unsafe requests, zero unexpected diagnostics, zero cross-origin traffic, 115 restricted report representatives, and 40 shareable representatives. The repeatable clone-only snapshot lab validated 384 captures across 39 routes, exactly one commission-draft save plus cleanup delete, zero residual drafts, SQLite `quick_check`, unchanged source data/media hashes, an unchanged cloned media tree, zero unexpected diagnostics, 866 checksummed artifacts, and full cleanup. A stronger full run exposed and led to removal of an unbounded discovered-route/PDF cross-product; a fresh optimized full current-image archive remains required. NAS backup/candidate/full archive/rollback evidence remains required before deployment. |
| Typed atomic inline editing | DONE | Added a typed field registry spanning scalar, list, link, relation, media, status, and structural settings fields; trusted-origin enforcement; complete-batch validation; one SQLite transaction; optimistic expected-value conflicts; admin audit records; reset, rollback, keyboard, focus, and one-step Undo behavior. Thirty-two application tests, typecheck, lint, production build, and a disposable authenticated Chromium save/undo/reset/conflict/origin smoke pass. Final-candidate archive evidence remains a release gate. |
| Secure resumable custom requests | DONE / LOCAL DOCKER VALIDATED | Added the ten-step autosaved workflow, verified-account server drafts, idempotent server-authoritative submission, hashed submission/render quotas, private staged attachments with rollback, owner-bound generated previews, opaque project-access cookies, POST lookup without URL email, and exact dimension/category continuity into R3F. Additive schema v5, seed v6, 36 application tests, production build, image safety inspection, and disposable browser/container submission evidence pass. |
| Safe standalone and image build | DONE / LOCAL DOCKER VALIDATED | `safe-build` uses disposable build roots, excludes runtime data and test sources from Next tracing, rejects databases/backups/test files, and proves cleanup for child-failure, forbidden-output, and success paths. Docker Desktop Engine 29.6.1 and BuildKit 0.31.1 built/loaded exact candidate `woodsmith:candidate-6a1004c`; the image contains no runtime DB, env/key, test source, private evidence, audit output, or production media and starts with an empty data directory. |
| Paired runtime recovery | IMPLEMENTED / LOCAL DOCKER VALIDATED; NAS BACKUP PENDING | The production image now includes a fail-closed backup/verify/staging-restore CLI. It uses SQLite `VACUUM INTO`, copies database/media/environment state into a protected partial directory, records exact SHA-256/file-count evidence, rejects changing sources, symlinks, traversal, tampering, extra files, and overwrites, verifies `quick_check`, and compensates failed promotions. Five disposable tests pass. A Node 22 Docker proof backed up state, mutated all three sources, restored the pre-mutation database/media/environment, started the rollback-tagged app from restored mounts, served Workshop and media, rechecked SQLite, and removed every container, volume, and temporary tag. A paired restricted NAS backup and staged restore remain a pre-deployment gate. |
| Transactional media organization | DONE / LOCAL BROWSER VALIDATED | Additive schema v6 records batch/item snapshots; selected media can be moved, deterministically renamed, tagged, rated, assigned, and given normalized role/stage/visibility metadata in one compensated operation. Optimistic rollback refuses later edits, filesystem failures reverse earlier moves, legacy and normalized references stay synchronized, and optional cleanup writes unpublished source-linked derivatives only. Forty application tests plus disposable desktop/mobile browser apply/rollback and SQLite `quick_check` evidence pass. |
| Accessibility, responsive UI, and public media performance | DONE / LOCAL BROWSER VALIDATED | Added skip navigation, route-aware current navigation, high-contrast focus treatment, focus-safe auto-hide header behavior, modal focus containment/restoration, keyboard/touch bounded lightbox pan and zoom, announced carousel position, 24px target protection, and hydration-safe persistent themes. Public portfolio/shop/carousel thumbnails now use responsive Next image requests while the full-screen viewer retains the source file; raw media supports ETag/Last-Modified revalidation. Disposable browser QA passed at 1440, 390, and 320px in both themes with zero horizontal overflow, zero unnamed/unlabelled controls, no duplicate IDs/heading skips/missing alt text, and tested base/muted contrast above AA thresholds. |
| Remaining product work | PENDING | Final documentation review, full visual-archive evidence, exact release artifact, restricted NAS backup and staged-restore proof, candidate deployment, production rollback/persistence checks, and post-deployment verification remain active. |

## 2026-07-05 Local-First Media AI, Header, and Persistence Pass

- Status: LIVE DEPLOYED AND VERIFIED ON SYNOLOGY
- Branch: `codex/local-first-media-ai-20260705`

### 2026-07-06 Compact Header, Dense Layout, and Page Persistence Hardening

- Status: LIVE DEPLOYED AND VERIFIED ON SYNOLOGY
- Branch: `codex/local-first-media-ai-20260705`

| Area | Status | Outcome |
|------|--------|---------|
| Header compactness | DONE / LIVE VERIFIED | Added a stricter final CSS contract and scroll controller thresholds so the global header stays narrow, hides on downward scroll, reveals on upward scroll/focus/pointer entry, suppresses the subtitle in the header, clips older oversized emblem overrides, and keeps scroll-restored Studio anchors below the compact header. Local and live browser verification measured a 50px initial desktop header, 41px compact revealed header, hidden top position at -45px after downward scroll, and zero horizontal overflow at 1280px. |
| Dense spacing | DONE / LIVE VERIFIED | Tightened page sections, Studio command headers, dashboard metric cards, workspace pills, editor panels, form gaps, field heights, and grid gaps so public pages and Studio workspaces avoid unnecessary long-scroll layouts while preserving responsive wrapping. |
| Rebuild-safe page edits | DONE / LIVE VERIFIED | Made the legacy v3 seed-upgrade path non-destructive for existing Studio-edited records, added an admin Persistence card with `DATA_ROOT`, SQLite `quick_check`, journal mode, seed version, and writable-state evidence, explicitly forced the app shell to dynamic rendering, and revalidated the dynamic `[slug]` route pattern after page saves. Local browser verification saved a disposable home-page edit into a copied SQLite database, saw it render on `/`, restarted the app with the same `DATA_ROOT`, and saw the edit persist. The live deploy uses the same mounted `/app/site/data` model; internal route and mount checks passed after redeploy. |

Deployment evidence: release `releases/woodsmith-prod-2026-07-06-172702.tar.gz` passed gzip validation with SHA-256 `32CAF1F5FB55FACD28ED63557F49450E9A7844A405E2D516928CACE296DE8E0D`; pre-deploy backup `site/data/backups/woodsmith-pre-header-persistence-20260706-172702.sqlite` passed `PRAGMA quick_check`; Synology image ID is `sha256:5fd378749fce79998b7240423a7261278a143d850fbd10c4fdd49b3d297f5def`; writable data/media/cache and static asset checks passed; internal `/`, `/studio/login`, `/contact`, `/portfolio`, and `/shop` returned 200; public `https://woodmat.ch/` returned 200 and `https://www.woodmat.ch/studio/login` redirected to canonical `https://woodmat.ch/studio/login`.

### 2026-07-06 Guided Trainer and Manual-Learning Hardening

- Status: IN PROGRESS
- Branch: `codex/local-first-media-ai-20260705`

| Area | Status | Outcome |
|------|--------|---------|
| Studio trainer simplification | DONE / VALIDATION PENDING | Replaced the visible implementation button wall with a guided trainer card, **Train selected**, **Improve page**, **Continue library**, **Refresh status**, and an optional Cancel button while moving raw Scan/Analyze/Embed/Cluster/Rank/Preview controls under Advanced actions. The status card now explains local provider availability, cache totals, indexed media, accepted/rejected training labels, analyzed files, vectors, and clusters without requiring users to interpret separate provider cards. |
| Manual-learning ranker | DONE / VALIDATION PENDING | Reviewer-accepted assignments, reviewer-rejected suggestions, verified cluster neighbors, and verified same-folder history are now first-class durable training signals. The ranker uses lower raw visual weight, stronger manual/cluster/folder priors, and a negative reviewer penalty so future suggestions improve from manual classification without enabling automatic assignment or publication. |
| Persistence and documentation | DONE / VALIDATION PENDING | Accept/reject actions now persist training labels in SQLite metadata. README, admin manual, Synology deployment notes, sidecar README, and architecture docs describe the guided trainer and training-weighted ranking model. |

| Area | Status | Outcome |
|------|--------|---------|
| Compact auto-hide header | DONE | Added a final CSS contract after all historical layers so the desktop header is one narrow row, responsive layouts use at most two compact rows, subtitle and oversized emblem overrides cannot return, scroll-down hides after a small threshold, scroll-up/focus reveals, and reduced motion is respected. |
| Rebuild-safe page persistence | DONE | Added explicit absolute `DATA_ROOT`, wired `/app/site/data` through Compose, retained seed tombstones, fixed full-page forms so intentional empty values are saved instead of replaced by stale values, and kept route/layout revalidation. Deployment verification must confirm the mounted database rather than an image-local copy is active. |
| Provider abstraction | DONE | Replaced the OpenAI-centered classification path with local-sidecar, Ollama, Gemini, and explicitly enabled OpenAI adapters behind one registry and honest per-provider runtime status. Public image generation/cleanup remains separately gated. |
| Local pixel embeddings | DONE | Added a Python 3.11 sidecar with bounded/resumable scans, SHA-256/perceptual hashes, cache outside the media tree, true SentenceTransformers CLIP image/text vectors, CUDA/CPU fallback, path containment, optional bearer auth, and per-item errors. |
| Rich analysis and persistence | DONE | Added the Woodsmith media schema and persisted provider/model/version/hash/time, object/class/context/stage, alt draft/tags, candidate evidence, uncertainty, unsafe reason, cluster membership/representative/score, and review reason in SQLite metadata. |
| Deterministic matching safety | DONE | Added configurable weighted visual/VLM/lexical/cluster/folder/manual scoring, minimum score and runner-up margin, reviewer rejection memory, context/detail safety exclusion, and verified-representative-only cluster propagation. No automation path assigns or publishes media. |
| Media API | DONE | `/api/media-analysis` now supports authenticated status, scan, analyze, embed, cluster, match, full, cancel, and dry-run actions with provider/scope/limit controls, run IDs, timing, warnings, per-item errors, and next-action guidance. Work is honestly synchronous and bounded. |
| Compact Studio automation UX | DONE | Added provider cards, safe-mode toggle, selected/current-page actions, selection controls, AI-state filters, thumbnail overlays, evidence breakdowns, AI notes/draft-copy controls, cluster inspection, rejection controls, and I/E/C shortcuts while preserving existing panes, lightbox, dirty-state, paging, and save/approve workflow. |
| Resumable sidecar hardening | DONE | Whole-library scan, analysis, embedding, and clustering batches now advance past current records instead of repeating the first batch; generated thumbnails live in the external cache; SQLite access is serialized; selected-path failures remain per-item; and partial cluster updates preserve unrelated cached memberships. |
| Bounded library automation | DONE | API scope handling now keeps selected-only runs selected-only, reloads newly persisted analysis before ranking, reports stage-specific skipped/error counts, and advances unembedded or unclustered media on each library batch. Studio exposes cache totals, provider/model/timestamp/uncertainty evidence, include-reviewed scope, run summaries, and a dedicated next-library-batch action without losing provider status after a run. |
| Documentation and tests | DONE | Updated environment/deployment/admin/architecture docs, added weighted-scoring tests and sidecar scan/health tests, and documented Windows/WSL/GPU/manual-only operation. |

Rendered verification used a disposable external `DATA_ROOT`: a Studio page edit survived a full browser reload and an application-process restart. At 390 x 844 the header rendered at 80px initially, compacted to 44px, moved fully off-screen on downward scroll, returned on upward scroll, and introduced no horizontal overflow. The Studio media workspace rendered its provider controls, paged cards, AI state, and inspector without horizontal overflow. Final static gates passed on Next.js 16.2.10: typecheck, three deterministic scoring tests, two Python sidecar tests, lint with no errors, production build, npm audit with zero known vulnerabilities, and Synology Compose validation.

Live deployment verification completed on 2026-07-05. SQLite was backed up and passed `PRAGMA quick_check` at `site/data/backups/woodsmith-pre-local-ai-20260705-201844.sqlite`. Candidate image `sha256:8427c56b4a9e2f5c2f458bf87e6255f851360efd66d5bebb8e6c81615b987de3` passed isolated route, permission, and no-embedded-database checks before promotion; the previous image remains tagged `woodsmith:rollback-local-ai-20260705-202707`. The running container uses writable direct mounts for `/app/site/data`, `/app/pics`, and the Next image cache. Internal and public checks passed for Workshop, Portfolio, Shop, Contact, Studio login, and a mounted full-resolution media path. `woodmat.ch` and `www.woodmat.ch` return 200. Live desktop/mobile testing confirmed compact auto-hide/reveal behavior, zero horizontal overflow at 390px, and no new browser-console or container errors.

Follow-up hardening release `6051eca` was deployed and verified on 2026-07-06. The online SQLite snapshot `site/data/backups/woodsmith-pre-media-ai-final-20260706-012928.sqlite` and the live mounted database both passed `PRAGMA quick_check`; release `releases/woodsmith-prod-2026-07-06-013102.tar.gz` passed gzip integrity validation with SHA-256 `05CD907B71870C45E335CF28EF22D5ED16BD8F6633C2318E5DA7D7695CD45C93`. The isolated NAS candidate passed five routes, writable data/cache checks, readable media, clean logs, and the no-embedded-database gate before promotion. Synology is running amd64 image `sha256:f8f3c407a28983d01c5e037711f14ba58a4c25813c55cf960e37b69fab99039b`; rollback image `sha256:de911b173ca2f83b50f6eefc41454a1ef8bf28515e048a29da3d33188fb54742` remains tagged `woodsmith:rollback-media-ai-final-20260706-0132`. Authenticated live Studio verification found 12 automation actions, five provider/cache cards, 48 loaded media cards, zero broken images, zero console warnings, in-place Status execution without reload/scroll loss, no desktop/mobile overflow, and correct 80px-to-hidden-to-44px mobile header behavior. The configured local sidecar health endpoint returned 200 from the production container.

Current model configuration follows official provider documentation checked on 2026-07-05: Gemini 3.1 Flash-Lite is the stable cost-oriented multimodal fallback, Gemini Embedding 2 is the optional multimodal embedding model, Ollama structured vision accepts JSON schema, and SentenceTransformers documents `sentence-transformers/clip-ViT-B-32` for shared image/text search. These are environment defaults, not hard requirements; every cache key records provider/model/version and model changes require re-embedding.

## Beaman Woodworks 3.0 Completion Pass

- Status: LIVE DEPLOYED AND VERIFIED ON SYNOLOGY
- Last updated: 2026-07-04
- Branch: `codex/studio-media-audit-20260704`

## 2026-07-04 Studio Media Integrity and Efficiency Audit

| Area | Status | Verified outcome |
|------|--------|------------------|
| Whole-library navigation | DONE | Replaced route-submit pagination and page-only filtering with authenticated server-action paging, debounced whole-library search, assignment/type filters, selectable 24/48/72/96 page sizes, URL-restored filter state, and race-safe in-place results. |
| No-refresh editing | DONE | Routine upload, rename, delete, assignment, metadata, and save/approve-next actions update local workspace state without `router.refresh()` or `/studio` revalidation. Scroll position and active workspace state remain intact. Explicit library rescans and automation refresh the page data and verification queue through server actions. |
| Review queue accuracy | DONE | Candidate inspection no longer assigns automatically. Each unassigned image is proposed only to its best sufficiently separated piece match; ambiguous or weak matches remain unassigned. Off-page candidates open in a detached inspector, and assignment remains an explicit reviewed action. |
| Metadata and gallery integrity | DONE | Piece membership is synchronized on assign, move, unreview, delete, upload, and display-order change. Stale piece/process/page options are rejected. Public approval requires alt text, and verified-piece metadata derives from the selected piece rather than a manually typed slug. |
| File and index safety | DONE | Same-name rename is a no-op, collisions are rejected before overwrite, destructive delete requires confirmation, sidecar exclusions cover Synology, macOS, and Windows artifacts, and modern camera image extensions are indexed consistently. |
| Inspector and keyboard workflow | DONE | Added full-resolution lightbox access, correct focus restoration, Save, Save & next, Approve & next, dynamic thumbnail roving focus, and `S` / `Shift+S` / `A` shortcuts. Thumbnails use optimized responsive image requests and offscreen rendering containment; narrow screens use a fixed-height Tools / Library / Inspector switcher instead of stacking three long panes. |

Verification for this pass: `npm run typecheck`, `npm run lint`, and `npm run build` pass; `npm --prefix site audit --audit-level=high` reports zero vulnerabilities; Synology Compose configuration validates. Authenticated Playwright testing first used a disposable standalone SQLite copy for save-and-next persistence, then the final image was deployed to `woodmat.ch` and audited without mutating production records. Live evidence: 48/48 visible thumbnails loaded, zero broken images or console errors, 511 indexed records, zero duplicate candidate paths, in-place search produced seven matching records with one navigation entry, assignment/type/query state survived reload, candidate inspection remained unassigned, lightbox X/zoom/`Esc` and focus restoration passed, J/K navigation passed, desktop showed three panes with zero overflow, and mobile showed one 608px pane with automatic Inspector handoff and zero overflow. The NAS reported writable data/media/cache mounts and 3,653 source files. Release `woodsmith-prod-2026-07-04-020739.tar.gz` was integrity-checked before load; a pre-deploy SQLite backup was created at `site/data/backups/woodsmith-pre-media-audit-20260704-020829.sqlite`.

## 2026-07-02 Feature Queue Completion and Verification

| ID | Status | Verified outcome |
|----|--------|------------------|
| 1. Public navigation and Process/Shop separation | DONE | Removed Process from seeded and rendered primary navigation, removed the Process/behind-the-scenes block from Shop, preserved the dedicated `/process` archive and legacy Journal redirects, and added seed v5 exact-string cleanup for persisted legacy copy. |
| 2. Buyer email verification | DONE / CONFIGURATION REQUIRED | New accounts receive expiring verification tokens, unverified customer login is rejected, resend accepts an email without an authenticated session, SMTP acceptance is checked for the primary recipient, and UI errors distinguish configuration/authentication/sender/connection failures. Live dispatch still requires valid `SMTP_*` credentials and sender values. |
| 3. Direct visual editing | DONE | Admin pencil controls intercept in capture phase and edit mapped public fields in place without navigation or full-page refresh. The typed registry drives the server allowlist; saves are atomic, audited, conflict-aware, origin-protected, and reversible. Route changes clear stale editor state; structural edits use the explicit visual full-editor handoff. No raw JSON control is exposed. |
| 4. Compact media assignment desk | DONE | Replaced the long media editor stack with a bounded three-pane workspace: utility tools, paged responsive thumbnail browser, and one active inspector. Added whole-library search, assignment/type filters, collapsed upload/automation/crop sections, and in-place action state. |
| 5. Media assignment integrity | DONE | Reviewed assignments now remove stale old-piece gallery membership and add new-piece membership. Unreviewed assignments remain private. Refresh/cluster tools run locally without AI credentials; the AI route requires admin authentication. |
| 6. Keyboard media workflow | DONE | J/K navigate visible media, F focuses whole-library search, P focuses piece assignment, U clears it, R toggles review state, S saves, Shift+S saves and advances, A approves and advances, and roving tab stops keep one active thumbnail keyboard-focusable. |
| 7. Editable portfolio categories | DONE | Added persisted category definitions with icon styles and matching aliases. Studio supports add, rename, save, safe delete/reassign, and the portfolio and piece editor consume the same normalized definitions. |
| 8. Shop reserve coverage | DONE | Available inventory now exposes the asking price and Reserve action on both Shop cards and portfolio piece detail pages; portfolio index cards remain price-free. |
| 9. Visual and operational cleanup | DONE | Removed decorative divider bands and the obsolete divider-name setting, enlarged the brand emblem, standardized scrollbars, tightened responsive page/admin grids, and compacted the Studio command header. |

Verification for this pass: `npm run typecheck`, `npm run lint`, and `npm run build` pass on Next.js 16.2.10. `npm audit` reports zero known vulnerabilities after updating Nodemailer/ESLint and overriding Next's same-major PostCSS pin to 8.5.16. Authenticated browser QA covered desktop/mobile public navigation, header scroll behavior, Shop separation, piece-detail reservation, category management, compact media layout, and J/K keyboard navigation. The user-referenced development transcript was not present in the workspace or the supplied local paths, so no claims from that transcript were used.

## 2026-04-19 Verification + No-Jump Studio + Ranked Review Queue

| ID | Status | Notes |
|----|--------|-------|
| 8 (email verification link) | DONE | Added `email_verified`, `verification_token`, `verification_expires_at` columns to the `users` table with a backwards-compatible `ensureUserVerificationColumns` additive migration (PRAGMA table_info + ALTER TABLE). Added DB helpers `setEmailVerificationToken`, `markEmailVerified`, `getUserByVerificationToken`. `signupAction` now issues a 48h-expiry token and emails a confirm link to the new user. Added server action `verifyEmailAction(token)` and `resendVerificationAction` for signed-in users who haven't verified. New public route `/account/verify/[token]` confirms the address and shows a clear outcome. Profile page shows a "Your email is not verified" alert + resend button for unverified users and a success banner after signup. Docs/examples unchanged (no new env required — existing `SMTP_*` transport already used via `sendNotificationEmail`). |
| 14 (all delete/save studio buttons jump to top) | DONE | Introduced `components/studio-form.tsx` `StudioScrollRestore` client component mounted inside a `data-studio-root` wrapper on `/studio`. It uses delegated `submit` capture on `document` to save `window.scrollY` + nearest `id="(page|piece|post|user|project|order|commission|review|media)-*"` anchor to `sessionStorage` before navigation, and on mount restores by scrolling to the anchor (or raw Y) and then clears the entry. This preserves scroll for EVERY studio form (pages, pieces, posts, people, commissions, settings, projects, orders, reviews) — no per-form refactor needed. Expires entries after 30 s to avoid cross-session leaks. |
| 3 / 15 (automated classification UX) | DONE | Verification queue now shows: (a) a count of pieces still needing review at the top, (b) the top-candidate score in the card with a qualitative label (high/moderate/low confidence), (c) color-coded score badges (`.is-strong` green / `.is-moderate` amber / `.is-weak` grey) on each candidate, (d) more descriptive `title` tooltips on assign buttons, and (e) highlighted "needs review" copy. The underlying `buildMediaVerificationQueue` (heuristic + optional embedding scoring) is unchanged. |

## 2026-04-19 Mobile Overflow + Lightbox Stacking Fix

| ID | Status | Notes |
|----|--------|-------|
| M1 (viewport horizontal overflow on mobile) | DONE | Added `overflow-x: hidden` to both `html` and `body`, `max-width: 100vw` on both, and `min-width: 0` on `.header-inner`, `.site-nav`, `.brand-lockup`. Also `white-space: nowrap; text-overflow: ellipsis` on brand text so the header can no longer push the viewport wider than its own width. Fixes IMG_9361 where the whole page had horizontal scroll and content was clipped on the left/right. |
| M2 (mobile header actions clumped left, large empty space on right) | DONE | Rebuilt the `≤720px` header as a two-row grid: row 1 `brand` + `actions` (right-aligned via `justify-self: end`), row 2 full-width `nav` with horizontal scroll. On `≤420px` the brand mark text is hidden (emblem only) and the cart label text hides so only the count badge remains. Nav row auto-collapses when `.site-header.is-compact` so scrolling gives back vertical space. |
| M3 (site header rendered above the media lightbox on mobile) | DONE | Root cause: `main { z-index: 1 }` created a stacking context that capped every descendant (including the lightbox with `z-index: 9999`) below the sibling sticky header (`z-index: 30`). Removed the `z-index: 1` from `main` and now render `MediaLightbox` via `createPortal(..., document.body)` so it is mounted outside any parent stacking context. The lightbox overlay + close button now reliably cover the header on every device. Fixes IMG_9363. |

## 2026-04-19 Persistence + Header Hardening Pass

| ID | Status | Notes |
|----|--------|-------|
| 1 (theme switch parent bar) | DONE | `ThemeToggle` rewritten as a single circular icon button (`.theme-toggle-icon`) with no surrounding text/track. Removed the `.theme-toggle`, `.theme-toggle-state`, `.theme-toggle-track`, `.theme-toggle-thumb` styles. |
| 2 (single/two-row header w/ horizontal scroll) | DONE | `.site-nav` now `flex-wrap: nowrap; overflow-x: auto` with thin scrollbar so the nav row stays a single line on small layouts and scrolls horizontally. Header collapses to two rows max via `auto / 1fr / auto` grid. |
| 3 (X + click-outside-to-dismiss preview) | DONE | `MediaLightbox` already supported Esc + backdrop click + X. The X button is now `position: fixed`, `z-index: 10000`, with safe-area-inset offsets so it always sits above the sticky header on mobile. |
| 4 (X on media selection blocked by header) | DONE | Lightbox `z-index: 9999` (>>> the header's `z: 30`); close button `position: fixed` with `env(safe-area-inset-top/right)`. Verified on mobile widths via the same media path used by portfolio pieces. |
| 5 / 10 (studio edits not persisted across rebuilds) | DONE | Added `seed_tombstones` table + helpers (`recordSeedTombstone`, `clearSeedTombstone`, `isSeedTombstoned`). Every seed `INSERT OR IGNORE` loop in `seedDefaultContent` and the v3 migration's blanket re-saves now skip records present in the tombstone log. Every `delete*` writes a tombstone; every `save*` clears the matching tombstone. SQLite volume + tombstones together preserve every studio edit/deletion across rebuilds. |
| 6 (default Footstool/End Table/process notes resurrected) | DONE | Same tombstone mechanism: deleting `footstool`, `end-table`, `nakashima-soul-of-a-tree`, `cabinet-interiors`, `joinery-before-hardware`, `small-furniture` from Studio is now persistent across rebuilds because seedDefaultContent skips tombstoned slugs. |
| 7 (added/removed pages don't reflect on live site) | DONE | (a) `savePageAction`/`deletePageAction` and the piece/post action variants now call new `revalidatePagePaths` / `revalidatePieceSurfaces` / `revalidatePostSurfaces` helpers that revalidate `layout`, `/`, and the dynamic page route. (b) `SiteHeader` automatically appends published pages whose slugs are not reserved/seeded into the primary nav, so a page added in Studio appears in the header on next render. |
| 8 (header too big, no auto-hide) | DONE | New `HeaderShell` client wrapper toggles `is-compact` (when scrollY > 64) and `is-hidden` (when scrolling down past 200px). Compact mode shrinks the brand emblem, drops the subtitle, and tightens vertical padding. Hidden mode slides the header off-screen via `transform: translateY(-100%)`; it slides back on scroll-up. |
| 9 (compact unified spacing site-wide) | DONE | Tightened `--space-*` tokens (e.g. `--space-16: 4rem → 3.25rem`), reduced `.page-section`/`.hero-section` padding, shrank `.button-primary/.button-secondary` (3.2rem → 2.4rem), `.nav-link-pill` (2.8rem → 2.2rem), `.account-link/.account-badge`, header search bar height. |
| 11 (legacy domain) | DONE | Confirmed; legacy domain only present in historical PLANS.md notes. |

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
- 3 / 15 (intuitive automated classification UI): shipped in the 2026-04-19 ranked-review pass — see new ledger above; deeper AI-driven auto-approve loop remains future work.
- 8 (email verification link): shipped in the 2026-04-19 verification pass — see new ledger above.
- 14 (all delete buttons): shipped in the 2026-04-19 no-jump-studio pass — see new ledger above; all studio forms now preserve scroll.
- 19 (persistence): Already guaranteed by the existing SQLite + mounted `data/` volume configuration plus the `seed_tombstones` log from the persistence pass; no new code change required.

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
