# Notification Routing

This describes the deployed Goal E release. Live canonical inquiry delivery, conditional BCC, quarantine exclusion and authentication-mail isolation passed; temporary rules and fixture deliveries were cleaned. See [release evidence](goal-e-release-evidence-20260909.md).

## Address Roles

| Setting | Meaning |
|---|---|
| Settings: Builder email | Primary woodshop/customer correspondence address and event recipient for new inquiries, buyer replies, review submissions, and order-review requests. |
| Notifications: Overview: Global forwarding recipients (BCC) | Copies applicable application-generated notification emails. Stored in `site.email.forwardTo`. Empty means no global copies. |
| Types: Configured recipients | Primary destinations selected by the existing Event only / Configured only / Event and configured policy. |
| Types: Forwarding recipients (BCC) | Additional copies for that type, not a replacement for the global default. |
| Overview: Conditional website-generated BCC | Additional private copies for matching legitimate B1 inquiry notices and planner customer confirmations. Empty by default. |
| Legacy account/visitor notice recipient | `notificationForwardEmail` remains the primary destination for those existing administrator notices, with the existing Builder fallback. It is not global BCC. |
| SMTP From | Sender identity selected by the existing runtime/site transport configuration. It is not a forwarding destination. |
| SMTP Reply-To | The site's `email.replyTo`; governs replies to delivered messages, independently of Builder email and BCC. |
| Mailbox/provider forwarding | External rules in Proton, Gmail, or another provider. The application cannot inspect, configure, or guarantee them. |

Changing routing never changes SMTP authentication. SMTP credentials remain environment-only; the SMTP view retains its redacted verification and test workflow.

## Editing and Effective Routing

Global forwarding uses the typed Studio autosave queue, expected-version checks, replay-safe operation IDs, and administrative audit history. An explicitly emptied field clears the saved value. A stale tab cannot overwrite a newer save. Validation errors offer **Retry save**; version conflicts offer **Use latest saved version (discard my edits)** rather than an implicit force-save.

Plain ASCII addresses (including punycode domains) may be separated by newlines, commas, or semicolons. The server trims, lowercases, validates, and deduplicates in first-seen order. Display-name/quoted-local-part syntax, control characters, consecutive local dots, and overlength local/domain labels are rejected. Each input list allows at most 30 addresses.

For ordinary mail, primary recipient-source semantics are unchanged. CC excludes To. Effective BCC is the union of global, category, event-specific and applicable conditional BCC, excluding all To/CC addresses. The Types preview shows the base routing without inquiry context; Overview provides the conditional preview. Example event fields are interactive but never saved or sent.

## Conditional website-generated copies (B2)

**Studio → Notifications → Overview → Conditional website-generated BCC** manages up to 20 rules. A rule has a name (1–80 characters), Enabled state, optional choice of operator inquiry notice (`customer_inquiry_admin`) or planner customer confirmation (`commission_submitted`), one or more conditions, and up to 30 normalized private BCC addresses. Leaving the type unrestricted covers both inquiry mail types. All selected conditions within a rule must match exactly; all matching enabled rules contribute copies in saved rule/address order. Case-equivalent addresses collapse. Use global or per-Type forwarding for unconditional copies.

| Condition | Server-owned meaning |
|---|---|
| Inquiry intent / topic | B1's validated inquiry enums; planner intent is always `custom-commission`. |
| Source surface / channel | Derived by the B1 normalizer; arbitrary browser labels do not override them. |
| Exact source route | B1's allowlisted relative route without query/fragment; it is reported inquiry context, not proof of navigation. |
| Canonical piece slug | The server-resolved catalog identity stored with the inquiry, not a free-text reference. |
| Piece availability | `no-piece`: no canonical link. `available`: at submission, inventory status, positive stock and exact-piece inquiry mode. `reference-only`: a canonical link without that availability. |

Queueing resolves the stored inquiry ID and its legitimate disposition. Template variables, message keywords, private uploads and Turnstile/security tokens are never matching inputs. Catalog facts are frozen B1 submission facts; later catalog edits do not reinterpret them. Quick inquiries and planner operator notices receive the context; planner confirmations additionally require the stored commission/Project relationship. Order-review notices and other mail without this B1 context retain their existing routing. This does not introduce copies for later project replies/status/invoice/shipment events, nor mailbox/provider forwarding.

**New conditional rule** opens a local draft; **Add rule** validates it and submits through the typed autosave queue. Existing rules autosave. **Remove rule** and **Clear all conditional rules** explicitly remove conditional copies for newly queued mail. Validation and unsupported/over-limit fields fail without saving; **Retry save** recaptures corrected input. Stale versions require explicit **Use latest saved version (discard my edits)** recovery. Operation IDs are replay-safe and changes enter the existing redacted administrative audit.

