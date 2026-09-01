# Beaman Woodworks Sitewide UX and Data Audit

Date: 2026-07-11  
Branch: `codex/sitewide-studio-ux-commission-overhaul-20260711`  

Rendered verification for this overhaul is now provided by the pinned two-mode system documented in `docs/visual-archive.md`. Its evidence contract covers source/database/rendered-link inventory, read-only live capture, isolated mutation-state capture, required themes and viewports, deep Studio/media/inline-edit/visualizer states, overlapping raw tiles, stitched surfaces, restricted/redacted HTML and PDF reports, checksums, and baseline comparison. Deployment remains gated on a passing final-candidate smoke and full archive.
Baseline commit: `81b35c4b97d464a388560c13c1526b78c10afa45`

This document records the verified baseline used for the sitewide overhaul. Documentation claims were treated as hypotheses and checked against source, a disposable SQLite backup, supplied screenshots, and read-only production requests.

## Evidence

- Supplied screenshot 1, Studio category editor: 1773 x 1417 source pixels.
- Supplied screenshot 2, footer: 3703 x 1119 source pixels.
- Supplied screenshot 3, Portfolio filters: 3703 x 1247 source pixels.
- Supplied screenshot 4, home services/process section: 3703 x 2295 source pixels.
- Production origin checked read-only: `https://woodmat.ch`.
- Production headers reported Next.js behind Cloudflare with private/no-store HTML responses.
- Repository baseline: Next.js 16.2.10, React 19.2.0, TypeScript 5.8.3, ESLint 9.39.4, Node `node:sqlite`, Three.js 0.183.2, React Three Fiber 9.5.0, Drei 10.7.7.
- Disposable SQLite backup passed `PRAGMA quick_check` before and after migration testing.
- Source media inventory supplied by the user includes Synology `@eaDir`, `SYNOPHOTO_*`, `SYNOINDEX_*`, Motion Photo metadata, and recovery/temp artifacts that must never be surfaced.

## Architecture Baseline

| Area | Verified implementation | Risk or discrepancy |
| --- | --- | --- |
| Routing | Next App Router under `site/app`; dynamic public page, piece, media, request, and account routes | Route-level loading/error coverage is inconsistent |
| Rendering | Server components by default; client components for theme, header behavior, inline editing, media desk, lightbox, and visualizer | Global `force-dynamic` avoids stale SQLite content but increases repeated database work |
| Styling | `globals.css`, `refinements.css`, `brand-emblem.css`, then `ui-repair.css` | Repeated contracts and late `!important` rules make spacing and header behavior difficult to reason about |
| Persistence | SQLite at `DATA_ROOT/woodsmith.sqlite`, WAL mode, seed tombstones, direct NAS mount | Baseline had no schema migration ledger and startup seed-media synchronization could reverse manual decisions |
| Media | Direct writable `MEDIA_ROOT=/app/pics`, synchronous scan, SQLite metadata, paged Media Desk | Piece relations were duplicated between `pieces.media_paths_json` and `media_items.piece_slug`; no roles/stages |
| Authentication | Admin, woodworker, and customer roles; cookie-backed sessions; email verification/reset fields | Guest project access still relies on reference plus email in URL and requires a separate security slice |
| Inline editing | Public edit targets plus hard-coded API allowlists | Not typed, structural fields missing, multi-patch saves non-atomic, no durable audit trail at baseline |
| Commerce | Cart, totals, optional Stripe/EasyPost, graceful provider degradation | Nullable/negative prices could reach public/cart flows; no typed pricing policy at baseline |
| Commission preview | SVG and CSS pseudo-3D with estimator fields | Installed R3F/Drei/Three stack was unused; hidden fields were client-authoritative |
| Deployment | Synology Compose mounts data, media, and Next image cache; Cloudflare canonical origin | A container started outside authoritative Compose can still create disposable image-local data |

## Route Matrix

