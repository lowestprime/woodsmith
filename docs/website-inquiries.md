# Website inquiries

About, Contact and contextual piece outreach use a compact form for name, email, intent, topic, message and optional reference. Published pieces offer inquiry choices consistent with their current inventory and inquiry policy. The server resolves piece titles, availability and identifiers; hidden browser fields cannot override catalog truth. The full commission planner retains dimensions, material choices, estimates, browser/account drafts and private reference uploads. Names or external URLs entered as planner references remain references without asserting a catalog identity.

## Verification and persistence

Anonymous website inquiries require Cloudflare Managed Turnstile. Set runtime `TURNSTILE_MODE=managed`, `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, with the real site hostname allowed by Cloudflare and matching `SITE_URL`. The site key is public; the secret is server-only. Siteverify must confirm success, the configured hostname, action `website-inquiry` and a recent challenge. Missing keys, public dummy keys, provider failures, missing/invalid/expired tokens and unsafe origins fail closed. The forms provide error/status focus, retry/reset and an email alternative. Errors preserve entered text; the planner also preserves selected files for retry. Turnstile tokens are excluded from browser/account drafts and inquiry records.

Test mode is accepted only with `NODE_ENV=test`, or all of: `VISUAL_AUDIT_SNAPSHOT_LAB=true`, `DATA_ROOT=/tmp/data`, `MEDIA_ROOT=/tmp/media`, and a `SITE_URL` hostname matching `woodsmith-intakeqa-…-app`. It is not a production bypass. Managed-provider browser acceptance may use explicit client API/Siteverify doubles in an isolated runtime; that does not establish live Cloudflare configuration.

Schema v16 adds `website_inquiries` and its indexes without rewriting existing rows. Each record includes normalized intent/topic/source, canonical piece context, planner context when applicable, classification version/signals, and an optional commission Project reference. Only legitimate full-planner submissions create Projects. General and piece inquiries do not consume production bandwidth or change estimated lead times. Submission keys are bound to the browser/account owner and payload; exact replays return the existing result and can repair a missing operator notice without repeating the consumed challenge or creating another Project.

The combined-signal classifier quarantines high-confidence SEO/link-placement/service solicitation before Project creation, upload persistence, lifecycle effects and customer mail. A single keyword such as “Google,” “marketing” or “website” is insufficient. Classification is conservative and deterministic; it is not a guarantee that all spam will be caught. Honeypot, origin and existing persisted submission quotas remain enforced.

## Studio and mail

Authenticated administrators review **Studio → Inquiries**, including a separate **Quarantine** view, pagination, original messages, classification signals and linked commission Projects. Messages and planner context are escaped. This view does not release, forward or convert quarantined messages into Projects.

Legitimate general/piece inquiries queue only the `customer_inquiry_admin` operator notice; legitimate planner submissions retain their customer confirmation and Project workflow. Quarantine queues neither. The primary correspondence address remains the configured Builder email, seeded as `woodsmithbb@proton.me`. New-install forwarding defaults are empty. Existing saved forwarding preferences, category policies, templates and account-link recipient protections remain intact. No conditional routing/BCC rules are introduced.

Operator templates may use `inquiryIntent`, `inquiryTopic`, `sourceRoute`, `sourceSurface`, `pieceSlug`, `pieceTitle` and `pieceAvailability`. Existing customized templates are preserved. The authenticated Studio link provides the full record; private files are never attached to operator mail. Missing SMTP configuration does not imply delivery.

## Operations

Deploy only through the normal candidate/recovery gates. Back up SQLite and the media library together. Validate v16 on a fresh disposable production snapshot; retain its hash and migration evidence outside Git. `site/scripts/verify-inquiry-clone.mts` checks the immediate v15→v16 boundary, injected ledger failure/DDL rollback, retry, idempotence, existing-table preservation, startup/reopen and unchanged snapshot bytes. Earlier prerequisite migrations keep their own identities.

`site/scripts/verify-inquiry-browser.mjs` exercises the B1 forms and private review using synthetic data in an internal Docker network. It checks server action rejection/success, selected-file retry, token-free drafts, structured context, quarantine side-effect exclusion, keyboard/focus behavior, and desktop/mobile overflow and error assertions. It requires the isolated provider fixture and an initialized synthetic database; never point it at production.

SQLite remains the current self-hosted persistence implementation, and Node reports its experimental API warning. A future public deployment should use a stable production database such as Postgres or LibSQL. This packet does not deploy or change that architecture.
