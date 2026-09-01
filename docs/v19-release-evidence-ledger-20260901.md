# Beaman Woodworks v19 release evidence ledger

Updated: 2026-09-01

This ledger records the immutable evidence used to release Woodsmith v19. It separates the deployed application identity from later audit-runner-only repairs and does not treat a neighboring gate as proof of another gate.

## Authoritative identities

- Deployed application source: `0067488abb058829f3b94584c02ea666e552c9a8`.
- Laptop application image: `woodsmith:candidate-0067488`, image ID `sha256:255ceb831ce0d89d1277fb857f7bb04838ef2691d86fcc4c2685114e777ee673`, `linux/amd64`.
- NAS application image ID: `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`; runtime label `WOODSMITH_BUILD_SHA=0067488abb058829f3b94584c02ea666e552c9a8`.
- Final audit-runner source: `686a69c0cc5011394f35add750c29663626990f8`.
- Final Tier-3 audit image: `woodsmith-visual-audit:app-0067488-audit-686a69c`, image ID `sha256:af331cd8e2cde82cf4923f659370b7e6e7fe17d9fdbc2079bc45bfbc14aec6e9`, `linux/amd64`.
- Source branch at evidence freeze: `codex/woodsmith-v19-admin-completion-20260721`.

The `site` tree is byte-identical at application commit `0067488` and audit commit `686a69c`: both resolve to tree `60afd107a3b4d6c805497f79dc7cc01aaaeb38c2`. Every intervening changed path is under `visual-audit/src`. The audit repairs therefore do not invalidate or require rebuilding the deployed application.

## Source and image validation

The immutable release manifest is:

`C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\release-manifest.json`

It records:

- 188/188 application tests passed.
- 132/132 audit tests passed at the packaged application identity; the final audit-only repair suite later passed 144/144.
- TypeScript, lint with zero errors and eight established image advisories, safe production build, standalone runtime-data gate, and image filesystem safety passed.
- Both packaged images are `linux/amd64`, carry exact revision labels, start without runtime data, and contain no database, backup, secret, evidence archive, or production media.

The final audit image was inspected separately before Tier-3 and retained exact audit revision `686a69c`. The final smoke and full Tier-3 acceptance records below bind its image ID to the deployed application SHA.

## Tier 1 synthetic snapshot lab

- Run: `local-lab-smoke-20260831T035148Z-0067488a-749c5c277c`.
- Terminal record: `C:\Users\Cooper\.codex\run-logs\woodsmith-exact-snapshot-lab-0067488-20260830.terminal.json`.
- Terminal record SHA-256: `f995c29dc2db4019ab3494346c9a504122930386f4d934d610111e65cd2de6ad`.
- Result: terminal success; 48 routes, 413 observations, 171 captures, 335 checksums, zero validation failures, zero unexpected diagnostics, and zero cross-origin requests.
- Mutation proof: exactly ten permitted clone-only successful writes, zero residual commission drafts, SQLite `quick_check`, unchanged source data/media, matching clone media, and complete ephemeral cleanup.

## Tier 1 full live-readonly

- Run: `local-readonly-full-20260831T035502Z-0067488a-b198068c12`.
- Terminal record: `C:\Users\Cooper\.codex\run-logs\woodsmith-exact-tier1-full-0067488-20260830.terminal.json`.
- Terminal record SHA-256: `239fb47fdcedbb70adcee30ec5281d2bfa2c10f201aad3d2076a471ff385db81`.
- Result: terminal success; 1,513 routes, 17,011 observations, 5,080 captures, 4,325 checksums, zero validation failures, zero unexpected diagnostics, zero successful unsafe requests, and zero cross-origin requests.
- Cleanup removed ordinary run resources and deliberately retained one restricted output volume.

## Tier 2 production clone

- Run: `tier2-local-full-20260831T042104Z-0067488`.
- Terminal record: `C:\Users\Cooper\.codex\run-logs\woodsmith-exact-tier2-0067488-20260830.terminal.json`.
- Terminal record SHA-256: `fa0f13a392a2081cc9e762234d1cf27527d43eb79ef6eb925a9111e4d5e94d8c`.
- Result: terminal success; capture, compare, report, and validate all passed in 2,073 seconds.
- Coverage: 1,863 route records, 23,493 observations, 5,961 captures, 656 special tasks, 23,493 completed keys, and 5,347 checksums.
- Safety: zero validation failures, zero unexpected diagnostics, exactly twelve expected clone-only successful writes, zero cross-origin requests, and passing live-media and placeholder reports.
- Source stability: manifest remained `878dd6e7c8d95592f25fe4da6a6af61b8e642328aa7e1677c27065ba959824f5`; database remained `3062975a62366cb5bf4ec992c9293c921d540d9bb8669cb4316887051637b401`; 3,191 media files and 1,979,166,145 bytes were reconciled.
- Migration: schema migration count advanced from 6 to 13; first-start and restart schema hashes both equal `6b9aece506e338b9b32fd066a8c1edc090693f8d8de38c974dcfada2c77a5dff`; restart idempotence and `quick_check=ok` passed.
- Artifact hashes: manifest `8f15f3bc66f8998b01a2acb61635cbe135b9cc0152e4a368078eb228a0359880`; validation `ca79b809855559dcdf724a613eb73be1bf45bd6e63f31a4a5bcb1ac76a9323d6`; checksum JSON `212dbc14d2401920d311e304b7ed7fc0554ffc2f61a05a93ccf11a5784464223`; checksum set `9499e2c249b26543c4b31e22a264e8845518e3a3448cdfd2ff9de186c34c7b6e`.