The conditional preview uses saved rules and current global/type settings, labels all example fields as preview-only, shows matching rule names and effective To/CC/BCC, and shows when a type is paused. It does not persist context or send mail. A selected account-link type always previews a single account recipient without any copies. Quarantine creates no notification even when its attributes would match. Existing delivery snapshots and retries never recalculate conditional recipients after rule edits.

Rules are stored as one independently versioned `settings` entry, `notification-conditional-routing`. An absent entry reads as empty without writing defaults. Saving or clearing the entry leaves arbitrary site settings, policies and templates intact; no schema migration is introduced and schema remains v16. Normal SQLite backups include the entry. No production snapshot/migration run or deployment is part of B2. See [B2 validation](b2-routing-audit-20260907.md).

Delivery records freeze the actual To/CC/BCC when a message is queued. Changing defaults affects new messages, not already queued history. Retry still rechecks Enabled/Paused and attempt limits. SMTP acceptance is not proof of inbox placement.

## Account-Link Protection

Email-verification and password-reset messages always target exactly the event account. They ignore configured primary recipients, global/category/event/conditional copies, and CC. They cannot be redirected through an operational-correspondence preset. B2 never loads conditional context or rules for those types; recipient provenance and fail-closed retry remain unchanged.

Schema v15 adds a recipient-provenance row for each newly queued account-link delivery. Queue creation and provenance are atomic. A retry of older authentication mail without this proof, or with additional recipients, fails closed with `AUTH_RECIPIENT_PROVENANCE`; the customer must request a fresh link. Existing sent history is not rewritten or re-sent.

## Customer Communication Coverage

| Event | Notice / persistence |
|---|---|
| About/contact/piece inquiry | Separate inquiry record and `customer_inquiry_admin` operator notice; no Project or customer commission confirmation. Owner-bound replay recovers a missing notice without duplicating it. |
| Legitimate guided commission | Project plus buyer `commission_submitted` confirmation and separate `customer_inquiry_admin` notice; replay repairs missing queue entries. |
| Quarantined website solicitation | Private inquiry record only; no Project, upload persistence, lifecycle event or mail. |
| Authorized buyer project reply | `customer_reply_admin`, committed in the same transaction as the reply. Administrator-authored replies do not notify the same operator. Existing project-access controls remain required. |
| Review submission | Draft review plus `review_submitted_admin` in one transaction. Approval/publication remains manual. |
| Local pickup/delivery review | Draft order plus `customer_inquiry_admin` in one transaction, including bounded item names/quantities. The browser returns through a relative 303 redirect, not the container's internal hostname. |
| Existing checkout action | Draft order plus `customer_inquiry_admin`; no claim of payment or fulfillment confirmation. Stripe configuration remains separate. The current public cart uses local logistics review. |
| Signup administrator notice / optional visitor notice | Existing dedicated types and primary-recipient-source semantics retained. Visitor mail remains disabled by default. |
| Account verification/reset, project/order status, invoice, shipment, SMTP test | Existing typed delivery paths retained, with the account-link exception above. |

Operator notices use bounded, escaped names, addresses, references and message excerpts, plus an authenticated Studio link. Private uploads are not attached. Submission/reply/review/order-request quotas limit repeated messages. Untrusted-origin local-reservation POSTs are rejected before form parsing; checkout remains a Next server action. A cart with unavailable entries is rejected rather than silently ordering only a subset.

## Persistence and Validation

No new global-routing setting is introduced. Additive schema v15 creates three missing operator policies/templates using insert-if-absent semantics, plus account-link recipient provenance. It preserves arbitrary existing site settings and existing policies/templates. Migration tests cover transaction failure, retry, idempotence and customization preservation; production-clone proof remains a separate predeployment gate.

Focused tests cover normalization/clear/rejection, recipient-source behavior, global/category/event union, primary/CC exclusion, auth isolation, queued-message provenance, SMTP transport behavior, outbox atomicity and administrative audit redaction. Disposable browser acceptance uses `visual-audit/scripts/verify-notification-routing.mjs` and `verify-routing-state.mjs`, with no production mounts or real SMTP credentials.

Schema v16 adds the normalized website inquiry store. New installations seed empty forwarding defaults, while arbitrary saved settings/templates/policies remain unchanged. Inquiry templates may use the B1 intent/topic/source/piece placeholders documented in [website inquiries](website-inquiries.md). B2 adds conditional copies using this persisted context and the existing settings table.
