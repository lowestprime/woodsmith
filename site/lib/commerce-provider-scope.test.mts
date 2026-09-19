import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  activateWorkerBusiness,
  provisionWorkerBusiness,
  setMultiWorkerMode,
  setWorkerStripeAccount,
  acceptWorkerFeePolicy,
  updateWorkerFeePolicy,
} from "./woodworkers-store.ts";
import { recordOrderLines, applyInvoiceEvent } from "./commerce-store.ts";
import {
  stripeScopeForOrder,
  easyPostScopeForOrder,
  assertStripeEventBusiness,
} from "./commerce-provider-scope.ts";
import { createStripeCheckoutSession } from "./payments.ts";
test("provider accounts, fees and retries stay attached to the verified seller", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-provider-business-"));
  const environment = {
    NODE_ENV: "test",
    DATA_ROOT: path.join(root, "data"),
    MEDIA_ROOT: path.join(root, "media"),
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_fixture",
    WOODWORKER_PROVIDER_CONFIG_PATH: path.join(root, "providers.json"),
  };
  const previous = Object.fromEntries(
      Object.keys(environment).map((key) => [key, process.env[key]]),
    ),
    fetchBefore = globalThis.fetch;
  Object.assign(process.env, environment);
  const db = await import("./db.ts"),
    commerce = await import("./commerce.ts");
  const admin = { email: "woodsmithbb@proton.me", role: "admin" },
    alice = { email: "alice@example.test", role: "woodworker" },
    bob = { email: "bob@example.test", role: "woodworker" };
  const actors = [alice, bob],
    owners: string[] = [],
    orderNumbers: string[] = [],
    slugs: string[] = [];
  const fromAddress = {
    name: "Fixture business",
    street1: "1 Test Street",
    city: "Test",
    state: "CA",
    zip: "00000",
    country: "US",
  };
  try {
    const template = db.listPieces(true)[0];
    for (const [index, actor] of actors.entries()) {
      db.saveUserProfile({
        ...actor,
        role: "woodworker",
        displayName: actor.email,
        headline: "",
        bio: "",
        publicProfile: false,
        links: [],
      });
      owners.push(
        db.withDatabaseTransaction((store) => {
          const id = provisionWorkerBusiness(
            store,
            admin,
            actor.email,
            "Fixture woodshop",
          );
          activateWorkerBusiness(store, admin, id, true);
          setWorkerStripeAccount(
            store,
            admin,
            id,
            index === 0 ? "acct_Alice" : "acct_Bob",
          );
          return id;
        }),
      );
    }
    db.withDatabaseTransaction((store) => {
      setMultiWorkerMode(store, admin, true);
      for (const actor of actors) acceptWorkerFeePolicy(store, actor, 1);
    });
    for (const [index, actor] of actors.entries()) {
      const slug = `seller-provider-${index}`;
      slugs.push(slug);
      db.savePiece({
        ...template,
        slug,
        title: "Fixture table",
        ownerEmail: actor.email,
        inventoryCount: 4,
        priceCents: 10000,
        priceMode: "fixed",
        publicationStatus: "published",
        mediaPaths: [],
        metadata: {},
      });
      const order = db.createDraftOrder({
        userEmail: `buyer${index}@example.test`,
        subtotalCents: 10000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 1000,
        currency: "usd",
        shippingAddress: fromAddress,
      });
      orderNumbers.push(order);
      db.withDatabaseTransaction((store) => {
        recordOrderLines(store, order, [
          { slug, title: "Fixture table", quantity: 1, unitAmountCents: 10000 },
        ]);
        store
          .prepare(
            "UPDATE resource_ownership SET woodworker_id=? WHERE kind='order' AND resource_key=?",
          )
          .run(owners[index], order);
      });
    }
    const config = Object.fromEntries(
      owners.map((owner, index) => [
        owner,
        {
          apiKey: `test_fixture_shipping_${index}`,
          fromAddress: { ...fromAddress, name: `Business ${index}` },
        },
      ]),
    );
    writeFileSync(
      environment.WOODWORKER_PROVIDER_CONFIG_PATH,
      JSON.stringify(config),
      { mode: 0o600 },
    );
    await t.test(
      "checkout requests use the correct connected account and exact accepted net-goods fee",
      async () => {
        for (const [index, orderNumber] of orderNumbers.entries()) {
          const scope = db.withDatabaseTransaction((store) =>
            stripeScopeForOrder(store, orderNumber),
          );
          assert.equal(scope.feeCents, 540);
          assert.equal(
            scope.accountId,
            index === 0 ? "acct_Alice" : "acct_Bob",
          );
          const calls: Array<{ resource: string; body: URLSearchParams }> = [];
          globalThis.fetch = (async (url, init) => {
            assert.equal(
              (init?.headers as Record<string, string>)["Stripe-Account"],
              scope.accountId,
            );
            calls.push({
              resource: String(url),
              body: new URLSearchParams(String(init?.body)),
            });
            return Response.json({
              id: String(url).endsWith("/coupons")
                ? "coupon_fixture"
                : "cs_fixture",
              url: "https://checkout.stripe.com/fixture",
            });
          }) as typeof fetch;
          await createStripeCheckoutSession({
            scope,
            baseUrl: "https://example.test",
            currency: "usd",
            orderNumber,
            buyerEmail: "buyer@example.test",
            lines: [
              {
                slug: slugs[index],
                title: "Fixture",
                quantity: 1,
                unitAmountCents: 10000,
              },
            ],
            successPath: "/shop/cart",
            cancelPath: "/shop/cart",
            automaticTax: true,
            allowPromotionCodes: true,
            collectShippingAddress: true,
            totals: {
              subtotalCents: 10000,
              shippingCents: 0,
              taxCents: 0,
              discountCents: 1000,
              totalCents: 9000,
              appliedCoupon: null,
            },
          });
          assert.equal(
            calls
              .at(-1)!
              .body.get("payment_intent_data[application_fee_amount]"),
            "540",
          );
          assert.equal(calls.at(-1)!.body.has("allow_promotion_codes"), false);
        }
      },
    );
    await t.test(
      "invoice requests and signed event account matching cannot reassign an order",
      async () => {
        for (const [index, orderNumber] of orderNumbers.entries()) {
          globalThis.fetch = (async (url, init) => {
            assert.equal(
              (init?.headers as Record<string, string>)["Stripe-Account"],
              index === 0 ? "acct_Alice" : "acct_Bob",
            );
            if (String(url).endsWith("/invoices"))
              assert.equal(
                new URLSearchParams(String(init?.body)).get(
                  "application_fee_amount",
                ),
                "540",
              );
            return Response.json({
              id: String(url).endsWith("/customers")
                ? `cus_${index}`
                : `in_${index}`,
              status: "open",
            });
          }) as typeof fetch;
          await commerce.issueOrderInvoice(orderNumber);
          const event = {
            id: `evt_seller_${index}`,
            type: "invoice.paid",
            account: index === 0 ? "acct_Alice" : "acct_Bob",
            data: {
              object: {
                id: `in_${index}`,
                metadata: { order_number: orderNumber },
                currency: "usd",
                total: 9000,
                amount_paid: 9000,
                status: "paid",
              },
            },
          };
          assert.throws(
            () =>
              db.withDatabaseTransaction((store) =>
                applyInvoiceEvent(
                  store,
                  {
                    ...event,
                    account: index === 0 ? "acct_Bob" : "acct_Alice",
                  },
                  "forged",
                ),
              ),
            /account does not match/,
          );
          assert.equal(db.getOrder(orderNumber)!.paymentStatus, null);
          db.withDatabaseTransaction((store) =>
            applyInvoiceEvent(store, event, `paid-${index}`),
          );
          assert.equal(db.getOrder(orderNumber)!.paymentStatus, "Paid");
        }
      },
    );
    await t.test(
      "shipping quotes and buys use only the saved owner credential; no key is persisted",
      async () => {
        for (const [index, orderNumber] of orderNumbers.entries()) {
          let buys = 0;
          globalThis.fetch = (async (url, init) => {
            const expected =
              "Basic " +
              Buffer.from(`test_fixture_shipping_${index}:`).toString("base64");
            assert.equal(
              (init?.headers as Record<string, string>).Authorization,
              expected,
            );
            if (String(url).endsWith("/addresses"))
              return Response.json({
                id: "adr_fixture",
                verifications: { delivery: { success: true } },
              });
            if (String(url).endsWith("/shipments"))
              assert.equal(
                JSON.parse(String(init?.body)).shipment.from_address.name,
                `Business ${index}`,
              );
            if (String(url).endsWith("/buy")) buys++;
            return Response.json({
              id: `shp_${index}`,
              rates: [
                {
                  id: "rate_fixture",
                  carrier: "Fixture",
                  service: "Ground",
                  rate: "5.00",
                  currency: "USD",
                },
              ],
              ...(buys
                ? {
                    postage_label: { label_url: "https://example.test/label" },
                    tracking_code: "fixture",
                  }
                : {}),
            });
          }) as typeof fetch;
          const quote = await commerce.quoteOrderShipping(orderNumber, {
            weightOunces: 10,
            lengthInches: 10,
            widthInches: 10,
            heightInches: 10,
          });
          assert.equal(buys, 0);
          await commerce.purchaseOrderLabel(
            orderNumber,
            quote.operationKey,
            quote.shipmentId,
            "rate_fixture",
          );
          assert.equal(buys, 1);
        }
        const stored = db.withDatabaseTransaction((store) =>
          JSON.stringify([
            store.prepare("SELECT * FROM woodworker_provider_snapshots").all(),
            store.prepare("SELECT * FROM commerce_operations").all(),
          ]),
        );
        assert.ok(!stored.includes("test_fixture_shipping"));
      },
    );
    await t.test(
      "changed configuration cannot switch historical provider accounts, including after reopen",
      () => {
        db.withDatabaseTransaction((store) =>
          setWorkerStripeAccount(store, admin, owners[0], "acct_NewAlice"),
        );
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              stripeScopeForOrder(store, orderNumbers[0]),
            ),
          /saved provider account differs/,
        );
        db.withDatabaseTransaction((store) =>
          assertStripeEventBusiness(store, orderNumbers[0], "acct_Alice"),
        );
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              assertStripeEventBusiness(
                store,
                orderNumbers[0],
                "acct_NewAlice",
              ),
            ),
          /does not match/,
        );
        config[owners[0]].apiKey = "test_rotated";
        writeFileSync(
          environment.WOODWORKER_PROVIDER_CONFIG_PATH,
          JSON.stringify(config),
        );
        db.closeDatabaseForTests();
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              easyPostScopeForOrder(store, orderNumbers[0]),
            ),
          /saved provider account differs/,
        );
        db.withDatabaseTransaction((store) =>
          updateWorkerFeePolicy(
            store,
            admin,
            owners[0],
            700,
            "Seven percent of net goods.",
          ),
        );
        assert.equal(
          db.withDatabaseTransaction(
            (store) =>
              store
                .prepare(
                  "SELECT basis_points FROM woodworker_fee_ledger WHERE order_number=?",
                )
                .get(orderNumbers[0])?.basis_points,
          ),
          600,
        );
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
