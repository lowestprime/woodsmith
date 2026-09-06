# Post-v19 Public Launch Audit

Date: 2026-09-02

Baseline: `origin/master` at `57def6436af7c4a514181d7307c112fa157f73c8`

Goal branch: `codex/woodsmith-post-v19-public-launch-20260902`

## Evidence boundary

- The deployed v19 application remains `0067488abb058829f3b94584c02ea666e552c9a8`; the accepted v19 audit runner remains `686a69c0cc5011394f35add750c29663626990f8`.
- The v19 evidence tag is retained. Production is not modified during this audit.
- The sole-writer development checkout is `/home/cbeaman/src/woodsmith` on WSL ext4. `X:\\woodsmith` and `/mnt/woodsmith` are NAS/CIFS views and are not development worktrees for this goal.
- Baseline application gates pass: 188/188 tests, typecheck, lint with eight pre-existing `no-img-element` warnings, and the safe Next.js 16.3.0 production build.

## 2026-09-04 Notification Routing Acceptance

The coherent public slice and responsive/media repairs are committed and pushed as `4f2d33e` and `f9d0409`. The subsequent routing slice adds reversible typed global BCC defaults, a shared effective-recipient preview, separate operator inquiry/reply/review notices, transactional order-review notices, authentication-link recipient provenance (schema v15), and explicit shared autosave retry/conflict recovery. Local reservation redirects now remain on the browser's origin instead of the container hostname.

Current source validation: 206/206 application tests, typecheck, lint with eight existing image warnings, and the safe Next.js 16.3.4 build (12 static pages; standalone runtime-data gate). Browser fixture `routing-final` passed 11 checks: eight desktop/430/390/320 light/dark routing combinations, conflict rejection/adoption, Contact + project reply, and local order review. No console/page errors or cross-origin requests were recorded. Database verification proved separate buyer/operator queue entries, a reply notice, an order-review notice, 26 routing audit operations linked to mutation IDs, and `quick_check=ok`. SMTP was deliberately unconfigured, so no external email was sent. A subsequent pure address-validator hardening passed the full source gates and does not change layout, queue scheduling or recipient-source semantics.

Restricted output is retained outside Git under the post-v19 public QA run root. Earlier failed fixture/harness runs are diagnostic evidence, not passes. These checks do not substitute for the production-clone migration, dense-media, final accessibility/performance, recovery, exact-image or deployment gates.

The subsequent P0 cart repair scopes reads/deletes to a guest capability or authenticated account, prevents an old shared-browser token from claiming another account's line, and rejects blank cart capabilities. Full tests pass 207/207; typecheck, lint and safe build pass. A rendered tampered-ID removal is rejected, own-line removal succeeds, and the foreign customer's line remains intact at 390px with no overflow or console/page/cross-origin errors. The current integrated build also passes all 11 routing checks, including the hardened consecutive-dot address rejection, plus the independent database/outbox/audit verifier. Evidence: `cart-ownership/cart-ownership.json` and `routing-cart-integration/` under the restricted public QA root.

## 2026-09-04 Production-Clone Migration Proof

Read-only online SQLite snapshot from the unchanged v19 container at `2026-09-04T16:32:17.179Z`: 7,716,864 bytes; SHA-256 `8b0b41f249e68afe77e29779d7a1740c8824e5512076da9b798211dbd1dc00d6`; schema 13; quick check OK. It contains 7 pages, 25 pieces, 431 indexed media records, 10 projects and 2 users. This is a database-only test input, not the required paired recovery backup.

`site/scripts/verify-launch-clone.mts` passed actual-data and customized-data migrations to schema 15, repeat/reopen idempotence, v14/v15 injected-failure transaction rollback and retry, unchanged unrelated tables, original notification policy/template preservation, and two actual application initializations with identical migrated logical state. Arbitrary custom settings, content and biographies survive. The source snapshot stayed byte-identical; temporary test databases were removed and their absence asserted. No production media or recipient settings were changed.

