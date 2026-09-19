import { assertStripeEventBusiness } from "./commerce-provider-scope.ts";
import { prepareOrderBusiness } from "./woodworkers-store.ts";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CheckoutLine } from "./payments.ts";

export function installCommerceSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE order_line_items (
      order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE RESTRICT,
      piece_slug TEXT NOT NULL, title TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_amount_cents INTEGER NOT NULL CHECK(unit_amount_cents >= 0),
      owner_email TEXT, PRIMARY KEY(order_number, piece_slug)
    ) STRICT;
    CREATE TABLE commerce_stock_reservations (
      order_number TEXT PRIMARY KEY REFERENCES orders(order_number) ON DELETE RESTRICT,
      state TEXT NOT NULL CHECK(state IN ('held','paid','released'))
    ) STRICT;
    CREATE TABLE commerce_cart_snapshots (
      order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE RESTRICT,
      cart_item_id TEXT NOT NULL, piece_slug TEXT NOT NULL, quantity INTEGER NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY(order_number,cart_item_id)
    ) STRICT;
    CREATE TABLE commerce_checkouts (
      order_number TEXT PRIMARY KEY REFERENCES orders(order_number) ON DELETE RESTRICT,
      owner_hash TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('prepared','open','paid','released','review')),
      session_id TEXT UNIQUE, automatic_tax INTEGER NOT NULL, allow_promotions INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_hash, request_key)
    ) STRICT;
    CREATE TABLE commerce_provider_events (
      event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_hash TEXT NOT NULL,
      order_number TEXT, outcome TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE commerce_operations (
      operation_key TEXT PRIMARY KEY, order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE RESTRICT,
      kind TEXT NOT NULL, request_hash TEXT NOT NULL, state TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
  `);
  return { commerceTablesCreated: true, existingRowsUnchanged: true };
}
export function commerceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function recordOrderLines(
  db: DatabaseSync,
  orderNumber: string,
  lines: readonly CheckoutLine[],
) {
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isSafeInteger(line.unitAmountCents) ||
      line.unitAmountCents < 0
    )
      throw new Error("Invalid order line.");
    const owner = db
      .prepare("SELECT owner_email FROM pieces WHERE slug = ?")
      .get(line.slug) as { owner_email: string | null } | undefined;
    if (!owner) throw new Error("The piece is unavailable.");
    db.prepare(
      "INSERT INTO order_line_items(order_number,piece_slug,title,quantity,unit_amount_cents,owner_email) VALUES(?,?,?,?,?,?)",
    ).run(
      orderNumber,
      line.slug,
      line.title,
      line.quantity,
      line.unitAmountCents,
      owner.owner_email,
    );
  }
}
export type CheckoutRecord = {
  order_number: string;
  owner_hash: string;
  request_key: string;
  payload_hash: string;
  state: string;
  session_id: string | null;
  automatic_tax: number;
  allow_promotions: number;
  created_at: string;
};
export function checkoutForRequest(
  db: DatabaseSync,
  ownerHash: string,
  key: string,
) {
  return db
    .prepare(
      "SELECT * FROM commerce_checkouts WHERE owner_hash = ? AND request_key = ?",
    )
    .get(ownerHash, key) as CheckoutRecord | undefined;
}
export function prepareCheckout(
  db: DatabaseSync,
  input: {
    orderNumber: string;
    ownerHash: string;
    key: string;
    payloadHash: string;
    automaticTax: boolean;
    allowPromotions: boolean;
  },
) {
  const timestamp = new Date().toISOString();
  reserveOrderStock(db, input.orderNumber);
  db.prepare(
    "INSERT INTO commerce_checkouts(order_number,owner_hash,request_key,payload_hash,state,automatic_tax,allow_promotions,created_at,updated_at) VALUES(?,?,?,?,'prepared',?,?,?,?)",
  ).run(
    input.orderNumber,
    input.ownerHash,
    input.key,
    input.payloadHash,
    Number(input.automaticTax),
    Number(input.allowPromotions),
    timestamp,
    timestamp,
  );
}
export function bindCheckoutSession(
  db: DatabaseSync,
  orderNumber: string,
  sessionId: string,
) {
  const row = db
    .prepare(
      "SELECT session_id,state FROM commerce_checkouts WHERE order_number=?",
    )
    .get(orderNumber) as
    | { session_id: string | null; state: string }
    | undefined;
  if (!row || (row.session_id && row.session_id !== sessionId))
    throw new Error("Checkout identity conflict.");
  db.prepare(
    "UPDATE commerce_checkouts SET session_id=?,state=CASE WHEN state='prepared' THEN 'open' ELSE state END,updated_at=? WHERE order_number=?",
  ).run(sessionId, new Date().toISOString(), orderNumber);
  db.prepare(
    "UPDATE orders SET stripe_checkout_session_id=?,status=CASE WHEN payment_status='Paid' OR ? NOT IN ('prepared','open') THEN status ELSE 'Awaiting payment' END,updated_at=? WHERE order_number=?",
  ).run(sessionId, row.state, new Date().toISOString(), orderNumber);
}
export function reserveOrderStock(db: DatabaseSync, orderNumber: string) {
  prepareOrderBusiness(db, orderNumber);
  const previous = db
    .prepare(
      "SELECT state FROM commerce_stock_reservations WHERE order_number=?",
    )
    .get(orderNumber) as { state: string } | undefined;
  if (previous) {
    if (previous.state !== "held")
      throw new Error("This order inventory reservation is closed.");
    return;
  }
  const lines = db
    .prepare(
      "SELECT piece_slug,quantity FROM order_line_items WHERE order_number=?",
    )
    .all(orderNumber) as Array<{ piece_slug: string; quantity: number }>;
  if (!lines.length)
    throw new Error(
      "This order has no verified item snapshot. Reconcile its items before requesting payment.",
    );
  for (const line of lines) {
    const result = db
      .prepare(
        "UPDATE pieces SET inventory_count=inventory_count-?,updated_at=? WHERE slug=? AND inventory_count>=? AND publication_status='published' AND price_mode='fixed'",
      )
      .run(
        line.quantity,
        new Date().toISOString(),
        line.piece_slug,
        line.quantity,
      );
    if (Number(result.changes) !== 1)
      throw new Error(
        "A piece is no longer available in the requested quantity.",
      );
  }
  db.prepare("INSERT INTO commerce_stock_reservations VALUES(?,'held')").run(
    orderNumber,
  );
}
function releaseStock(db: DatabaseSync, orderNumber: string) {
  const changed = db
    .prepare(
      "UPDATE commerce_stock_reservations SET state='released' WHERE order_number=? AND state='held'",
    )
    .run(orderNumber);
  if (!changed.changes) return;
  const lines = db
    .prepare(
      "SELECT piece_slug,quantity FROM order_line_items WHERE order_number=?",
    )
    .all(orderNumber) as Array<{ piece_slug: string; quantity: number }>;
  for (const line of lines)
    db.prepare(
      "UPDATE pieces SET inventory_count=inventory_count+?,updated_at=? WHERE slug=?",
    ).run(line.quantity, new Date().toISOString(), line.piece_slug);
}
export function snapshotCheckoutCart(
  db: DatabaseSync,
  orderNumber: string,
  items: ReadonlyArray<{
    id: string;
    pieceSlug: string;
    quantity: number;
    updatedAt: string;
  }>,
) {
  for (const item of items)
    db.prepare("INSERT INTO commerce_cart_snapshots VALUES(?,?,?,?,?)").run(
      orderNumber,
      item.id,
      item.pieceSlug,
      item.quantity,
      item.updatedAt,
    );
}
function markStockPaid(db: DatabaseSync, orderNumber: string) {
  const reservation = db
    .prepare(
      "SELECT state FROM commerce_stock_reservations WHERE order_number=?",
    )
    .get(orderNumber) as { state: string } | undefined;
  if (!reservation || reservation.state === "released")
    throw new Error("Payment requires inventory reconciliation.");
  db.prepare(
    "UPDATE commerce_stock_reservations SET state='paid' WHERE order_number=?",
  ).run(orderNumber);
  const snapshots = db
    .prepare("SELECT * FROM commerce_cart_snapshots WHERE order_number=?")
    .all(orderNumber) as Array<{
    cart_item_id: string;
    piece_slug: string;
    quantity: number;
    updated_at: string;
  }>;
  // IDs are captured only from the authenticated/cookie-owned cart at reservation.
  // Later edits, replacement rows and other customers remain untouched.
  for (const item of snapshots)
    db.prepare(
      "DELETE FROM cart_items WHERE id=? AND piece_slug=? AND quantity=? AND updated_at=?",
    ).run(item.cart_item_id, item.piece_slug, item.quantity, item.updated_at);
}
type SessionEvent = {
  account?: string;
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      metadata?: Record<string, string> | null;
      payment_status?: string;
      payment_intent?: string | { id: string } | null;
      invoice?: string | { id: string } | null;
      currency?: string | null;
      amount_subtotal?: number | null;
      amount_total?: number | null;
      total_details?: {
        amount_discount: number;
        amount_shipping: number;
        amount_tax: number;
      } | null;
      customer_details?: {
        email?: string | null;
        name?: string | null;
        address?: Record<string, unknown> | null;
      } | null;
      collected_information?: {
        shipping_details?: {
          name?: string;
          address?: Record<string, unknown>;
        } | null;
      } | null;
    };
  };
};
export function applyCheckoutEvent(
  db: DatabaseSync,
  event: SessionEvent,
  payloadHash: string,
) {
  const previous = db
    .prepare(
      "SELECT payload_hash,outcome FROM commerce_provider_events WHERE event_id=?",
    )
    .get(event.id) as { payload_hash: string; outcome: string } | undefined;
  if (previous) {
    if (previous.payload_hash !== payloadHash)
      throw new Error("Provider event identity conflict.");
    return { duplicate: true, outcome: previous.outcome };
  }
  const supported = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ];
  if (!supported.includes(event.type)) return { ignored: true };
  const session = event.data.object,
    orderNumber = session.metadata?.order_number;
  if (!orderNumber) return { ignored: true };
  assertStripeEventBusiness(db, orderNumber, event.account);
  const record = db
    .prepare("SELECT * FROM commerce_checkouts WHERE order_number=?")
    .get(orderNumber) as CheckoutRecord | undefined;
  if (!record)
    throw new Error("Checkout is not yet persisted; retry this event.");
  if (record.session_id && record.session_id !== session.id)
    throw new Error("Provider session does not match this order.");
  // A signed event may arrive before the session creation response is persisted.
  bindCheckoutSession(db, orderNumber, session.id);
  let outcome = record.state;
  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    if (record.state === "prepared" || record.state === "open") {
      releaseStock(db, orderNumber);
      outcome = "released";
      db.prepare(
        "UPDATE orders SET payment_status=?,status=?,updated_at=? WHERE order_number=?",
      ).run(
        "Unpaid",
        event.type.endsWith("expired") ? "Checkout expired" : "Payment failed",
        new Date().toISOString(),
        orderNumber,
      );
    }
  } else if (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  ) {
    if (record.state === "released")
      throw new Error(
        "Payment arrived for released inventory; operator reconciliation required.",
      );
    const order = db
      .prepare("SELECT * FROM orders WHERE order_number=?")
      .get(orderNumber) as Record<string, unknown>;
    const details = session.total_details;
    const amounts = [
      session.amount_subtotal,
      session.amount_total,
      details?.amount_discount,
      details?.amount_shipping,
      details?.amount_tax,
    ];
    if (
      amounts.some((v) => !Number.isSafeInteger(v) || Number(v) < 0) ||
      !details ||
      session.currency?.toLowerCase() !== String(order.currency).toLowerCase()
    )
      throw new Error("Invalid provider amount/currency.");
    const subtotal = Number(session.amount_subtotal),
      total = Number(session.amount_total);
    if (
      subtotal !== order.subtotal_cents ||
      details.amount_shipping !== order.shipping_cents ||
      (!record.allow_promotions &&
        details.amount_discount !== order.discount_cents) ||
      (!record.automatic_tax && details.amount_tax !== order.tax_cents) ||
      details.amount_discount > subtotal ||
      total !==
        subtotal -
          details.amount_discount +
          details.amount_shipping +
          details.amount_tax
    )
      throw new Error("Provider totals do not reconcile with the order.");
    markStockPaid(db, orderNumber);
    outcome = "paid";
    const id = (value: string | { id: string } | null | undefined) =>
      typeof value === "string" ? value : (value?.id ?? null);
    db.prepare(
      "UPDATE orders SET payment_status='Paid',status=CASE WHEN payment_status='Paid' THEN status ELSE 'Paid — awaiting fulfillment' END,subtotal_cents=?,shipping_cents=?,tax_cents=?,discount_cents=?,total_cents=?,stripe_payment_intent_id=?,stripe_invoice_id=COALESCE(?,stripe_invoice_id),updated_at=? WHERE order_number=?",
    ).run(
      subtotal,
      details.amount_shipping,
      details.amount_tax,
      details.amount_discount,
      total,
      id(session.payment_intent),
      id(session.invoice),
      new Date().toISOString(),
      orderNumber,
    );
    const shipping = session.collected_information?.shipping_details;
    if (shipping?.address)
      db.prepare(
        "UPDATE orders SET shipping_address_json=? WHERE order_number=?",
      ).run(
        JSON.stringify({
          ...shipping.address,
          name: shipping.name ?? "",
          street1: shipping.address.line1 ?? "",
          zip: shipping.address.postal_code ?? "",
        }),
        orderNumber,
      );
  }
  db.prepare(
    "UPDATE commerce_checkouts SET state=?,updated_at=? WHERE order_number=?",
  ).run(outcome, new Date().toISOString(), orderNumber);
  db.prepare(
    "INSERT INTO commerce_provider_events(event_id,event_type,payload_hash,order_number,outcome,created_at) VALUES(?,?,?,?,?,?)",
  ).run(
    event.id,
    event.type,
    payloadHash,
    orderNumber,
    outcome,
    new Date().toISOString(),
  );
  return { duplicate: false, outcome, orderNumber };
}
export function reserveProviderOperation(
  db: DatabaseSync,
  input: { key: string; orderNumber: string; kind: string; request: unknown },
) {
  const hash = commerceHash(input.request);
  const existing = db
    .prepare("SELECT * FROM commerce_operations WHERE operation_key=?")
    .get(input.key) as
    | {
        request_hash: string;
        state: string;
        result_json: string;
        created_at: string;
      }
    | undefined;
  if (existing) {
    if (existing.request_hash !== hash)
      throw new Error(
        "This operation already has different saved parameters; reconcile it before retrying.",
      );
    return existing;
  }
  const timestamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO commerce_operations(operation_key,order_number,kind,request_hash,state,created_at,updated_at) VALUES(?,?,?,?,'prepared',?,?)",
  ).run(input.key, input.orderNumber, input.kind, hash, timestamp, timestamp);
  return {
    request_hash: hash,
    state: "prepared",
    result_json: "{}",
    created_at: timestamp,
  };
}
export function finishProviderOperation(
  db: DatabaseSync,
  key: string,
  result: unknown,
  state = "complete",
) {
  db.prepare(
    "UPDATE commerce_operations SET state=?,result_json=?,updated_at=? WHERE operation_key=?",
  ).run(state, JSON.stringify(result), new Date().toISOString(), key);
}

type InvoiceEvent = {
  account?: string;
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      metadata?: Record<string, string> | null;
      currency?: string | null;
      total?: number;
      amount_paid?: number;
      status?: string | null;
    };
  };
};
export function applyInvoiceEvent(
  db: DatabaseSync,
  event: InvoiceEvent,
  payloadHash: string,
) {
  if (
    ![
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.voided",
      "invoice.marked_uncollectible",
    ].includes(event.type)
  )
    return { ignored: true };
  const prior = db
    .prepare(
      "SELECT payload_hash,outcome FROM commerce_provider_events WHERE event_id=?",
    )
    .get(event.id) as { payload_hash: string; outcome: string } | undefined;
  if (prior) {
    if (prior.payload_hash !== payloadHash)
      throw new Error("Provider event identity conflict.");
    return { duplicate: true, outcome: prior.outcome };
  }
  const invoice = event.data.object,
    orderNumber = invoice.metadata?.order_number;
  if (!orderNumber) return { ignored: true };
  assertStripeEventBusiness(db, orderNumber, event.account);
  const operation = db
    .prepare(
      "SELECT 1 FROM commerce_operations WHERE order_number=? AND kind='invoice'",
    )
    .get(orderNumber);
  if (!operation) return { ignored: true }; // Checkout-created invoices reconcile through their checkout session.
  const order = db
    .prepare("SELECT * FROM orders WHERE order_number=?")
    .get(orderNumber) as Record<string, unknown> | undefined;
  if (
    !order ||
    (order.stripe_invoice_id && order.stripe_invoice_id !== invoice.id)
  )
    throw new Error("Invoice identity conflict.");
  if (
    !Number.isSafeInteger(invoice.total) ||
    invoice.total !== order.total_cents ||
    invoice.currency?.toLowerCase() !== String(order.currency).toLowerCase()
  )
    throw new Error(
      "Invoice total or currency does not match the saved order.",
    );
  let outcome = String(order.payment_status);
  if (event.type === "invoice.paid") {
    if (
      invoice.status !== "paid" ||
      !Number.isSafeInteger(invoice.amount_paid) ||
      Number(invoice.amount_paid) < Number(order.total_cents)
    )
      throw new Error("Invoice payment is incomplete.");
    markStockPaid(db, orderNumber);
    outcome = "Paid";
    db.prepare(
      "UPDATE orders SET payment_status='Paid',invoice_status='Paid',status=CASE WHEN payment_status='Paid' THEN status ELSE 'Paid — awaiting fulfillment' END,stripe_invoice_id=?,updated_at=? WHERE order_number=?",
    ).run(invoice.id, new Date().toISOString(), orderNumber);
  } else if (order.payment_status !== "Paid") {
    outcome =
      event.type === "invoice.voided"
        ? "Voided"
        : event.type === "invoice.marked_uncollectible"
          ? "Uncollectible"
          : "Payment failed";
    if (event.type === "invoice.voided") releaseStock(db, orderNumber);
    db.prepare(
      "UPDATE orders SET invoice_status=?,stripe_invoice_id=?,updated_at=? WHERE order_number=?",
    ).run(outcome, invoice.id, new Date().toISOString(), orderNumber);
  }
  db.prepare("INSERT INTO commerce_provider_events VALUES(?,?,?,?,?,?)").run(
    event.id,
    event.type,
    payloadHash,
    orderNumber,
    outcome,
    new Date().toISOString(),
  );
  return { duplicate: false, outcome, orderNumber };
}

type EditableOrder = {
  orderNumber: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  userEmail: string | null;
  billingAddress: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  paymentStatus: string | null;
};
export function assertProviderOrderEditSafe(
  db: DatabaseSync,
  input: EditableOrder,
  current: EditableOrder,
) {
  const payment = db
    .prepare(
      "SELECT 1 FROM commerce_checkouts WHERE order_number=? UNION ALL SELECT 1 FROM commerce_operations WHERE order_number=? AND kind='invoice' LIMIT 1",
    )
    .get(input.orderNumber, input.orderNumber);
  if (payment) {
    const fields = [
      "subtotalCents",
      "shippingCents",
      "taxCents",
      "discountCents",
      "totalCents",
      "currency",
      "userEmail",
      "billingAddress",
      "paymentStatus",
    ] as const;
    if (
      fields.some(
        (field) => commerceHash(input[field]) !== commerceHash(current[field]),
      )
    )
      throw new Error(
        "This order has a provider payment request. Its buyer, totals and payment state must be reconciled through the provider.",
      );
    for (const field of [
      "stripeCheckoutSessionId",
      "stripePaymentIntentId",
      "stripeInvoiceId",
    ] as const)
      if (current[field] && input[field] !== current[field])
        throw new Error(
          "A saved provider payment identity cannot be replaced.",
        );
  }
  const postage = db
    .prepare(
      "SELECT 1 FROM commerce_operations WHERE order_number=? AND kind='shipping' AND state IN ('buying','uncertain','complete') LIMIT 1",
    )
    .get(input.orderNumber);
  if (
    postage &&
    commerceHash(input.shippingAddress) !==
      commerceHash(current.shippingAddress)
  )
    throw new Error(
      "This order has a purchased or unresolved label. Reconcile postage before changing its saved destination.",
    );
}
