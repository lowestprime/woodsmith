# B1 customer intake acceptance — 2026-09-06

B1 implements shared verified website intake, separate inquiry persistence, conservative solicitation quarantine, retained commission behavior, and private inquiry review. No production deployment or B2 conditional routing/BCC is included. See [website inquiries](website-inquiries.md) for configuration and behavior.

## Accepted evidence

Restricted reports and logs are retained outside Git at `C:/Users/Cooper/.codex/run-logs/woodsmith-intake-b1-20260906/`. `focused-results.json` consolidates the latest result for each of 44 unique checks, retaining its source log. Superseded failures remain diagnostic history and are not counted as final failures or passes.

| Requirement | Final evidence |
|---|---|
| Model, normalization, catalog truth, planner references, classifier, Turnstile, owner replay, quota, Project exclusion, mail context | 16 intake checks PASS; latest `intake-planner-final.log` intake results |
| Migration expectations and dedicated v16 failure/DDL rollback/retry/customization/idempotence/reopen | 12 migration checks PASS; `focused-final.log` migration results |
| Mail policy, private recipient handling and account-link isolation | 8 checks PASS; `mail-intake-final.log` |
| Planner validation | 3 checks PASS; `planner-final.log` |
| Existing request security | 5 checks PASS; retained `related-intake.log` request-security results |
| TypeScript | `npm run typecheck` PASS after reference/planner fixes (`typecheck-reference-fix.log`); final build also passes its TypeScript stage |
| Lint | `npm run lint` identified two new effect errors, both repaired; affected-file ESLint runs pass in `lint-fixes.log`, `lint-browser-fixes.log`, `lint-reference-fix.log`, and `lint-honeypot-fix.log`. Eight existing image warnings remain; no unresolved lint errors |
| Production build | `npm run build` PASS after the final honeypot fix; `build-honeypot-final.log`, including standalone runtime-data gate |
| Fresh production clone | `inquiry-clone.json`: actual/customized/rollback scenarios PASS, 50 pre-existing tables preserved across v16, injected rollback/retry, idempotence, database and application reopen/startup, unchanged source hash |
| Chromium / Firefox | `browser-chromium-all.json` and `browser-firefox-all.json` PASS at 1440/390 pixels; `errors=[]`, `crossOrigin=[]` |
| Fail-closed missing configuration | Both `browser-*-unavailable.json` reports PASS, including a forced client-side bypass rejected by the server without inquiry/Project/mail/upload/lifecycle effects |
| Final visible-honeypot correction | Both `browser-*-quick.json` reports PASS after the final one-class fix: honeypot hidden, text/key preserved, missing/invalid/expiry/error/reset and keyboard/status focus, no overflow/errors/unexplained traffic |

The final browser flows establish legitimate About inquiry and lookalike acceptance, shop→contact piece/intent/source propagation, legitimate planner creation with a private image and accessible Project, and both quick-form and planner solicitation quarantine. Failed verification preserves planner values, selected files and confirmation; free-text/URL references remain intact. Tokens are absent from persisted drafts/inquiry context. Administrator-only inquiry/quarantine review is readable at desktop/mobile widths, and anonymous Studio access is rejected. Quarantine creates no Project, mail, upload or lifecycle row; the focused backend checks independently establish unchanged bandwidth/lead-time calculations.

The Chromium/Firefox fixtures use a freshly encoded PNG and the existing isolated snapshot-lab HTTP cookie exception. Production secure-cookie policy is unchanged. The Managed Turnstile widget API and Siteverify responses are explicit isolated doubles; requests still traverse the real server verification/action boundary. This proves application behavior, not live Cloudflare keys or SMTP inbox delivery. Synthetic browser records and private source bytes are excluded from Git.

## Fresh source and scope

Snapshot SHA-256: `c12b643e81a38e44ffb7638b2e2b80afbb15eba4f346cc13c2dff6aa71df13b2` (8,019,968 bytes). It was captured from the discovered production data mount using a disposable reader with a read-only bind and `VACUUM INTO` its own tmpfs. The production container and source mount were not mutated. The source was schema 13; prerequisites 14/15 were applied on each disposable clone before proving the immediate v15→v16 preservation boundary. The source hash remained unchanged. Snapshot bytes are disposable and removed during closure; the capture and clone reports remain.

New-install forwarding defaults are empty; arbitrary saved owner forwarding preferences, policies, templates and extra settings survived the clone checks. Node's SQLite experimental warning remains. Production adoption requires real Turnstile configuration, SMTP configuration if mail delivery is desired, and the normal deployment/recovery gates.

## Closure

The commit containing this audit is the coherent B1 source/tests/docs packet. Its full identity, upstream/remote equality, clean-worktree result, reviewed diff identity, evidence hashes and removal of B1-only disposable runtime resources are recorded in the restricted `closure.json`. Later B2/C/D/E work remains separate. Next manual goal: B2 conditional website-generated routing/BCC.