Restricted source: `/home/cbeaman/.local/state/woodsmith-post-v19/source-20260904a/source.sqlite`. Report: `/home/cbeaman/.local/state/woodsmith-post-v19/migration-20260904a/migrations-startup.json`, SHA-256 `2b5c962382afca88cd7e2b8623eca8b375d9b26b888760ef68e7cf7e7fd56446`. The test uses an empty disposable media root to prove metadata preservation, not media-byte rendering. The original v19 paired backup and rollback assets remain retained; a new paired backup/staged restore is still required before deployment.

## 2026-09-04 Dense Studio Media Acceptance

A tmpfs-only 150-record library of explicitly labeled synthetic duplicates of the verified Pastry Table fixture exercised three pages without claiming 150 distinct pieces. Eight Chromium 149 combinations (1440/430/390/320 pixels, light/dark) pass same-document pagination and autosave, arrow/Home/End and Enter keyboard operation, visible mobile Inspector focus, no horizontal overflow, and save/reload persistence. The 320px dark run additionally passes unreviewed manual assignment, keyboard crop zoom, in-place rename, delete-dialog Escape and focus restoration, confirmed in-place deletion, zero console/page errors, and zero cross-origin requests.

The audit found and repaired three real Media defects: reselecting the current thumbnail did not reveal the mobile Inspector; only the selected thumbnail was tabbable despite no arrow-key implementation; and the shared inspector collection sent private admin media through Next's unauthenticated image optimizer. The final implementation gives every thumbnail a Tab stop plus deterministic grid arrows/Home/End, transfers focus to the newly visible Inspector heading, keeps renamed selection on its returned identity, and directly serves private Inspector previews through the authenticated browser request. Full tests pass 208/208; typecheck passes; lint has zero errors and the existing eight image warnings; Next.js 16.3.4 safe build passes 12/12 static pages and the standalone runtime-data gate. Restricted report: `dense-studio-pass-authoritative/dense-studio.json`, SHA-256 `8360f4957634c096f130898e183970ad2a9aa504720fe1b7df0d6f4f3ad5a132`. All disposable app/browser/network resources were removed.

## 2026-09-05 Interrupted Studio WIP closure

The ext4 checkout and all eleven interrupted files were recovered at `fa398f5`; no prior WIP was discarded. The retained disposable database was preserved and copied through an online SQLite snapshot into isolated tmpfs fixtures. Its expired synthetic operator session was renewed without reseeding the records. The original project timeout was reproduced as a harness role mismatch: a datalist-backed Status input is a combobox, not a textbox.

Projects, Orders and Reviews now use searchable 20-record lists with one editor. Record switches flush pending mutations and retain the original editor on error. Focus moves after React commits the selected heading. Server refreshes reconcile commerce collections and adopt newer canonical entities only after local edits settle. Invoice/label operations flush pending order edits. Review deletion removes its list/editor state without a reload. Error feedback occupies a stable mobile list row, and record row heights fit their text rather than clipping metadata.

Final focused rendered acceptance passed 28 Chromium checks, eight Firefox checks and one separate review-deletion check. It covers 1440/430/390/320 pixel layouts, both themes, dense records, pagination/search, long labels, exact selected entity, keyboard focus, switch flushing, invalid-save blocking/retry, external-order refresh and deletion. Every run recorded zero axe violations, browser errors or cross-origin requests. The 27 Chromium and ten Firefox axe incomplete results are color-contrast checks requiring manual assessment in final release accessibility QA; they are not claimed as automated passes. Browser plugin unavailable; repository Playwright acceptance was used. The final desktop and mobile screenshots were inspected, and row-content geometry now has an explicit regression assertion.

Current source gates: `npm run test` 208/208; `npm --prefix visual-audit test` 144/144; `npm run typecheck` pass; `npm run lint` zero errors/eight existing image warnings; `npm run build` pass including the standalone runtime-data gate. Node SQLite retains its experimental warning. The final row-only CSS change was rebuilt and exercised by both browser suites. This dirty-source disposable acceptance is not an exact release image, production-clone acceptance, deployment or rollback proof.

