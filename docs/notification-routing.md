# Notification Routing

This describes the post-v19 source. Production adoption requires the normal candidate, migration, recovery, and deployment gates.

## Address Roles

| Setting | Meaning |
|---|---|
| Settings: Builder email | Primary woodshop/customer correspondence address and event recipient for new inquiries, buyer replies, review submissions, and order-review requests. |
| Notifications: Overview: Global forwarding recipients (BCC) | Copies applicable application-generated notification emails. Stored in `site.email.forwardTo`. Empty means no global copies. |
| Types: Configured recipients | Primary destinations selected by the existing Event only / Configured only / Event and configured policy. |
| Types: Forwarding recipients (BCC) | Additional copies for that type, not a replacement for the global default. |
| Legacy account/visitor notice recipient | `notificationForwardEmail` remains the primary destination for those existing administrator notices, with the existing Builder fallback. It is not global BCC. |
| SMTP From | Sender identity selected by the existing runtime/site transport configuration. It is not a forwarding destination. |
| SMTP Reply-To | The site's `email.replyTo`; governs replies to delivered messages, independently of Builder email and BCC. |
| Mailbox/provider forwarding | External rules in Proton, Gmail, or another provider. The application cannot inspect, configure, or guarantee them. |

Changing routing never changes SMTP authentication. SMTP credentials remain environment-only; the SMTP view retains its redacted verification and test workflow.

## Editing and Effective Routing

Global forwarding uses the typed Studio autosave queue, expected-version checks, replay-safe operation IDs, and administrative audit history. An explicitly emptied field clears the saved value. A stale tab cannot overwrite a newer save. Validation errors offer **Retry save**; version conflicts offer **Use latest saved version (discard my edits)** rather than an implicit force-save.

Plain ASCII addresses (including punycode domains) may be separated by newlines, commas, or semicolons. The server trims, lowercases, validates, and deduplicates in first-seen order. Display-name/quoted-local-part syntax, control characters, consecutive local dots, and overlength local/domain labels are rejected. Each input list allows at most 30 addresses.

For ordinary mail, primary recipient-source semantics are unchanged. CC excludes To. Effective BCC is the union of global, category, and event-specific BCC, excluding all To/CC addresses. The Types preview shows the current global default even when its own BCC field is empty. Example event fields are interactive but never saved or sent.

Delivery records freeze the actual To/CC/BCC when a message is queued. Changing defaults affects new messages, not already queued history. Retry still rechecks Enabled/Paused and attempt limits. SMTP acceptance is not proof of inbox placement.

## Account-Link Protection

Email-verification and password-reset messages always target exactly the event account. They ignore configured primary recipients, global/category/event copies, and CC. They cannot be redirected through an operational-correspondence preset.

Schema v15 adds a recipient-provenance row for each newly queued account-link delivery. Queue creation and provenance are atomic. A retry of older authentication mail without this proof, or with additional recipients, fails closed with `AUTH_RECIPIENT_PROVENANCE`; the customer must request a fresh link. Existing sent history is not rewritten or re-sent.

## Customer Communication Coverage

| Event | Notice / persistence |
|---|---|
| Contact or guided commission submission | Buyer `commission_submitted` confirmation and separate `customer_inquiry_admin` operator notice. Submission replay recovers missing queue entries from persisted project content without duplicating logical mail. |
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
