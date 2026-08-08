# v19 requirements traceability

Updated: 2026-08-08

This ledger maps the authoritative v19 requirements to implementation and evidence. A source implementation is not a release proof. `DONE / LOCAL GREEN` means the code and local checks exist; the requirement remains open at the release level until the final exact commit passes the applicable Tier 1, Tier 2, deployment, rollback, and Tier 3 gates.

## Current evidence boundary

- Source checkpoint: `3057090ccf80e554dc8d8ac2cc8a048b513f9119` (`test(release): add v19 acceptance and archive coverage`).
- Application checks at the checkpoint content: 155/155 tests, TypeScript, lint with zero errors, and the safe Next.js 16.3.0 standalone build passed.
- Visual-archive checks: 84/84 tests passed.
- Snapshot-lab smoke `local-lab-smoke-20260808T201355Z-0ff5d686-7046295b7e` passed with 445 captures across 48 authenticated/public routes, six required clone-only mutation states, exactly ten successful unsafe clone requests, zero unexpected diagnostics, zero residual commission drafts, SQLite `quick_check`, unchanged source data/media fingerprints, matching cloned media, and zero residual containers or volumes.
- Live-readonly smoke `local-readonly-smoke-20260808T202045Z-0ff5d686-63b43c6ac4` passed with 366 captures across 36 authenticated/public routes, zero successful unsafe requests, 38 expected policy blocks, zero unexpected diagnostics, and zero residual containers or volumes.
- The two smoke runs used content-equivalent, deliberately unstamped `unknown-loopback-smoke` images. They are local safety evidence, not exact candidate-image, Tier 2, or Tier 3 evidence.
- Exact final images, a production-clone migration/restart test, paired backup/staged restore for the final identity, candidate deployment, persistence, rollback, Cloudflare differential, and Tier 3 live-production archive remain pending.

## Requirement ledger

| ID | Requirement | Current status | Implementation and evidence | Remaining release gate |
|---|---|---|---|---|
| R1 | Granular Notifications management | DONE / LOCAL GREEN | `2d10f27` implements typed policies, recipients, templates, delivery history, retry/retention, SMTP verification, redaction, and audit records. Schema-3 protected inventory and clone-only policy/template round trips are covered by `3057090`. | Final exact browser archive, configured SMTP verification, Tier 2/3, deployment and rollback. |
| R2 | Projects lifecycle and dependency-safe deletion | DONE / LOCAL GREEN | `2d10f27` implements autosaved project fields, archive/cancel/reopen, dependency preview, guarded deletion, quarantine, lifecycle/audit records, and buyer updates. Project mutation evidence is required only when the protected inventory contains a project. | Exact production-clone project fixture, browser lifecycle/delete refusal and success evidence, Tier 2/3 and rollback. |
| R3 | Privacy-preserving Visitors and Audit workspaces | DONE / LOCAL GREEN | `2a54517` adds keyed purpose-separated pseudonyms, retention/purge, unique/session/pageview aggregates, accessible map/list, redacted paginated audit detail/export, and disabled-by-default visitor email. `3057090` adds stable protected view IDs and visitor-policy round-trip evidence. | Exact production-clone aggregates, deployed Cloudflare-header verification, Tier 2/3 and rollback. |
| R4 | Correct Piece selection, media, labels and canonical route state | DONE / LOCAL GREEN | `efad277` preserves Piece identity, direct URLs, in-panel A-B-A selection, media reset, and navigation state; source-contract and browser checks passed in WP02. | Final exact regression archive and deployed Back/Forward verification. |
| R5 | Exact source-folder media assignment rules | DONE / LOCAL GREEN | `d332ae7` adds visible dry-run rules, provenance, manual-override protection, idempotent application, piece filters, and no file movement. | Production-media dry run and final Tier 2/3 archive without publishing unverified assignments. |
| R6 | Immediate reviewed/public manual Piece-media assignment | DONE / LOCAL GREEN | `d332ae7` transactionally synchronizes normalized links, compatibility fields, review/public state, and privacy exceptions while preserving manual approval. | Exact production-clone and deployed public-route synchronization proof. |
| R7 | Every ordinary Studio edit preserves viewport/focus without navigation | PARTIAL | The shared queue/navigation shell and Page, Piece, Project, notification policy/template, and visitor-policy editors satisfy the no-navigation path. The classification below identifies remaining submit-based ordinary editors. | Migrate every remaining ordinary editor, then prove exact scroll, focus, selection, history and failure behavior in desktop/mobile browser runs. |
| R8 | Autosave all non-destructive Studio edits | PARTIAL | `767b84c` provides debounce, immediate controls, blur flush, serialization/coalescing, optimistic concurrency, bounded retry, local failure retention, canonical adoption and accessible status. Adoption is not yet complete across all panels, so Save buttons remain. | Complete the panel matrix below, add conflict/offline/multi-item browser evidence, and remove Save buttons only after field-complete parity. |
| R9 | Fast, complete lexical-first search | DONE / LOCAL GREEN | `0ff5d68` adds schema-13 FTS5 synchronization, public/private visibility, weighted BM25 snippets, integrity/rebuild controls, and bounded precomputed-vector reranking that cannot erase lexical results. The 5,000-document local p95 gate and repeated browser search passed. | Exact production-clone integrity/latency and deployed LAN/public timing. |
| R10 | Preserve all prior features and unfinished work | PARTIAL | The current 155-test application suite, 84-test archive suite, typecheck, lint, safe build, and two disposable browser modes are green. | Final exact full regression, Tier 2/3, sidecar, paired recovery, deployment, persistence and rollback. |
| R11 | Safe branch, child-PR and PR #6 synchronization | ACTIVE | Work is on `codex/woodsmith-v19-admin-completion-20260721`; pushed commits are additive and PR #7 remains the child integration surface. | Keep PR #6 draft through Tier 3; reconcile exact heads, update both PR bodies, merge without rewriting evidence-bound commits, then verify merged/live identity. |
| R12 | Coordinated WSL/PowerShell/NAS execution and bounded acceleration | PARTIAL | Native-ext4 is the sole writer; Windows Docker Desktop Engine 29.6.2 and BuildKit 0.31.2 are healthy. The archive uses bounded CPU/SwiftShader workers; the media sidecar has separate benchmark-gated CUDA policy. | Build final exact `linux/amd64` images, run NAS 2/6 worker policy, verify sidecar reachability, transfer integrity, backup, deployment and rollback. |
| R13 | Durable continuation and exact next-gate handoff | ACTIVE | Commits and validation boundaries are recorded in `PLANS.md`, this ledger, and the external restricted handoff. | Regenerate the handoff after each coherent commit and record the exact next unfinished release gate through final closure. |