## Deterministic release package

Release root:

`C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z`

The package passed gzip integrity and uncompressed-tar hashing before transfer:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `woodsmith-app-linux-amd64-0067488.tar.gz` | 98,098,529 | `21d01a17927d01710a199efcfb54c67e8d6a78a3977e80f6b40f3debbb098515` |
| `woodsmith-visual-audit-linux-amd64-0067488.tar.gz` | 985,068,155 | `bbdab6357e9e95d0687134e26ba91c07989641b11aa2fd785c2aa6cb88a1ca2e` |
| `release-manifest.json` | 8,439 | `1d6bda1ada76e03ea9e3e65661dacc43d9681565c22099229060eb3364ed2bd4` |

The verified NAS copy is under `/volume2/docker_ssd/woodsmith/releases/candidate-0067488-20260831T050142Z/` with the same `SHA256SUMS`.

## Paired backup and staged restore

- Run: `release-0067488-20260831T075230Z`.
- NAS backup: `/volume2/docker_ssd/woodsmith/backups/runtime/woodsmith-runtime-release-0067488-20260831T075230Z`.
- Backup manifest SHA-256: `97afa1e660299bc7c4646e14e02c5ba10aed6f5da726f74314cf86f3f7c429c5`.
- Database: 6,115,328 bytes, SHA-256 `3062975a62366cb5bf4ec992c9293c921d540d9bb8669cb4316887051637b401`, `quickCheck=ok`.
- Media: 3,191 files and 1,979,166,145 bytes.
- Staged restore reconciliation: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\nas-staged-restore-release-0067488-20260831T075230Z.reconciled.terminal.json`.
- Result: staged database and environment hashes matched the backup, `quick_check=ok`, media count matched, staged media root mode was 700, and reconciliation exited successfully.

The first host wrapper failed before piping output, and its retry then failed closed on the already-created destination. Those wrapper failures are retained as diagnostics. They are not the accepted result; the immutable NAS backup manifest and staged restore reconciliation are the authoritative successful evidence.

## Deployment and post-deploy validation

- Deployment operation: `deploy-0067488-20260831T080300Z`.
- Terminal record: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\deploy-0067488-20260831T080300Z.terminal.json`.
- Result: terminal success; NAS candidate image ID `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`; rollback image ID `sha256:84b96abc2ddd7066b5fe63e6385b17dea7c905eda35221314b5a0203ffac1884`; deployment log SHA-256 `584b9934f5b711fd9eee854404b90be6861587f937baa9029fd1ae6664e596c6`.
- Composite post-deploy record: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\postdeploy-internal-0067488.composite.terminal.json`.
- Result: routes, security, database, search, mounted media, SMTP configuration, authenticated sidecar health, wrong-token rejection, and final logs passed. SQLite `quick_check` and integrity passed at schema 13; FTS expected/indexed counts were 473/473 with zero missing, unexpected, or duplicate entries.

The running NAS container reports application image ID `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`, exact `WOODSMITH_BUILD_SHA=0067488abb058829f3b94584c02ea666e552c9a8`, `DATA_ROOT=/app/site/data`, `MEDIA_ROOT=/app/pics`, and writable data, media, and Next image-cache mounts.

## Recreation persistence and ingress

- Persistence record: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\persistence-recreate-0067488.terminal.json`.
- Result: forced recreation preserved migration fingerprint `6932ca0f9d5911ceae19d8bfdf944fcd1516116fa39154a785cb46c0c86569a7`, persistence fingerprint `a9cfdd6c8a3da4b80c6242e0e400d3f536203519923efca58a3d49fe527ea734`, 473/473 FTS records, all 3,191 media files, six route probes, authenticated sidecar health, and SMTP TLS/authentication verification without sending email.
- Canonical ingress returned 200; retired `ws.lowestprime.synology.me` returned 410.
- External ingress record: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\ingress-external-validation-0067488.terminal.json`.
- Cloudflare result: five canonical routes passed, `www` redirected with 308, HTTP redirected with 301, and the retired hostname returned 410.

## Rollback and return to candidate

- Run: `rollback-proof-0067488-20260831T164345Z`.
- Terminal record: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\rollback-proof-0067488-20260831T164345Z.terminal.json`.
- NAS proof: `/volume2/docker_ssd/woodsmith/rollback-proofs/rollback-proof-0067488-20260831T164345Z`.
- Result: ingress was disabled during the swap; rollback image `sha256:84b96abc2ddd7066b5fe63e6385b17dea7c905eda35221314b5a0203ffac1884` started with schema 6; the exact candidate then returned with image `sha256:904bf2785c37c4d2ac80c1dffba6f5c035d484fe8075235d5deb5fd93150085c`, schema 13, and the original migration/persistence fingerprints.
- Final validation: `C:\Users\Cooper\AppData\Local\Woodsmith\releases\0067488-20260831T050142Z\rollback-proof-0067488-20260831T164345Z.final-validation.terminal.json`; canonical status 200, legacy status 410, FTS 473/473, SMTP TLS/auth verified without send, and rollback-used media 3,191 files / 1,979,166,145 bytes.