| Surface | Baseline state | Required correction |
| --- | --- | --- |
| `/` | Public hero, featured work, inert service cards, Process promotion | Linked services; commissioned-build section; compact responsive rhythm |
| `/portfolio` | Query-deep-linked filters and all published pieces | Compact icon rail, extensible icons, pagination/load-more, stable image sizing |
| `/portfolio/[slug]` | Gallery, unconditional inquiry and reviews, ambiguous price | Typed policy gating, normalized gallery, optional build record |
| `/shop` | Inventory pieces and unconditional reserve controls | Fixed-price-only cart controls and distinct inquiry-only work |
| `/shop/cart` | Silently filters null-priced items | Reject non-fixed entries at every server boundary and explain invalid lines |
| `/commissions` | One long contact form with CSS/SVG pseudo-3D | Primary multi-step journey and dynamically loaded real R3F preview with SVG fallback |
| `/commissions/status` | Reference/email lookup | Preserve behavior while replacing URL email capability in security slice |
| `/contact` | Duplicates commission form | Concise general contact and handoff to primary commission flow |
| `/about` | Public people/contact content | Preserve credits, use structured editable contact/footer models |
| `/care-and-warranty` | Dynamic page | Preserve and make structural content editable |
| `/search` | Public/private search boundary | Preserve authorization; add policy-aware labels and normalized media metadata |
| `/process`, `/process/[slug]` | Optional archive | Retain archive, remove home promotion, separate process media from finished galleries |
| `/account/*` | Signup, login, verify, forgot/reset, profile, projects | Preserve; later harden draft/resume and guest project access |
| `/requests/[reference]` | Buyer/project dossier | Preserve privacy checks; add high-entropy guest capability in security slice |
| `/studio/login` | Admin entry | Preserve noindex and session protections |
| `/studio` | One panel at a time, but many panels mount every editor expanded | Master-detail editors, in-place saves, visual media relations, consistent dirty/saved states |
| `/media/[...slug]` | Full-resolution mounted media route | Reject all sidecar/temp paths even when directly requested |
| 404/loading/error | Custom 404 plus generic loading | Add route-level actionable error states and preserve compact shell |

## Studio Panel Matrix

| Panel | Baseline finding | Priority |
| --- | --- | --- |
| Overview | Useful persistence and provider summary; oversized/redundant metrics | Medium |
| Settings | Partial brand/home fields only | High |
| Pages | Every page fully expanded; raw hero path | Critical |
| Pieces | Every piece fully expanded; raw gallery paths; no typed public policy controls | Critical |
| Categories | Five-value native icon select; no order/visibility/custom SVG | Critical |
| Custom | Commission types lack category/template/range constraints | High |
| People | Raw avatar path in Studio | High |
| Process | Raw cover path and long editor list | High |
| Media | Strong in-place three-pane foundation and guided trainer | Preserve and extend |
| Projects | Existing stages and attachments | Add visual role/stage relations and stronger access capability |
| Orders | Provider-aware operations | Enforce typed fixed-price policy |
| Reviews | Admin moderation exists | Gate public display/submission per piece |
| Notifications | Durable queue exists | Preserve provider-degradation truth |

## Screenshot Defects

1. Portfolio filters use large pill containers, circular count badges, fragile CSS `<i>` icons, excessive wrap height, and weak count hierarchy.
2. Category editing exposes a giant native select with only Table, Bench, Stepstool, Cabinet, and Object choices. It lacks a visual gallery, custom SVG, public preview, order, and visibility.
3. Home service cards are inert articles and expose a private dashboard as a public service. The next section promotes Process rather than commissioned builds.
4. Footer contact lines use literal dot separators inside layout rules that can split each token into its own row. GitHub is duplicated and most footer structure is hard-coded.

## Data Findings

- Baseline local production-like backup contained 26 pieces, 426 indexed media rows, 10 projects, 7 pages, 2 users, no orders, and no reviews.
- Legacy piece JSON contained 196 media references. Three paths had no indexed media row; those were reported and left unmapped.
- Nine pieces used negative price sentinels and one used zero. They were not valid public money values.
- Piece/media assignment was duplicated and frequently inconsistent between piece JSON and media rows.
- Startup reapplied seed media relationships and forced `reviewed=1`; this could reverse an administrator's later unassignment or review decision.
- Related writes had no transaction wrapper, referential integrity was disabled, and destructive media operations lacked a durable rename ledger.
- WAL is part of the acknowledged database state. Backups must use SQLite online backup or include WAL/SHM consistently; copying only the main file is not sufficient while live.

## Data Slice Implemented

Commit `d35eb35` introduces:

- `schema_migrations` with identity checks and per-migration reports;
- `piece_media_links` with role, stage, date, caption, alt override, order, public state, and compatibility provenance;
- typed price, inquiry, and review policy columns and helpers;
- `admin_edit_audit` and `media_rename_history`;
- non-destructive legacy media backfill;
- conservative pricing conversion: positive values become fixed, available inventory sentinels become contact-for-price, all other sentinels become not-listed;
- fixed-price-only cart enforcement at server actions and local reservation API;
- transactional reference rewrites with physical rename rollback and staged deletion;
- sidecar/temp filtering expansion;
- startup seed assignments limited to a genuinely new database;
- disposable migration, rollback, policy, and rename tests.

Production-like disposable migration result: 26 pieces retained, 193 normalized valid links, three stale links reported, zero destructive legacy-column removal, schema version 3, and `PRAGMA quick_check=ok` after two application starts.