Restricted reports under `C:/Users/Cooper/.codex/run-logs/post-v19-public-20260903/`:

| Report | SHA-256 |
|---|---|
| `studio-final-chromium-20260905d/studio-workspaces.json` | `5ab5fed87dbfaecb8368bebf95f3265ca8284297df88a965bc51ced79f1e76bf` |
| `studio-final-firefox-20260905d/studio-workspaces.json` | `842c5f51152a20b54bbe7f7beedfc01ea007a8cfa964acf1ae3bb0b7f499eeaf` |
| `studio-final-delete-20260905d/studio-workspaces.json` | `d5a659fc98b155b2f4745cf27417b2a64601959c088d36c647417928e2e165dc` |

The JPEG technical-classification and crop serialization defects are closed by Goal A below. Later goals remain separately scheduled in `PLANS.md`.

## Goal A: technical media recovery (2026-09-05)

The technical media packet following Studio commit `15fe557a16c90ee869c01df781db640e14cea398` is verified. No application source changed after the final passing build and rendered checks; closure adds documentation only. This is source/disposable-clone acceptance, not production deployment or exact release-image acceptance. The existing Goal branch remains active for later manually started work.

**Implemented:** primary JPEG codestream inspection replaces the final-4-KiB end-marker heuristic. It handles marker segments, embedded thumbnails, stuffed bytes, restart markers, progressive scans and delayed height, distinguishing missing/truncated/structurally malformed input while preserving all raw/trailing bytes. Structural inspection is not entropy-decoder certification. Versioned content hashes detect source changes even when size and timestamps remain unchanged. Studio previews use revision URLs, with Next local image query patterns explicitly allowed under `/media/**`; HTTP validators also include change time.

**Refresh and persistence:** selected **Refresh preview** flushes edits, reinspects and audits only selected indexed records, preserves missing records and all editorial fields, and adopts the canonical result in the autosave queue. Editor and rename saves cannot reinstate stale technical failures. Unchanged reindex results retain record versions; changed results advance monotonically. Crop defaults normalize legacy focal coordinates/zoom/aspect; video and unavailable-image forms submit a canonical frame. The browser proved a crop save at zoom 3.5, transition to unavailable after damaging a disposable copy, fallback metadata save, exact source restoration and immediate recovery, video default/save, reload, reindex and container restart.

**Real-byte evidence:** four NAS originals were copied without transcoding and independently hash-verified. Sharp 0.35.3/libvips 8.18.3 with `failOn: "warning"` decoded their complete pixel buffers; truncated disposable derivatives were rejected. Actual encoded baseline/progressive fixtures also passed. Both browsers decoded the real photographs; authenticated HTTP returned byte-identical payloads with correct image content type, 200 responses and 206 byte ranges.

| Source path beneath `Furniture/` | Bytes | Primary JPEG bytes | Decoded dimensions |
|---|---:|---:|---|
| `basement-door/PXL_20220901_200641874.jpg` | 2,870,229 | 2,838,445 | 4080 × 3072 |
| `basement-door/PXL_20260303_034157401.MP.jpg` | 1,851,612 | 1,827,453 | 3072 × 4080 |
| `chair-mounted-adjustable-artist-easel/PXL_20240218_015604040.jpg` | 2,812,823 | 2,787,256 | 3072 × 4080 |
| `chair-mounted-adjustable-artist-easel/PXL_20240218_015623629.jpg` | 2,512,689 | 2,492,151 | 4080 × 3072 |

The previous diagnosis that those two February 18 easel JPEGs lacked end-of-image markers is **superseded**. Their primary codestreams are complete; their 25,567-byte and 20,538-byte trailers caused the heuristic's false rejection. Earlier failing audits remain diagnostic records, not evidence of source corruption. No raw file or editorial piece/media identity was changed.