Rollback image, paired backup, staged restore evidence, and rollback-used state must remain retained through the operational stability window.

## Tier 3 live-production smoke

- Run: `tier3-live-smoke-20260901T042509Z-0067488-686a69c-6ef843ed`.
- Acceptance: `/home/cbeaman/woodsmith-release-evidence/tier3/tier3-live-smoke-20260901T042509Z-0067488-686a69c-6ef843ed.acceptance.txt`.
- Result: terminal PASS; 36 routes, 328 observations, 153 captures, 308 checksums, zero unexpected diagnostics, zero unapproved cross-origin traffic, zero successful unsafe requests, and complete cleanup.
- Hashes: manifest `b1d98af935278421fb2d90cfe31c8c988bbba4e35e300279011c8158d010a4d0`; validation `43c3809a7b3e484803fb9d3cc20eb53ea6b43ef0c9ba1e6079037d51e84c9115`; checksum set `6b8082e49eef1b736747738e1f4ed1aaaed642917de417af6ce0138db5688032`.

## Tier 3 full live-production archive

- Run: `tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1`.
- Root: `/home/cbeaman/woodsmith-release-evidence/tier3/tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1`.
- Terminal: `/home/cbeaman/woodsmith-release-evidence/tier3/tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1.terminal.json`.
- Acceptance: `/home/cbeaman/woodsmith-release-evidence/tier3/tier3-live-full-20260901T042651Z-0067488-686a69c-e79d0ed1.acceptance.txt`.
- Result: terminal PASS; capture, diff, report, and validation passed from `2026-09-01T04:26:51Z` through `2026-09-01T05:04:15Z`.
- Coverage: 1,784 routes, 22,347 observations/completed keys, 5,948 captures, and 5,337 checksums.
- Identity and uniqueness: zero duplicate observation keys, duplicate capture keys, duplicate completed keys, or capture keys without observations.
- Security: zero unexpected diagnostics, zero unapproved cross-origin requests, zero successful unsafe requests, and 5,498 explicitly recorded expected-blocked Cloudflare Insights infrastructure requests. Generic cross-origin traffic remained fail-closed.
- Recovery: one deterministic serial media-inspector shard retry succeeded; the original failed attempt remains recorded and no failure was discarded without an identical passing replacement.
- Hashes: manifest `f0a1cf4d07c06e6234c343b0e1abd1354d24712049671d637f8bbba827af8473`; validation `30647d1a6e56f7fb6a66885a3ef330a6ad345423c1690d5c8c4c262db3a7cd5b`; checksum set `5825258553b71a16eea9542d1c52c1ac85d90f00ec2ee43dd6a7fa4bd4bc6479`.
- Cleanup: runner processes, run-scoped containers, and the Tier-3 lock are absent after terminal success; the restricted output root is preserved.

## Superseded diagnostics

Failed and superseded archives remain retained and are not release evidence. In particular, `tier3-live-full-20260901T033835Z-0067488-5884407-ef317078` passed capture/diff/report but failed validation on four transient media-inspector stalls. Its launcher is preserved at `/home/cbeaman/woodsmith-release-evidence/run-tier3-live-0067488.failed-full-20260901T033835Z-5884407.sh`, SHA-256 `ec54f39726df5b08c87736a792b4ab70ab0853b2a7133cebd4b142a514540c88`. Audit commit `686a69c` introduced the bounded serial fail-closed retry proven by the final smoke and full run.

## Classified residual caveats

- `Strict-Transport-Security` remains absent at the Cloudflare edge. Canonical HTTPS and redirects passed, but HSTS must be enabled in Cloudflare before this caveat can be closed.
- SMTP, Stripe, EasyPost, and optional model providers remain configuration-dependent. SMTP TLS/authentication was verified without sending; disabled or unconfigured providers continue to fail closed and report their state honestly.
- Local persistence uses `node:sqlite`, which remains experimental in the current Node runtime. A future public scale-up should migrate to Postgres, LibSQL, or another stable production database.
- Full piece-to-photo semantic truth remains subject to manual woodworker review. The implementation intentionally withholds or review-marks uncertain associations rather than guessing.

## Pull-request closure boundary

This ledger is committed on PR #7 before ordered integration into `codex/sitewide-studio-ux-commission-overhaul-20260711`, followed by PR #6 into `master`. Merge commits, the final evidence tag, and the reconciled master/live identities are recorded in the restricted final handoff so this evidence-bound source history is not amended or rewritten.
