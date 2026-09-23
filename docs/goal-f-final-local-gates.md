# Goal F final local gates

Current status: Goal F is deployed at schema 19; live acceptance, recreation, retained Goal-E rollback and return pass. [Release evidence](goal-f-release-evidence-20260922.md) supersedes pending-release statements in the dated checkpoint history below. Native provider activation remains blocked.

Tested repository: `0e193e292fde8f97a24ac0165c4b68745169f99e`. Application source last changed in `f4b22f0dad1f815209dbd3f3fd62588df71aaf8e`. Subsequent evidence-only commits preserve the tested application tree. This is local-source evidence, not production-release proof.

| Command | Result | Restricted log SHA-256 |
|---|---|---|
| `npm run test` | 310/310 pass | `65f4b0a26188412897bcaaf78eb6c391294601cd7457694ba1e238128460424e` |
| `npm run typecheck` | Pass | `e5fc179108edc6396b80bba6f409da369bc6b7689e9d686b2489a37509590359` |
| `npm run lint` | Pass; 0 errors, 6 existing image warnings | `b48dc4240e0aaa6cd8ad8eb84a07bba847beb6e8c1f2ef5818c6564b94340faf` |
| `npm run build` | Pass; standalone runtime-data safety gate included | `88638dde959917b8ddbb056b91381d77e5feb342644e2b7959741156bfc68cd2` |
| `npm --prefix visual-audit run test` | 144/144 pass | `96ee0e331de9c0e96079ef645611dc4c9b762ab52d52284154b471f58fb58790` |
| `npm --prefix visual-audit run build` | Pass | `fd1dbaa84fc425ca9e8aef78eeeebdbf3ec3acc3ddab97a71c566bc9c631ba3c` |
| `npm --prefix site audit --omit=dev --json` | Pass; 0 production dependency vulnerabilities | `7a32c27dd471f971ecf2d3198720816e1bbcf0f03bc5efaa7d4f475515d7e36b` |

Full logs and command timings remain in the restricted Goal-F evidence root (`final-gate-*.log`, `final-gates.json`). Actual TAP totals were inspected. The canonical suite covers migration rollback, retry, idempotence, reopen, older-schema upgrades, ownership backfill and provider-operation persistence. No extra duplicate migration run is needed. Node SQLite experimental and module-type warnings remain disclosed; no database/dependency change was made to silence them.

Candidate smoke, final bounded Chromium/Firefox acceptance, production transition, fresh recovery/staged restore, recreation, retained rollback/return, PR integration and master-only closure remain open. Native Stripe/EasyPost/Proton activation remains provider-blocked.

## Exact isolated candidate

Frozen candidate source: `0fac8c242b6b87e07f7b60d4c460ee244a48c66a`; local Docker Desktop image `woodsmith:candidate-0fac8c24`, immutable image identity `sha256:1e9f9aeaebb540a787e23bf0732687d9a0a22707539e8196ddd474c12bed53d3`, Linux/amd64. Built from `git archive` of the clean pushed commit, with exact source label. The tested `site` tree is identical to `0e193e2`; the freeze commit only records gate evidence. Later evidence-only repository commits do not change this candidate's source identity.

Isolated smoke passes 15 public/authentication routes, all HTTP 200, with no retired seeded developer/footer copy in fresh state. Schema 19 initializes with `quick_check=ok`, zero foreign-key violations and multi-worker mode disabled. A synthetic mounted image is indexed and its media mount is readable/writable. Image inspection covers 1,908 application/dependency files: no `.env`, SQLite/runtime database or recovery payload; baked data directory empty, no media tree. This is clean-image/fresh-state proof, not migrated production-copy proof.

The disposable container, both disposable volumes and temporary synthetic secret file were removed. The candidate image is intentionally retained. Restricted evidence: `candidate-build.json`, `candidate-build.log`, `candidate-smoke.json`, `candidate-smoke-app.log`. Production remains unchanged. Final bounded browser/candidate migration, fresh recovery/staged restore and the entire release transaction remain pending.

## Exact-candidate browser and current-production clone — September 22

Chromium and Firefox pass 28 bounded exact-image groups: 320/390/430/768/1024/1440 layouts, keyboard theme switching, SSR/reload parity, persisted public pricing and sanitized category imports, and administrator/new/seller Process previews. Zero unexpected page/console errors or cross-origin requests. The synthetic runtime was removed. Restricted reports: `candidate-pricing-browser.json`, `candidate-process-browser.json`, `candidate-layout-browser.json`.

The identical platform image was transferred to the NAS without rebuilding. NAS image identity is `sha256:31a0ab6bbc4d4b14f32b3888463eb05621b0fc318e7570ac607e8647a570f373`; source revision and every RootFS diff ID match the laptop candidate. Transport hash and UID 1026 recovery-helper readability pass.

A fresh paired snapshot of current production and staged restore pass all manifest/file checks: 3,187 media files, 1,978,750,161 bytes; environment included; manifest SHA-256 `f91093602fdf11b4deec30273d4c2a75ee7e02253edfaaad2208aff9716d46ca`. The isolated production-derived clone upgrades schema 16→19, passes 13 HTTP routes, SQLite quick_check/foreign keys and reopen. All 453 owned resources map to primary, no conflicts; multi-worker mode stays disabled and primary fee version 1 is accepted at zero basis points.

The only existing-data differences are the intended three audited legacy-credit removals. Replaying those exact removals reproduces the resulting settings while preserving all other customization; the developer account only changes public visibility/timestamp. Customer/project/order/inquiry/media and other existing tables compare equal. Separate disposable compatibility runs prove the retained Goal-E image opens schema 19 and the intended candidate reopens it afterward; all 58 compared application tables remain equal (derived FTS and media scan timestamps excluded). All clone runtimes were removed. Restricted evidence: `clone-acceptance.json`, `clone-diff-and-compatibility.json`, `candidate-transport.json`. This is not the required live rollback/recreation proof.