**Unresolved source paths:** the preceding read-only inventory investigation reported two absent indexed paths: `Furniture/dining-room-table/PXL_20230716_004038462.jpg` and `Furniture/dining-room-table/PXL_20230716_004052400.jpg`. Same-folder `DINING_TALBE_20230716_004038462.jpg` and `DINING_TALBE_20230716_004052400.jpg` were candidate matches, but no rename-history provenance established identity. These are unresolved path/provenance exceptions, not proven corrupt or unrecoverable photographs. Goal A does not reassign them. Minimal later step: establish the original-to-candidate identity before an explicit path reconciliation. The retained four-file acceptance does not claim an exhaustive rendered pass for the entire library.

**Gates actually run:**

- `node --experimental-strip-types --test site/lib/media-integrity.test.mts site/lib/media-http.test.mts site/lib/media-recovery.test.mts site/lib/media-reference-transaction.test.mts site/lib/media-batch-transaction.test.mts site/lib/studio-media-editor.test.mts` — 32/32 PASS (`focused.log`).
- `node --experimental-strip-types --test site/lib/media-access.test.mts site/lib/media-collection.test.mts site/lib/media-folder-rules.test.mts site/lib/piece-media.test.mts site/lib/studio-mutations.test.mts` — 67/67 PASS (`related-media.log`).
- `npm run typecheck`, `npm run lint`, `npm run build` — PASS in Node 22.23.1; lint has zero errors/eight existing image warnings; Next.js 16.3.4 standalone runtime-data gate passes. SQLite's experimental warning remains. Final logs are `typecheck-final.log`, `lint-final.log`, `build-final.log`.
- `node /work/visual-audit/scripts/verify-media-recovery.mjs` — real bytes, strict decoding and current production-clone editorial preservation, rollback, idempotence and reopen PASS; `quick_check=ok`. Source snapshot SHA-256 remains `8b0b41f249e68afe77e29779d7a1740c8824e5512076da9b798211dbd1dc00d6`.
- `node /work/visual-audit/scripts/verify-media-recovery-browser.mjs` — Chromium 1440 initial 7 checks, Chromium 1440 restart/reindex 7 checks, Firefox 390 restart 6 checks, all PASS; zero console/page errors and cross-origin traffic. Final desktop light and mobile dark runs also pass horizontal-overflow assertions. This focused packet does not claim a new complete accessibility matrix.

Restricted evidence stays outside Git at `C:/Users/Cooper/.codex/run-logs/post-v19-public-20260903/media-goal-a/`. Verifier source is committed; JSON/logs, screenshots, databases and raw bytes are excluded. The isolated runner was `woodsmith-visual-audit:app-0067488-audit-686a69c`. The packet's removable runtime is exactly container `woodsmith-mediaqa-goala-app`, internal network `woodsmith-mediaqa-goala`, and volumes `woodsmith-mediaqa-goala-data`/`woodsmith-mediaqa-goala-media`; closure records their removal and final commit identity in the restricted ledger. Earlier Studio fixtures and retained recovery assets are outside that cleanup scope.

| Evidence report | SHA-256 |
|---|---|
| `real-byte-decoder.json` | `846ce37c46cbf1d0c86e13a6ffa979aa3233fc42b0ee827d3122ae809c8830a8` |
| `browser-chromium-initial.json` | `2d79d1c1635f1b354b0809ac26de009bc177a155f81ceb62081270803bf2634e` |
| `browser-chromium-restart.json` | `2435339c527849898aaf6e78b72613374cfb627878dba45bccff33dc311ccff3` |
| `browser-firefox-restart.json` | `0280e9fef0ae09ce662e15ed8a627920580e743ff29647698d600c30aebcac68` |

Full-image hashing adds NAS reads at startup/reindex; final deployment performance remains unmeasured. No production deployment, paired recovery replacement, branch consolidation, intake/routing, Visitors or public-copy work is included in this packet. The next manual goal is customer intake/routing as preserved in `PLANS.md`.