## Studio mutation classification

This table is the current source audit required by R7/R8. “Ordinary pending” is not treated as complete merely because the server action persists data.

| Panel | Ordinary edit path | Explicit operations | Destructive/read-only path | Classification |
|---|---|---|---|---|
| Overview | None | Search integrity check and rebuild | Dashboard metrics are read-only | COMPLETE |
| Settings | Submit-based site settings form | None | Runtime status is read-only | ORDINARY AUTOSAVE PENDING |
| Pages | Existing records use `StudioAutosaveForm`; creation is a separate draft form | Create page | Existing deletion uses the confirmed destructive dialog | COMPLETE FOR EXISTING EDITS |
| Pieces | Existing records use `StudioAutosaveForm`; creation is separate | Create piece; visual media picker operations | Existing deletion uses the confirmed destructive dialog | COMPLETE FOR EXISTING EDITS |
| Categories | Existing category form submits | Create/import SVG | Delete/consolidate submits without the shared modal | ORDINARY AUTOSAVE AND DELETE DIALOG PENDING |
| Custom | Existing commission-type form submits | Create commission type | Delete submits without the shared modal | ORDINARY AUTOSAVE AND DELETE DIALOG PENDING |
| People | Existing profile form submits | None | Non-current profile delete submits without the shared modal | ORDINARY AUTOSAVE AND DELETE DIALOG PENDING |
| Process | Existing note form submits; new note uses the same explicit submit path | Create process note | Delete submits without the shared modal | ORDINARY AUTOSAVE AND DELETE DIALOG PENDING |
| Media | Metadata and source-folder rules use explicit Save actions | Upload, refresh, organize, assign, crop, analyze and rollback are explicit operations | File deletion has confirmation but not the shared Cancel-first modal | ORDINARY AUTOSAVE AND DIALOG PARITY PENDING |
| Projects | Operational fields use `StudioAutosaveForm` | Timeline note and status-email dispatch | Archive/cancel and permanent deletion use confirmed flows with fresh server checks | COMPLETE FOR ORDINARY FIELDS |
| Orders | Status/payment/tracking form submits | Invoice and shipping-label creation | Order list is otherwise read-only | ORDINARY AUTOSAVE PENDING |
| Reviews | Review copy/status form submits | None | Delete submits without the shared modal | ORDINARY AUTOSAVE AND DELETE DIALOG PENDING |
| Notifications | Policies, templates and visitor policy use `StudioAutosaveForm` | Retry, purge and SMTP verification/test are explicit operations | Delivery/Audit inspection is read-only; purge uses confirmation | COMPLETE FOR ORDINARY FIELDS |

Save controls remain wherever parity is incomplete. The next implementation slice must migrate the pending rows through the shared typed mutation shell and add browser evidence before removing those controls.

## Final closure sequence

1. Complete R7/R8 ordinary-editor and destructive-dialog parity.
2. Re-run focused and full source/browser checks, then freeze one clean final commit.
3. Build and inspect exact `linux/amd64` application and audit images labeled with that commit.
4. Run exact Tier 1 live-readonly and snapshot-lab gates.
5. Run production-clone migration, restart-idempotence, search/performance and Tier 2 archive gates.
6. Create and verify the paired backup and staging restore.
7. Deploy the immutable candidate, verify persistence and integrations, and prove image/state rollback.
8. Run Tier 3 live production, Cloudflare differential, sidecar and post-deploy checks.
9. Update PR #7 and PR #6, merge without rewriting evidence-bound commits, reconcile the live/merged identity, tag, and retain rollback assets through the stability window.
