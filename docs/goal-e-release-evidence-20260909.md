# Goal E release evidence

Status: SAFE PREDEPLOYMENT CHECKPOINT at 2026-09-09 16:44 UTC. Source, candidate and final paired recovery gates below pass; production still serves accepted v19. The current allowance was 96% consumed, so no production transition was begun. Goal E remains active, not complete.

## Source and release-gap classification

Starting authoritative checkout: `/home/cbeaman/src/woodsmith`, clean Goal branch at `c594aba8d72c88d668fe3f1a58b694a218264ad7`, equal to upstream and GitHub. Current remote master starts at `57def6436af7c4a514181d7307c112fa157f73c8`. NAS/CIFS checkout starts clean at `81b35c4`; its older source does not identify the running image.

| Requirement | Classification and evidence |
| --- | --- |
| A/B1/B2/C/D invariants | Closed evidence reused. No intake, routing, Visitors, media provenance, copy migration or profile implementation reconstructed. |
| Framework/security | Next.js and eslint-config-next 16.3.4 match current stable npm and official supported/security guidance. Nodemailer 9.1.1, sharp 0.35.4 and targeted transitive patches close new advisories. Application and audit npm audits report zero vulnerabilities. |
| Release accessibility | Production-clone route pass: 62 cases at 320/390/768/1440 in Chromium/Firefox, both themes, zero overflow, broken visible media, unexpected errors or cross-origin requests. Dense Studio: 30 checks with autosave, selection, failure recovery and restored edits; zero violations/errors. Final targeted pass: 16 cases including genuine buyer sessions, changed ARIA/link semantics, and no noncontrast unresolved axe checks. Manually inspected dense light/dark captures; sampled normal-text contrast minimum 6.379:1. Logos remain the text-contrast exception. |
| Release performance | Traced a streamed-loading footer shift; reserving one viewport reduces CLS from about 0.23 to 0–0.0013. Representative warm lab LCP 48–164 ms after repair; empty-cache first initialization reached 5.172 s. This is laboratory/startup evidence, not field p75 or an INP claim. Preserve writable persistent image cache and prewarm candidate before ingress. |
| Media/content truth | Fresh paired production clone: 3,187 files / 1,978,750,161 bytes, fully hashed. Original backup/media mounted read-only for QA. No original altered or uncertain identity reassigned. The two Goal-A dining-table paths remain editorial identity gaps. |
| Migration/data | Fresh schema-13 snapshot SHA-256 `8d2ec639fba92d919a70ec24840cbcbdcc2e4fe6c4009ffb5f211c4596246c5d`; actual/customized/injected-failure scenarios pass prerequisite v14/v15, v16 preservation of 50 existing tables, rollback/retry/idempotence/reopen and unchanged source hash. |
| Source gates | 254 application tests, 144 audit tests, typecheck, lint (zero errors/six established image warnings), production build/standalone runtime-data gate. Compose validates using the restricted current runtime environment without printing configuration. Final header-inclusive application tests/typecheck/lint/build also pass. |
| Turnstile/intake | Operator supplied real Managed Turnstile runtime keys after initial recovery. Presence and managed mode independently verified without disclosing values. Consume only at candidate/deployment boundary. Live verification remains pending. |
| SMTP/routing/auth | SMTP configured; provider-live TLS/auth, safe delivery, conditional routing and auth isolation remain deployment gates. Canonical business address remains woodsmithbb@proton.me. Private recipient preferences remain persisted runtime state. |
| Commerce/providers | Stripe/EasyPost absent: retain truthful unconfigured/degraded behavior and prohibit real charges/labels. No configuration is fabricated. |
| Proton inbound | Provider-side only. No authenticated provider session exposed. Operator action: sign into Proton settings, inspect/configure forwarding/filter rules for the business mailbox and intended operational recipients, then verify using an owner-controlled sender. Application-generated routing does not inspect arbitrary inbound mail. |
| HSTS | Application adds host-only `max-age=31536000`, without subdomain/preload expansion. Exact-image and live edge propagation remain required. |
| Candidate/recovery/live/Git | Exact clean replacement candidate and post-Turnstile paired backup/staged restore PASS (identities below). Pending: NAS candidate smoke with production UID/config, immutable deploy, live providers/intake/routing/auth, persistence, rollback/return, PR/master integration and branch consolidation. |

