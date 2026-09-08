# B2 conditional website-generated BCC acceptance

The commit containing this report is the single B2 packet on `codex/woodsmith-post-v19-public-launch-20260902`. Starting HEAD/upstream/remote all equalled `29578603d1cb6f8893ab1c38f233bbb42bce615c`; the authoritative `/home/cbeaman/src/woodsmith` worktree was clean. B1 acceptance was not rerun. No production data, configuration or deployment was changed.

## Implemented boundary

- Up to 20 named enabled/disabled rules, each with at least one exact condition and up to 30 normalized BCC recipients. AND within a rule, additive union across matching rules; optional scope to either or both B1 mail types.
- Only `customer_inquiry_admin` and `commission_submitted` with a persisted legitimate inquiry ID qualify. The latter requires the stored commission/Project relation. B1 normalized intent/topic/surface/route/channel and canonical piece identity/availability at submission are the matching facts. Source route is validated reported context, not navigation proof. No message keywords, arbitrary hidden labels, uploads, references or tokens become authoritative facts.
- Existing To selection, global/type/event BCC, CC exclusions, frozen delivery snapshots, queue idempotency, paused/suppressed behavior, attempt limits, retry recipients and SMTP identity/transport remain intact. Account verification/reset bypass conditional rules and retain single-recipient provenance/fail-closed retry. Quarantine cannot gain mail through a rule.
- Authenticated Overview management uses the shared typed autosave/version/audit/operation infrastructure. Explicit add/edit/remove/clear, validation recovery and stale-version adoption are implemented. Preview uses saved rules, identifies hypothetical fields, and never saves or sends examples.
- A separate `notification-conditional-routing` entry in the existing settings table defaults to empty without a write. No schema migration; schema remains v16. Existing settings, policy and template values are preserved. Migration snapshot/DDL gates are not applicable to this packet.

## Gates and evidence

| Gate | Result / scope |
|---|---|
| Focused tests | **63 PASS, 0 FAIL**: `node --experimental-strip-types --test lib/conditional-notification-routing.test.mts lib/notification-policy.test.mts lib/notifications.test.mts lib/studio-mutations.test.mts lib/studio-settings-autosave.test.mts` from `site`. Includes rule limits/invalid fields, all intents/topics/surfaces, canonical piece truth, no-context/no-match behavior, union/To/CC/case deduplication, account isolation/provenance, quarantine, planner replay/relation, frozen retry/sent history, Enabled/Paused/attempt limits, transactional setting rollback/retry/clear/reopen and raw owner-setting preservation. |
| Typecheck | `npm run typecheck`: PASS. |
| Lint | `npm run lint`: PASS, zero errors; eight existing `no-img-element` warnings. |
| Build | `npm run build`: PASS, production compilation/TypeScript and standalone runtime-data exclusion gate. Node emits its existing experimental SQLite warning. |
| Authenticated rendered acceptance | Chromium and Firefox, each at 1440×1000 light and 390×1000 dark: create/edit/remove/reload/clear, normalization, effective global/type/event/conditional preview, account-link preview, zero preview writes, invalid-value Retry save, stale-version rejection and explicit recovery, keyboard/focus, responsive layout and no horizontal page overflow. Screenshots inspected. |
| Additional browser security/recovery | Both browsers: identical server-action replay leaves settings version and audit count unchanged; unauthenticated replay cannot write; intentionally failed network requests retain saved state and recover through Retry save; audit values redact private recipients. |
| Browser errors/traffic | Zero unexpected console/page errors and zero cross-origin requests in final acceptance. Network-failure recovery intentionally records four Chromium `net::ERR_FAILED` resource messages; these are expected injected failures, not normal-run errors. |
| Scope / diff hygiene | `git diff --check` PASS. No customer data, database snapshots, media, build output or credentials belong to this packet. Complete staged review and final commit/remote/clean-state identity are recorded in the external closure record. |

Commands ran against the authoritative WSL worktree using the existing `node:22.23.1-bookworm` image. The first build attempt as uid 1000 encountered existing root-owned `.next` output; the canonical build then ran successfully using the existing container ownership. A legacy routing source test was updated to locate B1's extracted planner function. Browser acceptance found and fixed HTTP-origin rule-ID fallback and explicit accessible control naming; final acceptance uses the rebuilt source. Checkboxes reuse the existing Studio checkbox style.

Browser validation used a disposable internal Docker network at `http://woodsmith-b2qa-20260907-app:3002`, synthetic SQLite/media directories and a copy of the current standalone build. No SMTP credentials or production mounts were supplied. Existing Playwright 1.61 tooling supplied Chromium and Firefox; the Browser plugin was unavailable. Reproduction scripts, command logs, result JSON, screenshots and final closure evidence are retained outside Git at `C:/Users/Cooper/.codex/run-logs/woodsmith-routing-b2-20260907/`. Disposable runtime/database/browser resources are removed during closure.

This is source acceptance. Live Cloudflare/SMTP, inbox placement, production deployment, recovery/release gates and provider mailbox forwarding are not claimed. Public deployment should move from experimental `node:sqlite` to Postgres, LibSQL or another stable production database. No B2 blocker remains after the recorded gates; the next manual Goal is **C Visitors**. Goals C/D/E and branch consolidation were not started.