## Research principles (release requirements)

- Next.js must move to the latest verified compatible 16.3.x patch before release. The official 2026-08-25 security release identifies 16.3.3 as the patched Active-LTS release; the npm registry now publishes 16.3.4 in the same line.
- WCAG 2.2 AA remains the release floor, with particular attention to focus visibility/obscuring, target size, status messages, error focus, reflow, and reduced motion.
- Core Web Vitals acceptance uses the current web.dev guidance: LCP at or below 2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1 at the 75th percentile where field-like measurement is available.
- CSS scroll-driven animation is a progressive enhancement, not a sole implementation path. The route progress rail therefore requires a passive, animation-frame-coalesced fallback.
- Contemporary craft references consistently put finished work and material photography ahead of explanatory interface copy. George Nakashima Woodworkers, Benchmark, Stickley, The Joinery, Facet, and comparable makers use direct collection taxonomy, restrained calls to action, and concise workshop/process narratives. No third-party brand, copy, asset, or distinctive composition will be copied.

## Human-rendered route families

Public: `/`, `/[slug]`, `/about`, `/care-and-warranty`, `/portfolio`, `/portfolio/[slug]`, `/shop`, `/shop/cart`, `/process`, `/process/[slug]`, legacy `/journal` redirects, `/journal/[slug]`, `/search`, `/contact`, `/commissions`, `/commissions/status`, `/requests/[reference]`, not-found, loading, and error states.

Account: `/account/signup`, `/account/login`, `/account/forgot`, `/account/reset`, `/account/verify`, `/account/verify/[token]`, `/account/profile`, and `/account/projects`.

Private operator: `/studio/login`, `/studio` across overview/settings/pages/pieces/custom/people/process/media/projects/orders/reviews/notifications and their dialogs/inspectors/empty/dense states, plus `/studio/request/[reference]`.

Audit-only: `/snapshot-lab/media-collections`; this is not public navigation and remains isolated from live route inventory.

## UX gap matrix

