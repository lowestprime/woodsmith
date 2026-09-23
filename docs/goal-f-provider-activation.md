# Goal F provider activation — pending external access

Status: **PROVIDER_BLOCKED**, not functional production acceptance. The current production runtime has no Stripe or EasyPost credentials. The available browser inventory has no authenticated Proton administrative session. No provider credentials, customer mail, charges or postage purchases were used during this audit. Application corrections are deployed; native provider activation remains blocked.

## Stripe

The owner must provision the business Stripe account and a sandbox, and put the sandbox `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and endpoint-specific `STRIPE_WEBHOOK_SECRET` into the existing private operator environment. Never paste these values into a task, Git, screenshots or logs. Do not install sandbox values into the accepted live service. Enable Stripe Tax and configure the business's applicable registrations/settings in Stripe; the application does not determine tax obligations. The public payment path remains disabled unless payment reconciliation is configured and automatic tax is enabled.

Register the sandbox endpoint at the isolated candidate's `/api/stripe/webhook` with these events:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`;
- `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`.

Use an owner-controlled buyer address and Stripe's documented test payment methods. Verify a real sandbox session against the saved item quantities, subtotal, native coupon/promotion, provider tax and total. Confirm local fulfillment and review the final amount before submitting. Exercise successful, declined and delayed payment, cancellation/expiry, duplicate delivery and reordered delivery. Verify stock reservation/release, unchanged-cart cleanup, Studio payment/invoice state and restart persistence. An invoice must contain the intended line on the specific invoice before finalization; retry the same saved operation instead of making another invoice.

The webhook's signature and order/session/amount binding must pass before calling a payment paid. A browser success URL is not payment evidence. Unknown outcomes outside the provider idempotency retention window require inspection in Stripe; do not create a new payment to discover whether an old one succeeded. Keep live activation blocked until the sandbox checks have evidence. Live business activation and any separate seller-account onboarding remain owner/provider actions; this document is not approval for a real charge.

Sources: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [event types](https://docs.stripe.com/api/events), [idempotent requests](https://docs.stripe.com/api/idempotent_requests).

## EasyPost

The owner must supply the EasyPost **test** API key as `EASYPOST_API_KEY` in the isolated candidate operator environment, together with the actual private ship-from values: `SHIP_FROM_NAME`, `SHIP_FROM_STREET1`, `SHIP_FROM_CITY`, `SHIP_FROM_STATE`, `SHIP_FROM_ZIP`, `SHIP_FROM_COUNTRY`. Use an owner-controlled test destination. Do not publish the shop address or put it in repository examples.

In Studio Orders, save and verify the destination, enter real packed weight in ounces and dimensions in inches, and request rates. This step must not buy postage. Confirm the selected carrier/service/currency/amount; a changed rate or destination requires a fresh quote. Only purchase with the provider test key. Verify the resulting test label/tracking identity survives reload and repeated action without a second purchase. A purchased label means awaiting carrier handoff, not shipped. Exercise invalid addresses, no rates, provider timeout, restart during purchase, GET-only reconciliation of uncertain outcomes and competing requests. The application must not blindly repeat an ambiguous purchase. Configure live shipping only after these sandbox checks and the owner has approved operational readiness; buy no real label during Goal F.

Sources: [Shipments](https://docs.easypost.com/docs/shipments), [Addresses](https://docs.easypost.com/docs/addresses).

## Direct inbound Proton mail

This is separate from website B1/B2 BCC routing. The application cannot read or classify arbitrary messages sent directly to `woodsmithbb@proton.me`.

Owner procedure (a paid Proton Mail plan with forwarding is required):

1. Sign in to Proton, then open **Settings → All settings → Forward and auto-reply → Add forwarding rule**. Select `woodsmithbb@proton.me` as the origin and the intended operational destination.
2. Add subject conditions for the owner-approved buyer-intent keywords. Use one rule per destination with the appropriate any/all match setting; avoid overlapping rules that copy the same message twice. Review the available conditions rather than assuming message-body inspection exists.
3. Send the confirmation request and accept it in the destination mailbox. Keep delivery to the canonical Proton mailbox; do not add discard/delete or reciprocal forwarding rules.
4. From an owner-controlled sender, test a matching inquiry, a nonmatching message and a message matching multiple keywords. Confirm the intended copies, retained original and absence of loops/duplicates. Pause the rule if the result differs.

The historical operational destinations are `wbeaman1@gmail.com` and, in the later Post-v19 intake direction, `cooperbeaman@gmail.com`. These are private routing destinations, not public contact replacements. The precise direct-inbound keyword set and recipients must be reviewed in the owner session; website structured-intent rules must not be mistaken for Proton rules. No rule was inspected or changed in this Goal. Proton documents that forwarding to a non-Proton address disables end-to-end encryption for the forwarding address; the owner should account for that when choosing a destination.

Source: [Proton forwarding setup, conditions and recipient confirmation](https://proton.me/support/email-forwarding). Provider forwarding UI capabilities are the authority; do not invent Sieve/body-filter support to claim this clause complete.

## Independent woodworker accounts (deployed Goal F)

Multi-worker mode stays disabled by default. Provision an existing woodworker account in `/studio/woodworkers`, verify its business identity, activate it, and have that woodworker publish their profile and accept the current fee policy. Primary-business payment behavior remains unchanged. A checkout accepts one business only.

For an independent seller, finish Stripe connected-account onboarding outside the application, verify ownership/capabilities and Tax settings in sandbox, and bind its `acct_…` ID through business administration. Configure an endpoint for connected-account events as well as platform events at `/api/stripe/webhook`; place its distinct signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. The application scopes direct-charge Checkout, invoice and lookup requests using `Stripe-Account`, snapshots the accepted integer fee on discounted goods, and verifies callback `account` against the saved business/account snapshot. Provider-entered promotion codes are disabled for seller direct charges; the application's validated coupon remains available before the fee snapshot. Existing order bindings and fee snapshots cannot switch with later policy/account changes. Sources: [Stripe direct charges](https://docs.stripe.com/connect/direct-charges), [Connect invoices](https://docs.stripe.com/invoicing/connect).

For independent shipping, set `WOODWORKER_PROVIDER_CONFIG_PATH` to an absolute private runtime file, preferably `/app/site/data/woodworker-providers.json` so the existing persistent data mount and paired recovery cover it. The operator-owned JSON maps each exact business ID to `apiKey` and `fromAddress`; the latter contains `name`, `street1`, `city`, `state`, `zip`, `country`. Use distinct EasyPost **test** credentials per independent business and verify their account ownership in EasyPost. This file is a secret payload: restrict access to the runtime operator, keep it out of Git/logs/task messages, and include it only in protected paired recovery. Do not put keys in Studio. The application persists a credential fingerprint and the origin address, never the key, and refuses to change credentials on an existing order. A credential rotation for an in-flight order requires deliberate provider reconciliation; it must not silently retry on another account.

These branch-local implementations and mocked provider tests do not prove provider activation. Real Stripe/EasyPost sandbox acceptance and provider account access remain **PROVIDER_BLOCKED**. Direct inbound Proton rules remain separately blocked as described above.
