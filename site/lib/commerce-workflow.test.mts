import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyInvoiceEvent, recordOrderLines } from "./commerce-store.ts";

test("commerce workflows preserve provider identities, inventory and purchase concurrency across retries", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-commerce-workflow-"));
  const environment = {
    NODE_ENV: "test",
    DATA_ROOT: path.join(root, "data"),
    MEDIA_ROOT: path.join(root, "media"),
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    EASYPOST_API_KEY: "test_fixture",
    SHIP_FROM_STREET1: "1 Test Street",
    SHIP_FROM_CITY: "Test",
    SHIP_FROM_STATE: "CA",
    SHIP_FROM_ZIP: "00000",
  };
  const previous = Object.fromEntries(
      Object.keys(environment).map((key) => [key, process.env[key]]),
    ),
    fetchBefore = globalThis.fetch;
  Object.assign(process.env, environment);
  const db = await import("./db.ts"),
    commerce = await import("./commerce.ts");
  let serial = 0;
  function order() {
    const piece = {
      ...db.listPieces(true)[0],
      slug: `commerce-fixture-${++serial}`,
      title: "Fixture",
      priceCents: 10000,
      priceMode: "fixed" as const,
      publicationStatus: "published" as const,
      inventoryCount: 1,
      mediaPaths: [],
      metadata: {},
      ownerEmail: "woodsmithbb@proton.me",
    };
    db.savePiece(piece);
    const orderNumber = db.createDraftOrder({
      userEmail: "buyer@example.test",
      subtotalCents: 10000,
      shippingCents: 0,
      taxCents: 0,
      discountCents: 0,
      currency: "usd",
      billingAddress: { email: "buyer@example.test" },
      shippingAddress: {
        name: "Test Buyer",
        street1: "2 Test Street",
        city: "Test",
        state: "CA",
        zip: "00000",
        country: "US",
      },
    });
    db.withDatabaseTransaction((store) =>
      recordOrderLines(store, orderNumber, [
        {
          slug: piece.slug,
          title: piece.title,
          quantity: 1,
          unitAmountCents: 10000,
        },
      ]),
    );
    return { orderNumber, slug: piece.slug };
  }
  function provider(
    handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>,
  ) {
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      assert.match(url, /^https:\/\/(api.stripe.com|api.easypost.com)\//);
      return new Response(JSON.stringify(await handler(url, init)), {
        status: 200,
      });
    }) as typeof fetch;
  }
  const parcel = {
    weightOunces: 12,
    lengthInches: 10,
    widthInches: 8,
    heightInches: 4,
  };
  try {
    await t.test(
      "unconfigured invoice leaves inventory and provider operations untouched",
      async () => {
        const value = order();
        delete process.env.STRIPE_WEBHOOK_SECRET;
        try {
          await assert.rejects(
            () => commerce.issueOrderInvoice(value.orderNumber),
            /must be configured/,
          );
        } finally {
          process.env.STRIPE_WEBHOOK_SECRET = environment.STRIPE_WEBHOOK_SECRET;
        }
        assert.equal(db.getPiece(value.slug)?.inventoryCount, 1);
        assert.equal(
          db.withDatabaseTransaction(
            (store) =>
              store
                .prepare(
                  "SELECT count(*) AS n FROM commerce_operations WHERE order_number=?",
                )
                .get(value.orderNumber)?.n,
          ),
          0,
        );
      },
    );
    await t.test(
      "ambiguous invoice send retries the same identities and reserves only once",
      async () => {
        const value = order(),
          keys: string[] = [];
        let fail = true;
        provider((url, init) => {
          keys.push(
            (init?.headers as Record<string, string>)["Idempotency-Key"],
          );
          if (url.endsWith("/send") && fail) {
            fail = false;
            throw new Error("fixture timeout");
          }
          return {
            id: url.endsWith("/customers") ? "cus_fixture" : "in_fixture",
            status: "open",
          };
        });
        await assert.rejects(
          () => commerce.issueOrderInvoice(value.orderNumber),
          /fixture timeout/,
        );
        assert.equal(db.getPiece(value.slug)?.inventoryCount, 0);
        await commerce.issueOrderInvoice(value.orderNumber);
        assert.deepEqual(keys.slice(0, 5), keys.slice(5));
        const count = keys.length;
        await commerce.issueOrderInvoice(value.orderNumber);
        assert.equal(keys.length, count);
        const current = db.getOrder(value.orderNumber)!;
        assert.throws(
          () => db.saveOrder({ ...current, totalCents: 2 }),
          /provider payment request/,
        );
        assert.equal(current.invoiceStatus, "Sent");
      },
    );
    await t.test(
      "invoice paid webhook racing the send response retains Paid",
      async () => {
        const value = order();
        provider((url) => {
          if (url.endsWith("/send"))
            db.withDatabaseTransaction((store) =>
              applyInvoiceEvent(
                store,
                {
                  id: "evt_racing_invoice",
                  type: "invoice.paid",
                  data: {
                    object: {
                      id: "in_racing",
                      metadata: { order_number: value.orderNumber },
                      currency: "usd",
                      total: 10000,
                      amount_paid: 10000,
                      status: "paid",
                    },
                  },
                },
                "racing-hash",
              ),
            );
          return {
            id: url.endsWith("/customers") ? "cus_racing" : "in_racing",
            status: "open",
          };
        });
        await commerce.issueOrderInvoice(value.orderNumber);
        assert.equal(db.getOrder(value.orderNumber)?.paymentStatus, "Paid");
        assert.equal(db.getOrder(value.orderNumber)?.invoiceStatus, "Paid");
      },
    );
    await t.test(
      "competing label actions buy once, preserve handoff status and survive reopen",
      async () => {
        const value = order();
        let buys = 0;
        const shipment = {
          id: "shp_fixture",
          rates: [
            {
              id: "rate_fixture",
              carrier: "Fixture",
              service: "Ground",
              rate: "5.00",
              currency: "USD",
            },
          ],
        };
        provider((url) => {
          if (url.endsWith("/addresses"))
            return {
              id: "adr_fixture",
              verifications: { delivery: { success: true } },
            };
          if (url.endsWith("/buy")) buys++;
          return buys
            ? {
                ...shipment,
                postage_label: { label_url: "https://example.test/label" },
                tracking_code: "FIXTURE",
              }
            : shipment;
        });
        const quote = await commerce.quoteOrderShipping(
          value.orderNumber,
          parcel,
        );
        assert.equal(buys, 0);
        const attempt = () =>
          commerce.purchaseOrderLabel(
            value.orderNumber,
            quote.operationKey,
            quote.shipmentId,
            "rate_fixture",
          );
        const results = await Promise.allSettled([attempt(), attempt()]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(buys, 1);
        assert.equal(
          db.getOrder(value.orderNumber)?.status,
          "Label purchased — awaiting handoff",
        );
        db.closeDatabaseForTests();
        await attempt();
        assert.equal(buys, 1);
        assert.equal(db.getOrder(value.orderNumber)?.trackingNumber, "FIXTURE");
        const current = db.getOrder(value.orderNumber)!;
        assert.throws(
          () =>
            db.saveOrder({
              ...current,
              shippingAddress: { ...current.shippingAddress, zip: "99999" },
            }),
          /reconcile postage/i,
        );
      },
    );
    await t.test(
      "uncertain label response is reconciled by GET without another purchase",
      async () => {
        const value = order();
        let buys = 0;
        const shipment = {
          id: "shp_uncertain",
          rates: [
            {
              id: "rate_fixture",
              carrier: "Fixture",
              service: "Ground",
              rate: "5.00",
              currency: "USD",
            },
          ],
        };
        provider((url) => {
          if (url.endsWith("/addresses"))
            return {
              id: "adr_fixture",
              verifications: { delivery: { success: true } },
            };
          if (url.endsWith("/buy")) {
            buys++;
            throw new Error("fixture timeout");
          }
          return buys
            ? {
                ...shipment,
                postage_label: { label_url: "https://example.test/label" },
                tracking_code: "FIXTURE",
              }
            : shipment;
        });
        const quote = await commerce.quoteOrderShipping(
            value.orderNumber,
            parcel,
          ),
          attempt = () =>
            commerce.purchaseOrderLabel(
              value.orderNumber,
              quote.operationKey,
              quote.shipmentId,
              "rate_fixture",
            );
        await assert.rejects(attempt, /fixture timeout/);
        await attempt();
        assert.equal(buys, 1);
      },
    );
    await t.test(
      "changed rate requires a fresh confirmed quote; rejected attempt buys nothing",
      async () => {
        const value = order();
        let price = "5.00",
          buys = 0;
        provider((url) => {
          if (url.endsWith("/addresses"))
            return {
              id: "adr_fixture",
              verifications: { delivery: { success: true } },
            };
          if (url.endsWith("/buy")) buys++;
          return {
            id: "shp_changed",
            rates: [
              {
                id: "rate_fixture",
                carrier: "Fixture",
                service: "Ground",
                rate: price,
                currency: "USD",
              },
            ],
            ...(buys
              ? {
                  postage_label: { label_url: "https://example.test/label" },
                  tracking_code: "FIXTURE",
                }
              : {}),
          };
        });
        let quote = await commerce.quoteOrderShipping(
          value.orderNumber,
          parcel,
        );
        price = "8.00";
        await assert.rejects(
          () =>
            commerce.purchaseOrderLabel(
              value.orderNumber,
              quote.operationKey,
              quote.shipmentId,
              "rate_fixture",
            ),
          /rate changed/,
        );
        assert.equal(buys, 0);
        quote = await commerce.quoteOrderShipping(value.orderNumber, parcel);
        assert.equal(quote.rates[0].amount, "8.00");
        await commerce.purchaseOrderLabel(
          value.orderNumber,
          quote.operationKey,
          quote.shipmentId,
          "rate_fixture",
        );
        assert.equal(buys, 1);
      },
    );
  } finally {
    globalThis.fetch = fetchBefore;
    db.closeDatabaseForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