| Priority | Route / surface | Current problem and user impact | Repair | Shared surface | Accessibility / performance | Validation |
|---|---|---|---|---|---|---|
| P0 | All human routes | No route-wide progress affordance. Long portfolio, piece, process, account, and Studio pages provide weak spatial orientation. | Add one layout-level progress rail using CSS scroll timelines plus a passive `requestAnimationFrame` fallback; reset on navigation and recalculate after resize/content changes. | Root layout, header shell | Decorative semantics, reduced-motion treatment, no per-frame React state, no layout shift. | Unit tests for 0/mid/100/short/reset/resize; browser checks on public/account/Studio routes and mobile. |
| P0 | Framework/runtime | Next.js 16.3.0 predates the current same-line security patch. | Pin Next.js and `eslint-config-next` to 16.3.4, regenerate lockfile, audit dependencies, and repair incompatibilities. | Build/runtime | Preserve Server Component defaults and route semantics. | Full tests, typecheck, lint, audit, safe build, image inspection, disposable runtime. |
| P0 | Public copy/data | Public pages expose implementation language about public/private surfaces, dashboard management, verification workflow, and software operation. Persisted SQLite values can outlive source fixes. | Replace visitor-facing defaults and hard-coded strings; add exact-match, versioned, audited, idempotent content normalization that preserves divergent owner edits. | Seed, migrations, page records, settings | Shorter copy improves comprehension and avoids duplicate announcements. | Migration clone tests, public-copy source/render guards, idempotence and customized-value preservation. |
| P0 | Home | The first viewport is text-heavy with a large empty gradient and no furniture photograph; competing sections repeat how the site works. | Build an image-led split hero from the verified home hero media, reduce the headline/CTA set, and tighten section rhythm. | Page intro, media image, buttons | Correct LCP priority/sizes, stable aspect ratio, useful alt, no CLS. | Desktop/mobile/light/dark rendered QA and LCP/CLS trace. |
| P0 | Contact / commissions | `/contact` describes a direct note but immediately duplicates the same ten-step commission workflow as `/commissions`; the route choice is confusing. | Make `/contact` a concise progressively disclosed entry with clear inquiry choices and hand off complex custom work to the resumable commission workflow without duplicating it. | Contact forms, commission workflow | Error-focus movement, labels, status announcements, touch-friendly actions. | Keyboard and mobile form acceptance; submission only against disposable state. |
| P1 | Portfolio | Repeated provenance labels, zero-count filters, pill-heavy taxonomy, and metadata density compete with photography. | Use a compact category rail with explicit result count, suppress zero-count categories by default, remove redundant verified badges, and strengthen image hierarchy. | Piece card, category filter | Current state, keyboard reachability, 44px practical targets, URL state retained. | Filter/deep-link/empty-state tests and 320-1440px browser matrix. |
| P1 | Piece detail | Lead/gallery hierarchy is functional but technical media-review language and workflow explanations appear publicly; CTA and related content need stronger state alignment. | Keep truthful availability while moving provenance to a single quiet disclosure; simplify story/details and render state-specific reserve/custom actions. | Media collection, lightbox, piece policy | Preserve focus trap/restore, keyboard/touch pan/zoom, source-resolution viewing. | Representative inventory/commission/unverified pieces in both themes. |
| P1 | Shop/cart | A single item uses an oversized card and repeats tax/shipping/system policy prose. Buyers scan policy before product. | Use a compact product-led layout, keep price/availability/fulfillment clear, and progressively disclose secondary policy. | Shop card, cart feedback | Maintain accessible totals/errors and mobile purchase flow; optimize image sizing. | Inventory/empty/cart states and narrow mobile checkout path. |
| P1 | About/footer | The About page explains CMS/share mechanics. Every footer repeats developer email and repository-source links, diluting the commercial experience. | Refocus About on William, the woodshop, and contact; remove default developer/source promotion from commercial pages while retaining technical credits and owner control over customized profiles. | Footer configuration, About page | Simpler landmarks and link purpose; less repeated DOM. | Public-copy guard and footer checks across route families. |
| P1 | Process/long-form | The live Process index is empty but publicly explains that routes remain available. Empty states provide no useful next action. | Use an honest, concise empty state; improve article reading measure, captions, related work, and previous/next navigation when records exist. | Process list/article, progress rail | Heading order, reading measure, image captions, route titles. | Empty and populated fixtures on mobile/desktop. |
| P1 | Header/nav/search | The header is functionally compact but remains control-heavy and pill-like; orientation is visually weak on small widths. | Refine one-row desktop and two-row mobile composition, active state, search affordance, target sizing, and focus-safe auto-hide behavior without adding JS state churn. | Header shell, nav link, theme/account/cart controls | Focus never hidden; current-page state; no horizontal document overflow. | Keyboard, zoom, 320px, scroll hide/reveal, orientation change. |
| P1 | Studio shell | Capable editors are split across dense historical style layers; orientation, saved/error state, responsive workspace behavior, and destructive-action hierarchy vary by panel. | Consolidate shell tokens/styles, add clear persistent section context and compact panel navigation, standardize mutation status and destructive controls, and improve the highest-use Pages/Pieces/Media/Projects/Orders/Notifications surfaces. | Studio shell, mutation queue, panel nav | Responsive tables, named controls, live status, focus return, no card inflation. | Authenticated disposable desktop/tablet/mobile acceptance with dense media fixture. |
| P1 | Theme/design system | Three large CSS layers redefine header/cards/tokens repeatedly, making parity and regressions difficult to reason about. | Consolidate the active visual contract into intentional tokens and component rules; remove superseded overrides only after rendered equivalence/repair checks. | Global/refinement/repair CSS | Contrast, reduced motion, zoom/reflow, lower style complexity. | CSS regression tests, contrast checks, route-family screenshots. |
| P1 | Loading/error/empty states | Several route families use generic or sparse states, and route titles are not consistently distinctive. | Standardize concise, action-oriented states and unique metadata/H1s while preserving Next.js route announcements. | Loading/error/not-found, page metadata | Focus and announcement behavior; no blocking client bundle. | Route error/empty fixtures and AX snapshots. |
| P2 | Motion/transition | Page changes are visually abrupt, but decorative transition systems could harm history/focus. | Add only progressive, reduced-motion-safe transitions after core geometry and navigation are proven. | Shared CSS | No delayed navigation or focus loss. | Browser support/fallback and history checks. |

