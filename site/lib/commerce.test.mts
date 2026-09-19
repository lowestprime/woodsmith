import { installWoodworkerSchema } from "./woodworkers-store.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Stripe from "stripe";
import {
  applyInvoiceEvent,
  reserveOrderStock,
  snapshotCheckoutCart,
  installCommerceSchema,
  recordOrderLines,
  prepareCheckout,
  applyCheckoutEvent,
  bindCheckoutSession,
  reserveProviderOperation,
  finishProviderOperation,
} from "./commerce-store.ts";
import {
  createStripeCheckoutSession,
  createStripeInvoice,
  createEasyPostShipment,
  buyEasyPostShippingLabel,
  calculateCheckoutTotals,
  verifyStripeEvent,
} from "./payments.ts";
function dbFixture(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(
    `PRAGMA foreign_keys=ON;CREATE TABLE pieces(slug TEXT PRIMARY KEY,owner_email TEXT,inventory_count INTEGER,updated_at TEXT,publication_status TEXT,price_mode TEXT);INSERT INTO pieces VALUES('table','woodsmithbb@proton.me',1,'old','published','fixed');CREATE TABLE orders(order_number TEXT PRIMARY KEY,subtotal_cents INTEGER,shipping_cents INTEGER,tax_cents INTEGER,discount_cents INTEGER,total_cents INTEGER,currency TEXT,payment_status TEXT,status TEXT,stripe_checkout_session_id TEXT,stripe_payment_intent_id TEXT,stripe_invoice_id TEXT,shipping_address_json TEXT,updated_at TEXT);INSERT INTO orders VALUES('O1',10000,500,0,1000,9500,'usd','Unpaid','Draft',NULL,NULL,NULL,'{}','old');`,
  );
  db.exec(
    "ALTER TABLE orders ADD COLUMN invoice_status TEXT; CREATE TABLE cart_items(id TEXT PRIMARY KEY,piece_slug TEXT,quantity INTEGER,updated_at TEXT);",
  );
  installCommerceSchema(db);
  db.exec(
    "CREATE TABLE users(email TEXT PRIMARY KEY,role TEXT); INSERT INTO users VALUES('woodsmithbb@proton.me','admin')",
  );
  installWoodworkerSchema(db);
  return db;
}
const line = {
  slug: "table",
  title: "Table",
  quantity: 1,
  unitAmountCents: 10000,
};
function reserve(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  recordOrderLines(db, "O1", [line]);
  prepareCheckout(db, {
    orderNumber: "O1",
    ownerHash: "owner",
    key: "request",
    payloadHash: "payload",
    automaticTax: true,
    allowPromotions: false,
  });
  db.exec("COMMIT");
}
function event(id = "evt_1", type = "checkout.session.completed", paid = true) {
  return {
    id,
    type,
    data: {
      object: {
        id: "cs_test_one",
        metadata: { order_number: "O1" },
        payment_status: paid ? "paid" : "unpaid",
        payment_intent: "pi_test_one",
        currency: "usd",
        amount_subtotal: 10000,
        amount_total: 10200,
        total_details: {
          amount_discount: 1000,
          amount_shipping: 500,
          amount_tax: 700,
        },
      },
    },
  };
}
function apply(db: DatabaseSync, e = event(), hash = e.id) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = applyCheckoutEvent(db, e, hash);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
test("inventory is reserved atomically; competing checkout cannot oversell", () => {
  const db = dbFixture();
  reserve(db);
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    0,
  );
  db.exec(
    "INSERT INTO orders SELECT 'O2',subtotal_cents,shipping_cents,tax_cents,discount_cents,total_cents,currency,payment_status,status,NULL,NULL,NULL,'{}','old',NULL FROM orders WHERE order_number='O1';BEGIN IMMEDIATE",
  );
  recordOrderLines(db, "O2", [line]);
  assert.throws(() =>
    prepareCheckout(db, {
      orderNumber: "O2",
      ownerHash: "other",
      key: "request2",
      payloadHash: "payload2",
      automaticTax: true,
      allowPromotions: false,
    }),
  );
  db.exec("ROLLBACK");
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM order_line_items WHERE order_number='O2'",
      )
      .get().n,
    0,
  );
  db.close();
});
test("payment event before creation response reconciles totals once and retains fulfillment status", () => {
  const db = dbFixture();
  reserve(db);
  assert.equal(apply(db).outcome, "paid");
  assert.equal(apply(db).duplicate, true);
  assert.equal(
    db
      .prepare(
        "SELECT total_cents AS total,payment_status AS status FROM orders",
      )
      .get().total,
    10200,
  );
  db.prepare("UPDATE orders SET status='Shipped'").run();
  bindCheckoutSession(db, "O1", "cs_test_one");
  apply(db, event("evt_2"));
  assert.equal(db.prepare("SELECT status FROM orders").get().status, "Shipped");
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    0,
  );
  db.close();
});
test("invalid amounts, currency, mismatched sessions and event-ID collisions roll back", () => {
  const db = dbFixture();
  reserve(db);
  const bad = event();
  bad.data.object.total_details.amount_discount = 2;
  assert.throws(() => apply(db, bad));
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM commerce_provider_events").get().n,
    0,
  );
  const currency = event();
  currency.data.object.currency = "eur";
  assert.throws(() => apply(db, currency));
  apply(db);
  assert.throws(() => apply(db, event(), "different"));
  const swapped = event("evt_2");
  swapped.data.object.id = "cs_other";
  assert.throws(() => apply(db, swapped));
  db.close();
});
test("unpaid completion retains stock; failure/expiration restores once; late paid needs review", () => {
  const db = dbFixture();
  reserve(db);
  apply(db, event("evt_pending", "checkout.session.completed", false));
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    0,
  );
  apply(
    db,
    event("evt_failed", "checkout.session.async_payment_failed", false),
  );
  apply(db, event("evt_expired", "checkout.session.expired", false));
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    1,
  );
  assert.equal(
    db.prepare("SELECT status FROM orders").get().status,
    "Payment failed",
  );
  assert.throws(() => apply(db, event("evt_late")));
  db.close();
});
test("paid state is not downgraded by an out-of-order expiry", () => {
  const db = dbFixture();
  reserve(db);
  apply(db);
  apply(db, event("evt_expired", "checkout.session.expired", false));
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    0,
  );
  assert.equal(
    db.prepare("SELECT payment_status FROM orders").get().payment_status,
    "Paid",
  );
  db.close();
});
test("provider operation payload binding and completion survive database reopen", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "commerce-proof-")),
    file = path.join(folder, "db.sqlite");
  let db = dbFixture(file);
  reserve(db);
  const input = {
    key: "invoice:O1",
    orderNumber: "O1",
    kind: "invoice",
    request: { total: 10000 },
  };
  reserveProviderOperation(db, input);
  assert.throws(() =>
    reserveProviderOperation(db, { ...input, request: { total: 2 } }),
  );
  finishProviderOperation(db, input.key, { id: "in_fixture" });
  apply(db);
  db.close();
  db = new DatabaseSync(file);
  assert.equal(reserveProviderOperation(db, input).state, "complete");
  assert.equal(apply(db).duplicate, true);
  assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
  rmSync(folder, { recursive: true });
});
test("commerce schema DDL rolls back with migration-ledger failure and retries", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("BEGIN");
  installCommerceSchema(db);
  db.exec("ROLLBACK");
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'commerce_%'",
      )
      .get().n,
    0,
  );
  db.exec("BEGIN");
  installCommerceSchema(db);
  db.exec("COMMIT");
  assert.ok(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='commerce_checkouts'")
      .get(),
  );
  db.close();
});
async function withProvider(
  handler: (url: string, init?: RequestInit) => unknown,
  work: () => Promise<void>,
) {
  const old = globalThis.fetch,
    keys = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "EASYPOST_API_KEY",
      "SHIP_FROM_STREET1",
      "SHIP_FROM_CITY",
      "SHIP_FROM_STATE",
      "SHIP_FROM_ZIP",
    ],
    saved = keys.map((key) => process.env[key]);
  for (const key of keys) process.env[key] = "test-only";
  globalThis.fetch = (async (input, init) =>
    new Response(JSON.stringify(handler(String(input), init)), {
      status: 200,
    })) as typeof fetch;
  try {
    await work();
  } finally {
    globalThis.fetch = old;
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
}
test("checkout transmits coupon, shipping, automatic tax, line values and stable idempotency", async () => {
  const calls: Array<{ url: string; data: URLSearchParams; key: string }> = [];
  await withProvider(
    (url, init) => {
      calls.push({
        url,
        data: new URLSearchParams(String(init?.body)),
        key: (init?.headers as Record<string, string>)["Idempotency-Key"],
      });
      return url.endsWith("/coupons")
        ? { id: "coupon_test" }
        : { id: "cs_test", url: "https://checkout.stripe.com/test" };
    },
    async () => {
      const totals = calculateCheckoutTotals({
        lines: [line],
        couponCodes: [
          { code: "SAVE", label: "Ten percent", percentOff: 10, active: true },
        ],
        couponCode: "save",
        shippingBaseCents: 500,
        shippingPerItemCents: 0,
        taxRate: 0.07,
      });
      await createStripeCheckoutSession({
        baseUrl: "https://example.test",
        currency: "usd",
        orderNumber: "O1",
        buyerEmail: "buyer@example.test",
        lines: [line],
        successPath: "/cart",
        cancelPath: "/cart",
        automaticTax: true,
        allowPromotionCodes: true,
        collectShippingAddress: true,
        totals,
      });
    },
  );
  assert.equal(calls[0].data.get("amount_off"), "1000");
  assert.equal(calls[1].data.get("discounts[0][coupon]"), "coupon_test");
  assert.equal(calls[1].data.has("allow_promotion_codes"), false);
  assert.equal(
    calls[1].data.get(
      "shipping_options[0][shipping_rate_data][fixed_amount][amount]",
    ),
    "500",
  );
  assert.equal(calls[1].data.get("automatic_tax[enabled]"), "true");
  assert.equal(calls[1].key, "checkout:O1:session");
});
test("invoice explicitly attaches its line, finalizes and sends with stable keys", async () => {
  const calls: Array<{ url: string; data: URLSearchParams }> = [];
  await withProvider(
    (url, init) => {
      calls.push({ url, data: new URLSearchParams(String(init?.body)) });
      return {
        id: url.endsWith("/customers") ? "cus_test" : "in_test",
        status: "open",
      };
    },
    async () => {
      await createStripeInvoice({
        customerEmail: "buyer@example.test",
        orderNumber: "O1",
        currency: "usd",
        description: "Test invoice",
        totalCents: 1234,
      });
    },
  );
  assert.equal(calls[2].data.get("invoice"), "in_test");
  assert.ok(calls[3].url.endsWith("/finalize"));
  assert.ok(calls[4].url.endsWith("/send"));
});
test("shipping verifies address and rates first; label purchase uses the selected saved rate", async () => {
  const calls: string[] = [];
  const shipment = {
    id: "shp_test",
    rates: [
      {
        id: "rate_test",
        carrier: "Test carrier",
        service: "Test",
        rate: "5.00",
        currency: "USD",
      },
    ],
  };
  await withProvider(
    (url) => {
      calls.push(url);
      if (url.endsWith("/addresses"))
        return {
          id: "adr_test",
          verifications: { delivery: { success: true } },
        };
      if (url.endsWith("/buy"))
        return {
          ...shipment,
          postage_label: { label_url: "https://example.test/label" },
          tracking_code: "TEST",
        };
      return shipment;
    },
    async () => {
      const quote = await createEasyPostShipment({
        name: "Test",
        street1: "1 Test",
        city: "Test",
        state: "CA",
        zip: "00000",
        weightOunces: 12,
        lengthInches: 10,
        widthInches: 8,
        heightInches: 4,
      });
      assert.equal(
        calls.some((url) => url.endsWith("/buy")),
        false,
      );
      const label = await buyEasyPostShippingLabel(quote.id, "rate_test");
      assert.equal(label.tracking_code, "TEST");
    },
  );
  assert.equal(calls.filter((url) => url.endsWith("/buy")).length, 1);
});
test("invalid webhook signature is rejected and signed body accepted without any provider request", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_testonly";
  try {
    const body = JSON.stringify(event());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: "whsec_testonly",
    });
    assert.equal(verifyStripeEvent(body, signature).id, "evt_1");
    assert.throws(() => verifyStripeEvent(body + " ", signature));
    assert.throws(() => verifyStripeEvent(body, "t=1,v1=invalid"));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("payment removes only the unchanged owned cart snapshots", () => {
  const db = dbFixture();
  reserve(db);
  db.exec(
    "INSERT INTO cart_items VALUES('same','table',1,'old'),('changed','table',2,'new'),('other','table',1,'old')",
  );
  snapshotCheckoutCart(db, "O1", [
    { id: "same", pieceSlug: "table", quantity: 1, updatedAt: "old" },
    { id: "changed", pieceSlug: "table", quantity: 1, updatedAt: "old" },
  ]);
  apply(db);
  assert.deepEqual(
    db
      .prepare("SELECT id FROM cart_items ORDER BY id")
      .all()
      .map((row) => row.id),
    ["changed", "other"],
  );
  db.close();
});
function invoiceEvent(id = "evt_invoice", type = "invoice.paid") {
  return {
    id,
    type,
    data: {
      object: {
        id: "in_test",
        metadata: { order_number: "O1" },
        currency: "usd",
        total: 9500,
        amount_paid: 9500,
        status: "paid",
      },
    },
  };
}
function applyInvoice(db: DatabaseSync, e = invoiceEvent()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = applyInvoiceEvent(db, e, e.id);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function invoiceFixture() {
  const db = dbFixture();
  recordOrderLines(db, "O1", [line]);
  reserveOrderStock(db, "O1");
  reserveProviderOperation(db, {
    key: "invoice:O1",
    orderNumber: "O1",
    kind: "invoice",
    request: { total: 9500 },
  });
  return db;
}
test("invoice payment survives duplicates and out-of-order failures without double stock changes", () => {
  const db = invoiceFixture();
  assert.equal(applyInvoice(db).outcome, "Paid");
  assert.equal(applyInvoice(db).duplicate, true);
  db.exec("UPDATE orders SET status='Shipped'");
  applyInvoice(db, invoiceEvent("evt_fail", "invoice.payment_failed"));
  assert.equal(db.prepare("SELECT status FROM orders").get().status, "Shipped");
  assert.equal(
    db.prepare("SELECT state FROM commerce_stock_reservations").get().state,
    "paid",
  );
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    0,
  );
  db.close();
});
test("invoice mismatch rolls back and void releases exactly once; late payment requires reconciliation", () => {
  const db = invoiceFixture();
  const mismatch = invoiceEvent();
  mismatch.data.object.total = 1;
  assert.throws(() => applyInvoice(db, mismatch));
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM commerce_provider_events").get().n,
    0,
  );
  const partial = invoiceEvent();
  partial.data.object.amount_paid = 2;
  assert.throws(() => applyInvoice(db, partial));
  applyInvoice(db, invoiceEvent("evt_void", "invoice.voided"));
  applyInvoice(db, invoiceEvent("evt_void2", "invoice.voided"));
  assert.equal(
    db.prepare("SELECT inventory_count AS n FROM pieces").get().n,
    1,
  );
  assert.throws(() => applyInvoice(db));
  db.close();
});
test("changed shipping price cannot purchase the formerly quoted rate", async () => {
  let bought = false;
  await withProvider(
    (url) => {
      if (url.endsWith("/buy")) bought = true;
      return {
        id: "shp_test",
        rates: [{ id: "rate_test", rate: "8.00", currency: "USD" }],
      };
    },
    async () => {
      await assert.rejects(
        () =>
          buyEasyPostShippingLabel("shp_test", "rate_test", {
            amount: "5.00",
            currency: "USD",
          }),
        /rate changed/,
      );
    },
  );
  assert.equal(bought, false);
});