Security references: [Next.js August release](https://nextjs.org/blog/august-2026-security-release), [support policy](https://nextjs.org/support-policy), [Nodemailer parser advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2), [Nodemailer content-access advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8m3c-c648-2xjj), [sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).

## Storage and pre-cleanup recovery

CIFS `//192.168.1.126/docker_ssd/woodsmith` maps through Samba `path=/volume2/docker_ssd` to the NAS project directory. Matching Git/environment file hashes corroborate identity. Project storage is counted/deleted once; source media is separately mounted from volume1.

KEEP: source/history/tags; production DB/environment/media; all paired backups; current and earlier production rollback images/state; accepted v19 archive/evidence; immutable baselines; Goal-E evidence and staging restore. Private runtime copies use restricted paths and permissions outside Git.

DELETE: six obsolete generated audit trees (the August 14, 21, 22, 25, 27 and July 19 full runs named in the restricted storage ledger), superseded by accepted v19 evidence; optimized image cache only; unused NAS pre-v19 audit Docker images. REBUILDABLE KEEP: old node_modules and .next, whose extents are snapshot-shared. No shared-folder snapshot or unrelated Docker resource deleted.

Btrfs-aware measurements:

- The six audit trees total 197,070,393,344 allocated bytes, with **zero exclusive bytes** at measurement. Both NAS and CIFS confirm their removal. Scheduled September 8/9 share snapshots retain those extents; do not report this namespace reduction as physical reclamation.
- Rotated image cache measured 804,118,528 total bytes and 323,584 exclusive bytes immediately before deletion. Concurrent snapshot/metadata activity prevents attributing the overall project-volume delta to deletion alone.
- Project volume2 used bytes: immediate before 7,271,239,225,344; immediate after 7,271,395,520,512; settled read 7,271,246,065,664. No positive net SSD physical saving claimed. Existing snapshot retention controls future release of shared blocks.
- Docker root is on **volume1**, separately counted. Removing only unused `woodsmith-visual-audit:candidate-*` images changes used bytes from 21,579,808,387,072 to 21,577,010,847,744: **2,797,539,328 bytes measured net physical reclamation**. Production and rollback application images remain intact.

Pre-cleanup recovery: `woodsmith-runtime-goal-e-precleanup-20260909`; manifest SHA-256 `994106b8d67c0a94fe293aa828ecd5803bd95c6570188190d33197aa3c4d6bb8`, SQLite quick_check ok, 3,187 files and 1,978,750,161 media bytes. NAS staged restore and independent laptop full-file verification pass. This recovery predates the Turnstile environment change and **cannot serve as the final predeployment recovery point**. A restricted supplemental environment copy preserves the operator update until the mandatory new paired recovery.

## Evidence handling and current safe boundary

Restricted work: `/home/cbeaman/woodsmith-goal-e-20260909`; NAS operational evidence: `releases/goal-e-20260909`. These contain private clone/recovery bytes and are outside Git. Track only this redacted ledger and source/docs changes. Temporary fixture users and mutations exist only in the isolated clone.

Production remains image `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`, source `0067488abb058829f3b94584c02ea666e552c9a8`, with writable expected DB/media/cache mounts and successful internal/HTTPS health. Prior rollback `sha256:84b96abc2ddd7066b5fe63e6385b17dea7c905eda35221314b5a0203ffac1884` is retained. No production recreation, deployment or branch deletion has occurred.

SQLite remains experimental in Node. Public scale-up should move to Postgres, LibSQL or another stable production database.

Candidate rejection: the first dc322fab image passed runtime/browser checks but its recovery-helper files were unreadable under configured NAS UID 1026. No production transition occurred. Dockerfile now explicitly grants read/traverse permissions to the recovery helpers, matching public/static assets. A replacement clean-commit image must pass UID-1026 helper execution, fresh recovery/staged restore and all exact-image gates before promotion.

## Accepted replacement candidate and final recovery checkpoint

- Candidate build source: `a019ec6c3e829983a20d7af939cf082420fbdb55`. Later ledger-only commits do not change its application/Docker/Compose input trees.
- Candidate tag: `woodsmith:candidate-a019ec6c`. Laptop OCI index: `sha256:f23e41b081359760fb8106bb850a55611297c2c66ffa6cc4a13aeb34d0399552`.
- NAS image / immutable platform configuration: `sha256:9424406acdcf6e28bdb888666b93475c8fc26124724635d97c219d6b19f7e9c3`. Different engine identifier representations are reconciled by identical platform configuration and every RootFS diff ID; no NAS rebuild occurred.
- Transport artifact: `releases/goal-e-20260909/candidate-a019ec6c-linux-amd64.tar.gz`; SHA-256 `87a77ab6861e4801b94ed8cd876439cd19a06468d090063ab363e7643bade851`. Gzip/tar/config integrity and transfer hashes PASS.
- Linux/amd64; Node 22.23.2; Next.js 16.3.4. No baked database/environment/production media. UID 1026:100 can read all 1,823 application files, including both recovery helpers.
- Exact replacement runtime passes 254/254 application tests and 16 Chromium/Firefox targeted real-media/buyer/Studio browser cases, zero failures; minimum sampled normal-text contrast 6.379:1.
- NEW paired recovery: `backups/runtime/woodsmith-runtime-goal-e-final-a019ec6c-20260909`. Manifest SHA-256 `3f2a340af9d010f9a596d4d507f829682fc4457ade23d4b44bd2c81aa17b8afb`; SQLite quick_check ok; 3,187 media files / 1,978,750,161 bytes.
- Staged restore PASS: `restores/goal-e-final-a019ec6c-20260909-data`, `/volume1/homes/Cooper/Photos/.woodsmith-restore-goal-e-final-a019ec6c-20260909`, and restricted `restores/goal-e-final-a019ec6c-20260909.env`. Current NAS environment, final paired environment and staged environment hashes match. Backup environment mode is 600. Credentials were not printed, diffed or staged.
- Production container remains `651cebbd441245c374045b14d3392d826aa3dccf1cf7957cf18509ef5262d02a`, old image `904bf2785c37…`, started 2026-08-31T16:48:53.622800709Z. Final live HTTPS probe returns 200. Old production has not loaded the new keys.
- Disposable Goal-E local application/browser containers and internal QA network removed; NAS backup/restore helper containers exited and were removed. Candidate/recovery/evidence retained. No branch deletion, PR merge, production deployment, restart or rollback transition performed.

Resume the EXISTING Goal: minimally recheck current clean Git and candidate/runtime/environment identities. Revalidate or refresh paired recovery if production/environment/media changed after this checkpoint. Complete NAS exact-candidate smoke before promotion, prepare a fail-closed production/rollback transaction, then deploy the recorded image without rebuilding. Finish all live/persistence/rollback/master-only gates before marking complete. Do not use the rejected dc322fab image or its failed recovery attempt.