P0 and P1 items are implementation scope. P2 is admitted only if it remains CSS-only, progressive, and regression-free.

## Branch-retirement manifest

Ahead/behind is shown as `master ahead / branch ahead`, measured against `origin/master` at the baseline above.

| Branch | Tip | Merge base | Ahead / behind | Classification |
|---|---|---|---|---|
| `checkpoint/fast-evidence-route-suite-56c39264623e` | `6f20c9b4dfc1d6417f0ccd89fd540ae77a465bff` | `4eec7b5b6558680c57933b28451e3b8b38e91398` | `18 / 1` | Historical fast-evidence WIP checkpoint. Its one checkpoint commit is not an ancestor, but the accepted audit architecture and later repairs are represented by newer master history and the v19 evidence ledger; its older tree must not replace current source. |
| `checkpoint/fast-evidence-step2-6d08bb7843e9` | `3ad509e75e4afe8def71429eae49b183c9f6aeab` | `4eec7b5b6558680c57933b28451e3b8b38e91398` | `18 / 1` | Historical validated-WIP checkpoint superseded by the accepted audit runner and later master integration. |
| `checkpoint/sitewide-overhaul-0758c9a-visual-audit-wip` | `5ca4d2921294812bcf0ad5c89af847cc706acf0a` | `0758c9a8d23e2dcf8ae20d6443cc1b474e60fc09` | `78 / 1` | Interrupted two-file visual-audit WIP checkpoint. Current master contains the completed, later audit implementation and accepted release evidence. |
| `checkpoint/sitewide-overhaul-9940969-validation-repair-wip-20260715` | `61f4cf9c881dddec282be8d8204821cce45858db` | `9940969c0693af125ac9718d5fdae1332eddace4` | `64 / 1` | Historical repair-plan WIP superseded by later validated capture/repair code on master. |
| `checkpoint/sitewide-overhaul-c30a909-full-archive-wip-20260714` | `5a3f25d53f628d7fffd35fdd9512d82894554333` | `c30a9096ad1d4e3652041d9ca34d455c4b09bdc9` | `72 / 1` | Historical archive WIP superseded by the completed deterministic archive and final v19 evidence. |
| `codex/sitewide-studio-ux-commission-overhaul-20260711` | `bb1ae2930788d9d1ea6d26c339211b5307106d88` | same as tip | `1 / 0` | Fully represented by master; safe to retire. |
| `codex/woodsmith-v19-admin-completion-20260721` | `348ad7d4f78f61b7d10347a5de4760f951234c80` | same as tip | `2 / 0` | Fully represented by master; safe to retire after the v19 evidence tag is rechecked. |

The five checkpoint branches intentionally preserve unique historical snapshot commits, not current product work. Their tip identities are recorded above, their useful outcomes are represented by current source and accepted v19 evidence, and retaining branch refs is not required for release provenance. No replacement checkpoint branch or tag will be created.

## Baseline findings retained for implementation

- Scientist Desk public imagery now matches the specified black phenolic top and maple base. No additional piece/media pairing will be guessed.
- The home page has verified `heroMediaPath` data but does not render it in the hero.
- Process has no visible records in production and currently exposes implementation-oriented empty copy.
- Search preserves the FTS5-first architecture; visual search is described as local material-cue matching and must remain honest about that capability.
- Lightbox, normalized media roles, direct assignment, autosave, typed inline editing, project tracking, and provider-degraded behavior are existing strengths to preserve.
- Source media is immutable for visual treatment. Any cleanup or crop remains metadata/derivative-only.