## Accessibility Baseline

- Present: semantic landmarks, labels on most controls, lightbox Escape/close/zoom, reduced-motion rule, no observed 320/390 page overflow in read-only live checks.
- Missing or incomplete: skip link/main target, consistent `:focus-visible`, active primary navigation state, modal focus trap/inert background, keyboard panning, structural-editor keyboard alternatives, contextual error association, and 200 percent reflow evidence.
- Header focus listener was attached globally and could reveal the sticky header when focus moved anywhere on the page.

## Performance Baseline

- Portfolio renders every published piece and raw originals, producing very long mobile pages and oversized downloads.
- Homepage can render too many featured cards.
- Media Desk pages the main library but builds its verification queue from the full image library.
- Studio Pages/Pieces/Process mount every editor at once.
- Existing pseudo-3D is small but not functionally sufficient; true Three.js must be dynamically isolated from unrelated routes.
- Four overlapping CSS files increase override cost and visual regression risk.

## Documentation Discrepancies

- Documentation claimed visual media pickers were in Page, Piece, and Process editors; source still used raw path fields and `MediaPicker` had no consumer.
- PLANS described the guided media trainer as both validation-pending and deployed/live-verified in different sections.
- Documentation described visual/semantic search capabilities more strongly than provider configuration and current public UI support justified.
- Persistence documentation was directionally correct about the mount, but did not explain startup seed reassignment or intentional-empty form semantics.
- The visualizer was labeled 3D despite rendering CSS geometry and SVG.

## Requirement-to-File Map

| Requirement | Primary implementation areas |
| --- | --- |
| Design system and density | `site/app/globals.css`, `site/app/refinements.css`, `site/app/ui-repair.css`, shared shell components |
| Inline editing | `site/components/inline-edit-*`, `site/app/api/studio/inline-edit/route.ts`, typed registry and audit helpers |
| Visual media selection | `site/components/media-picker.tsx`, Studio editors, media load actions |
| Normalized piece media/process | `site/lib/db.ts`, `site/lib/catalog.ts`, piece page and Studio Piece editor |
| Category icons | `site/lib/categories.ts`, shared SVG component, Portfolio and Studio category editor |
| Media operations | `site/components/studio-media-workspace.tsx`, `site/lib/actions.ts`, `site/lib/media.ts`, sidecar |
| Pricing/inquiry/reviews | `site/lib/piece-model.ts`, Shop/cart APIs, piece page, Studio Piece editor |
| Home/commissions/footer | home route, commissions flow, site chrome, structured settings |
| True 3D | dynamically imported R3F client surface, generator registry, SVG fallback |
| Deployment/data safety | Docker/Compose, migration tests, backup and rollback documentation |

## Implementation and Validation Sequence

1. Establish migration-safe normalized data and typed public policy. Completed in `d35eb35`.
2. Consolidate design tokens and public shell; repair footer, services, home commission positioning, and Portfolio density.
3. Implement extensible shared SVG category icons and visual category administration.
4. Connect a paged, focus-safe media library dialog to Page, Piece, Process, profile, and project editors; remove raw paths from normal workflows.
5. Convert long Studio panels to searchable master-detail editors and in-place action forms.
6. Render normalized process/build records and policy-gated pricing, inquiry, and reviews.
7. Extend Media Desk batch operations, rename previews, roles/stages, and provider-safe derivatives.
8. Replace pseudo-3D with dynamically loaded R3F generators and retain an honest scale-drawing fallback.
9. Replace inline-edit conditionals with a typed registry and atomic audited patch application.

Implemented after the baseline audit: the public editor now derives its allowlist from `site/lib/inline-edit-registry.ts`, validates complete batches before an outer SQLite transaction, records admin audit entries, rejects stale expected values and untrusted origins, and returns reversible patches for one-step Undo. The full visual editor remains the explicit path for structural changes.
10. Run static, disposable-database, browser, accessibility, performance, Docker, backup, candidate, rollback, and live deployment gates.

## Validation Matrix

| Gate | Baseline/data-slice status |
| --- | --- |
| TypeScript | Passed after data slice |
| ESLint | Passed after data slice |
| Focused Node tests | 11 passed; SQLite API/module warnings documented |
| Production build | Passed after data slice |
| Disposable migration twice | Passed; schema version remained 3 |
| SQLite quick check | Passed before/after |
| Destructive production mutation | Not performed |
| Public browser matrix | Pending redesigned surfaces |
| Admin browser matrix | Pending redesigned surfaces |
| Accessibility matrix | Pending redesigned surfaces |
| Performance comparison | Pending redesigned surfaces |
| Docker candidate/deploy | Pending all implementation and safety gates |
