# Goal F release evidence — September 22 local / September 23 UTC

Production work is verified. PR integration/master-only Git closure is recorded only after it occurs.

## Immutable identities and final source gates

- Frozen/deployed source: `0fac8c242b6b87e07f7b60d4c460ee244a48c66a`.
- NAS Linux/amd64 image: `sha256:31a0ab6bbc4d4b14f32b3888463eb05621b0fc318e7570ac607e8647a570f373`.
- Returned production container: `de5af6a5735f689e102f8e46783a1ef59d85b56b0bb0698a54e1d8a1fc6ac98c`.
- First promoted container: `222085c490db668633f96169addccede8da00e613cfbaf683e2827e0cc5f21b7`.
- Schema 19. Evidence/documentation commits do not alter the candidate application/Docker/Compose trees.

Retained final-source gates: 310/310 application tests, 144/144 visual-audit tests, typecheck, lint (zero errors/six accepted image warnings), both builds, zero production dependency vulnerabilities. [Detailed gate evidence](goal-f-final-local-gates.md) also records exact-image smoke, 28 Chromium/Firefox candidate groups and fresh-production-clone 16→19 migration. No passing gate was repeated merely for reassurance.

## Recovery and production transaction

Fresh recovery `goal-f-predeploy-20260923T013229Z` includes SQLite/runtime, environment and 3,187 media files (1,978,750,161 bytes). Manifest SHA-256: `cb3999d3896a135add1c87ea97bba227a934f700cd937a54b32f2a7efbedb6dc`. Complete verification and restore to new paths pass file hashes, quick_check, foreign keys and current/staged equality. The earlier acceptance clone was not substituted.

The initial guard failed because NAS Python SQLite lacks FTS5. The operator harness moved the same complete logical all-table comparison to the candidate Node SQLite runtime with read-only mounts. Scope was unchanged; the guard passed before production mutation. This was runtime portability, not production damage. Compose JSON dollar escaping required no credential override; the environment remained unchanged.

Actual sequence: promote → recreate → retained Goal-E rollback → return to Goal F. All stages pass exact image/schema, integrity, intended writable mounts and internal/HTTPS health. The old container `4ebb15e6b05f59af4c96f2b5edeb4d37171604a2fe1e9d48cc5e8277ad5cb5d2` actually served upgraded schema 19 before return. Recreation created the final container above.

All 54 stable core application tables, owner settings, environment and every media hash survive. Sessions, visitor telemetry and submission quota are excluded because acceptance exercises them; derived search and media scan timestamps are also separated. One interrupted audit session was identified exactly and removed; ordinary test sessions logged out and the temporary browser credential file was removed. No real customer account was changed.

Restricted evidence: `predeployment-recovery-gate.json`, `production-transaction.jsonl`, and `state-proof-{promoted,recreated,rollback,returned}.json`. Payloads stay outside Git. Fresh recovery/staged proof and deliberate Goal-E/v19 rollback assets remain retained.

## Public copy and media truth

Cache-busted Chromium/Firefox covers home, portfolio/dining detail, shop/cart, About, contact, commissions/status, Process, search and auth forms. About/contact retain quick inquiry; commissions owns the detailed planner. Context preserves piece/intent/source; contact remains `woodsmithbb@proton.me`. Cooper's exact seeded public flag is false; legacy Website/repository footer defaults are absent. Replaying three audited removals reproduces current settings and preserves arbitrary owner custom content.

All 23 published pieces retain usable media, with no portfolio placeholder. Dining identities retain their proven byte provenance; every original matches fresh recovery. No rename/reassignment/guessing occurred. Production has no published Process post; exact-image detail/preview fixtures supply that coverage without inventing public content.

## Accounts and private access

Real owner login/logout and Secure/HttpOnly/Lax cookies pass both engines. Authenticated Studio/profile/projects and anonymous private-route gating pass. Anonymous account projects intentionally renders only a login prompt. Private project/worker/render/staging namespaces return uniform 404/no-store. Production has no project attachments; existing-resource positive/cross-owner bytes and customer projects remain covered by retained isolated acceptance and final tests.

Verification, reset expiry, session revocation, avatar preview/cleanup, account rename/delete and last-admin protection retain their final-source/fixture evidence. Current authentication deliveries have no additional CC/BCC; accepted real Goal-E SMTP/auth isolation remains applicable with unchanged configuration. No customer reset mail was sent.

## Estimator, capacity and editorial controls

Current saved type hours/markup produce exactly the public estimate and lead-time value. Production has zero projects/orders: queue zero, 21-day base, capacity 10 percent, and **Paid order value · created this month** zero. Final regressions cover active/closed/other-business work and unpaid/refunded orders. No fake workload/sale was inserted.

Current categories have no raw SVG textarea; exact-image new/existing sanitized imports remain proven. Private Process preview opens without saving/publication. Harness corrections selected the contextual link instead of the generic header Contact link, recognized the intentional login prompt/streamed redirects, and used the real `process` panel instead of obsolete `posts`. They changed no application code.

## Business ownership and provider boundaries

Live schema 19 has 453 primary-owned resources, zero conflicts, mode OFF and primary fee zero basis points/version 1/accepted version 1. Administrator business management works; anonymous seller/admin access is denied. Retained two-business/two-account/two-customer fixtures and final tests prove all owned-resource boundaries, fee immutability, forged IDs, mixed-cart rejection, provider-account binding and retry/reopen. Enabled multi-worker testing remains isolated; today's production stays William-centered.

Stripe/EasyPost native activation and direct inbound Proton rules remain external blockers; [exact actions](goal-f-provider-activation.md). Paid cleanup/photorealistic enrichment stays optional/off. No real charge, label or customer message was created.

## Live security and browser evidence

HTTP 301→HTTPS, www 308→canonical, host-only HSTS `max-age=31536000`, nosniff, referrer policy, DENY framing and Permissions-Policy pass. CSP remains absent, with no false claim or speculative policy. Foreign origins return 403. Empty Turnstile token is rejected before inquiry/project/mail persistence. Theme keyboard/reload/SSR and representative overflow checks pass. Production sidecar health returns authenticated 200 and wrong-bearer 401; local CLIP ViT-B-32 is reachable. Retained CUDA/cache/lexical fallback proof remains applicable.

Completed authenticated/navigation report: 46 checks. Returned Chromium/Firefox report: 46 checks, zero failures/page errors/unexpected console errors/unexplained origins. Successful public observations plus targeted pricing/security/editorial reports supplement these. Cloudflare challenge/Insights origins are explained. Restricted reports: `release-live-auth.json`, `release-live-returned.json`, `release-security-headers.json`, `release-security-behavior.json`, `release-live-services.json`, `release-pricing-ui.json`, `release-session-cleanup.json`. `release-live-promoted.json` retains successful public observations and the superseded harness assertions, not application failures.

## Documentation and Git closure

Current manuals now identify Goal F; dated A–E/checkpoint records stay historical. Tracked content review covered 80 original paths with zero forbidden runtime/secret/cache/media/recovery artifacts. Final documentation receives the same review. Application/Docker/Compose remains identical to the frozen candidate. PR integration/master-only topology remains explicitly open until verified.
