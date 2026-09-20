# Goal F requirement-family reconciliation

## Studio/editor family

The f445c5d source is inspected at its real mutation boundaries: `requireAdmin` gates global Studio and its editor actions; record-specific actions save/delete pages, pieces and Process notes with dependency guards and route invalidation. `inline-edit-registry.ts` admits typed declared fields/modes only. Site structure/navigation/home service/feature lists use structured controls and canonical settings versions. The persisted commission-type labor/markup fields do exist; their estimator consumption was a genuine defect, corrected and independently validated below.

Current isolated `inline-edit-registry`, `studio-mutations`, and `studio-settings-autosave` tests pass 50/50. They exercise whitelist validation, list edits, intentional empty values, SQLite rollback/reference synchronization, durable mutation IDs/replay, conflict and retry handling, versions and autosave. Retained exact v19 authenticated mutation/rendering evidence covers ordinary record editors; current Goal-F 22-group seller fixture separately proves server isolation and canonical media crop/assignment/order/publication behavior. No production record was edited for this family audit. Final candidate recreation remains explicitly open in W2-02.22 and release rows.

## Estimator, capacity, paid-order metric and category editing

The estimator previously ignored saved commission-type labor/markup values. Both the public preview and server recalculation now consume that persisted policy. Explicit zero is valid; invalid values use deterministic defaults. Literal W2/W3 #8 requests a labor/material/markup estimate; the matrix phrase “editable labor rates/hours” overstated it. The hourly planning rate remains $75, while base hours and markup are editable. Material figures remain planning estimates, not live supplier quotations. Buyer budget is stored independently of the server-calculated total.

Public capacity now considers the primary business's active projects only: archived, cancelled and completed projects do not inflate hours or queue size, and unrelated businesses do not alter William's estimate. Studio deliberately requests an all-business aggregate. The overview's paid-order value includes only paid, non-refunded/non-cancelled orders created during the current UTC month; its label states this metric precisely. This is not payment-settlement accounting.

The category workspace and new-category form use file import/preview/built-in selection instead of exposing raw SVG markup. The existing sanitizer still rejects active content, external references, unsupported attributes and malformed SVG. No schema or dependency change is part of this packet.

Current packet checks: estimator plus category tests **11/11 pass**; typecheck passes; changed-source ESLint passes (the existing visualizer raw-image advisory remains). Chromium and Firefox each pass saved pricing → reload → public calculation equality, existing SVG import → reload, new category SVG import → reload, and raw-code-editor absence. There are zero page/console errors. Early harness input before hydration was corrected by waiting for hydration/network idle and actual mutation responses; it was not an application defect. Evidence is restricted outside Git: `reconcile-final-focused.log`, `reconcile-final-typecheck.log`, `reconcile-category-lint.log`, `reconcile-lint.log`, `reconcile-browser-report.json`.

Only isolated synthetic data was edited. The disposable port-3334 service is stopped; generated Next development type-path drift is removed. Production remains Goal E/schema 16. Changed public behavior retains explicit final-candidate/live actions in the matrix. Full final-source/build/release gates have not been run for this source.