## 2026-09-03 public-slice source verification

- Reconciled the sole-writer WSL checkout and preserved all existing WIP. Starting HEAD/upstream `c1f01b3975f2d7b40b25a57e7a59b99110277543`; remote master remains `57def6436af7c4a514181d7307c112fa157f73c8`. The v19 evidence tag object remains `ce8d099c0d75908efe8bf1adc844c92c2f5f3fde` locally and remotely.
- No authoritative geographic evidence was available for the new San Francisco claim. Replaced it with location-neutral copy in both seeds and migration targets; no location is inferred from timezone or infrastructure.
- Removed default About website-development promotion and added exact-match seeded-profile normalization. Customized profile content/visibility remains operator-controlled; no accounts are deleted.
- Narrowed malformed-JSON handling so settings update/audit failures propagate to migration rollback. Added failure-injection, customization, profile, and explicit idempotence regressions.
- `npm run test`: **197/197 PASS**; focused migration/public-copy/UI: **23/23 PASS**. `npm run typecheck`: PASS. `npm run lint`: PASS, zero errors and eight existing image-element warnings. `npm run build`: PASS, Next.js **16.3.4**, **12/12** static pages, standalone runtime-data gate PASS. Commands ran in `node:22.23.1-bookworm` with the WSL checkout mounted; no production state was mounted.
- `visual-audit/scripts/verify-route-progress.mjs`: PASS with actual source CSS in Chromium **149.0.7827.55** and Firefox **151.0** with scroll timelines enabled. Both computed scale values **0, 0.5, 1** and adjusted correctly after height growth under reduced motion. The added `1ms` duration follows [MDN's timeline guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines#animation_duration). This is supported-path evidence, not proof of Firefox's default feature availability or complete route acceptance.
- Next: committed-public rendered assessment of card dates, eyebrow/pill density, and Contact discoverability; then remaining route/fallback/mobile/Studio and production-clone gates. Source validation does not close those gates.

## 2026-09-03 targeted rendered assessment

- Public slice `4f2d33e7b3461d5eddc8c1b58a3904bda1c19faa` is committed and pushed. Subsequent targeted fixes remove repetitive card update dates and duplicate title eyebrows, preserve detail/admin metadata, and make absent indexed photos an honest placeholder instead of broken image requests. Hero quality 92 is explicitly admitted by Next image configuration.
- Mobile upward-scroll and keyboard testing found a compact-header rule that hid navigation even after the header returned. Removed that rule while retaining scroll-down auto-hide, focus reveal, and the mobile two-row height contract. Contact is reachable through primary navigation and keyboard focus; narrow navigation remains horizontally scrollable rather than overflowing the document.
- Isolated tmpfs application with no production mounts/providers: 112 public route/viewport/theme checks and 80 signed-in route/viewport/theme checks cover 1440/430/390/320px in both themes. The integrated CSS timeline and forced passive fallback pass top/middle/bottom, dynamic height, keyboard navigation reset, and aria-hidden checks. Pastry-table gallery zoom, Escape/X close, and focus restoration pass eight viewport/theme combinations. No console/page errors, horizontal overflow, or cross-origin requests.
- The representative real photograph is copied from the already-public Pastry Table URL into disposable media only; SHA-256 `46ac4c999c73b23cab87eeb3c3be66184cfbec7bfde1df125cff738938199359`. Its known piece association is retained. This proves real-image hero/gallery rendering, not the correctness of every production assignment or the production home selection.
- Evidence stays outside Git under `C:\Users\Cooper\.codex\run-logs\post-v19-public-20260903` (`final-layout/public-qa.json`, `interactions-verified/interactions.json`, representative screenshots). Earlier partial diagnostic attempts are not passing evidence. Full production-clone fidelity, dense Studio mutation workflows, provider integrations, and final release acceptance remain open.
