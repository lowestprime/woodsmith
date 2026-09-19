import {
  stripeScopeForOrder,
  easyPostScopeForOrder,
} from "./commerce-provider-scope.ts";
import { getOrder, saveOrder, withDatabaseTransaction } from "./db.ts";
import {
  commerceHash,
  finishProviderOperation,
  reserveProviderOperation,
  reserveOrderStock,
} from "./commerce-store.ts";
import {
  ShippingPurchaseNotStartedError,
  stripeIsConfigured,
  buyEasyPostShippingLabel,
  createEasyPostShipment,
  createStripeInvoice,
  getEasyPostShipment,
  type ShippingParcel,
  type ShippingShipment,
} from "./payments.ts";

export async function issueOrderInvoice(orderNumber: string) {
  if (!stripeIsConfigured())
    throw new Error(
      "Stripe payment reconciliation must be configured before invoicing.",
    );
  const order = getOrder(orderNumber);
  if (!order?.userEmail) throw new Error("The order needs a buyer email.");
  if (order.paymentStatus === "Paid")
    throw new Error("This order is already paid.");
  const request = {
    customerEmail: String(order.billingAddress.email || order.userEmail),
    orderNumber,
    currency: order.currency,
    description: `Invoice for ${orderNumber}`,
    totalCents: order.totalCents,
    scope: withDatabaseTransaction((db) =>
      stripeScopeForOrder(db, orderNumber),
    ),
  };
  const key = `invoice:${orderNumber}`;
  const operation = withDatabaseTransaction((db) => {
    if (
      db
        .prepare("SELECT 1 FROM commerce_checkouts WHERE order_number=?")
        .get(orderNumber)
    )
      throw new Error(
        "This order already has a checkout payment channel. Reconcile that checkout before invoicing.",
      );
    const saved = reserveProviderOperation(db, {
      key,
      orderNumber,
      kind: "invoice",
      request,
    });
    if (saved.state !== "complete") reserveOrderStock(db, orderNumber);
    return saved;
  });
  if (operation.state === "complete")
    return JSON.parse(operation.result_json) as { id: string };
  if (Date.now() - Date.parse(operation.created_at) > 23 * 60 * 60 * 1000)
    throw new Error(
      "This invoice request is outside the provider retry window. Reconcile it in Stripe before creating another invoice.",
    );
  const invoice = await createStripeInvoice(request);
  withDatabaseTransaction((db) => {
    const current = getOrder(orderNumber);
    if (!current) throw new Error("Order disappeared.");
    saveOrder({
      ...current,
      stripeInvoiceId: invoice.id,
      invoiceStatus:
        current.paymentStatus === "Paid"
          ? "Paid"
          : current.invoiceStatus && current.invoiceStatus !== "Draft"
            ? current.invoiceStatus
            : "Sent",
    });
    finishProviderOperation(db, key, {
      id: invoice.id,
      status: invoice.status,
    });
  });
  return invoice;
}
export type OrderShippingQuote = {
  shipmentId: string;
  operationKey: string;
  rates: Array<{
    id: string;
    carrier: string;
    service: string;
    amount: string;
    currency: string;
  }>;
};
export async function quoteOrderShipping(
  orderNumber: string,
  parcel: ShippingParcel,
): Promise<OrderShippingQuote> {
  const order = getOrder(orderNumber);
  if (!order) throw new Error("Order not found.");
  const scope = withDatabaseTransaction((db) =>
    easyPostScopeForOrder(db, orderNumber),
  );
  const address = order.shippingAddress;
  const input = {
    name: String(address.name || ""),
    street1: String(address.street1 || ""),
    city: String(address.city || ""),
    state: String(address.state || ""),
    zip: String(address.zip || ""),
    country: String(address.country || "US"),
    ...parcel,
  };
  const key = `shipping:${orderNumber}:${commerceHash(input).slice(0, 24)}`;
  const operation = withDatabaseTransaction((db) =>
    reserveProviderOperation(db, {
      key,
      orderNumber,
      kind: "shipping",
      request: input,
    }),
  );
  let shipment: ShippingShipment;
  if (operation.state !== "prepared") {
    const saved = JSON.parse(operation.result_json) as { id?: string };
    if (!saved.id) throw new Error("Saved shipment requires reconciliation.");
    shipment = await getEasyPostShipment(saved.id, scope);
  } else {
    shipment = await createEasyPostShipment(input, scope);
    withDatabaseTransaction((db) => {
      const changed = db
        .prepare(
          "UPDATE commerce_operations SET state='quoted',result_json=?,updated_at=? WHERE operation_key=? AND state='prepared'",
        )
        .run(
          JSON.stringify({ id: shipment.id, input, rates: shipment.rates }),
          new Date().toISOString(),
          key,
        );
      if (!changed.changes)
        throw new Error(
          "Another quote is already saved. Request rates again to load it.",
        );
    });
  }
  if (operation.state === "quoted")
    withDatabaseTransaction((db) => {
      const changed = db
        .prepare(
          "UPDATE commerce_operations SET result_json=?,updated_at=? WHERE operation_key=? AND state='quoted'",
        )
        .run(
          JSON.stringify({ id: shipment.id, input, rates: shipment.rates }),
          new Date().toISOString(),
          key,
        );
      if (!changed.changes)
        throw new Error(
          "The label operation changed while refreshing rates. Wait for its result.",
        );
    });
  return {
    shipmentId: shipment.id,
    operationKey: key,
    rates: shipment.rates.map((rate) => ({
      id: rate.id,
      carrier: rate.carrier,
      service: rate.service,
      amount: rate.rate,
      currency: rate.currency,
    })),
  };
}
export async function purchaseOrderLabel(
  orderNumber: string,
  operationKey: string,
  shipmentId: string,
  rateId: string,
) {
  const scope = withDatabaseTransaction((db) =>
    easyPostScopeForOrder(db, orderNumber),
  );
  const operation = withDatabaseTransaction((db) => {
    const saved = db
      .prepare(
        "SELECT state,result_json,updated_at FROM commerce_operations WHERE operation_key=? AND order_number=? AND kind='shipping'",
      )
      .get(operationKey, orderNumber) as
      | { state: string; result_json: string; updated_at: string }
      | undefined;
    if (!saved || JSON.parse(saved.result_json).id !== shipmentId)
      throw new Error("The shipment does not belong to this order.");
    if (saved.state === "quoted") {
      const snapshot = JSON.parse(saved.result_json) as {
        input: ShippingParcel & Record<string, unknown>;
      };
      const current = getOrder(orderNumber);
      if (!current) throw new Error("Order not found.");
      const address = current.shippingAddress;
      const now = {
        ...snapshot.input,
        name: String(address.name || ""),
        street1: String(address.street1 || ""),
        city: String(address.city || ""),
        state: String(address.state || ""),
        zip: String(address.zip || ""),
        country: String(address.country || "US"),
      };
      if (commerceHash(now) !== commerceHash(snapshot.input))
        throw new Error(
          "The destination changed. Request fresh rates before buying postage.",
        );
    }
    if (saved.state === "quoted")
      db.prepare(
        "UPDATE commerce_operations SET state='buying',updated_at=? WHERE operation_key=?",
      ).run(new Date().toISOString(), operationKey);
    return saved;
  });
  let label: ShippingShipment;
  if (
    operation.state === "buying" &&
    Date.now() - Date.parse(operation.updated_at) < 60_000
  )
    throw new Error(
      "A label purchase is already in progress. Wait for its result.",
    );
  if (
    operation.state === "complete" ||
    operation.state === "uncertain" ||
    operation.state === "buying"
  ) {
    label = await getEasyPostShipment(shipmentId, scope);
    if (!label.postage_label?.label_url)
      throw new Error(
        "The previous purchase is not confirmed. Reconcile this saved shipment in EasyPost before another purchase.",
      );
  } else if (operation.state === "quoted") {
    try {
      const selected = (
        JSON.parse(operation.result_json) as {
          rates: ShippingShipment["rates"];
        }
      ).rates.find((rate) => rate.id === rateId);
      if (!selected)
        throw new ShippingPurchaseNotStartedError(
          "Choose one of the quoted rates.",
        );
      label = await buyEasyPostShippingLabel(
        shipmentId,
        rateId,
        { amount: selected.rate, currency: selected.currency },
        scope,
      );
    } catch (error) {
      withDatabaseTransaction((db) =>
        finishProviderOperation(
          db,
          operationKey,
          JSON.parse(operation.result_json),
          error instanceof ShippingPurchaseNotStartedError
            ? "quoted"
            : "uncertain",
        ),
      );
      throw error;
    }
  } else throw new Error("Request rates before buying a label.");
  if (
    !label.postage_label?.label_url ||
    new URL(label.postage_label.label_url).protocol !== "https:"
  )
    throw new Error("The provider returned an invalid label location.");
  const tracking = label.tracking_code || label.tracker?.tracking_code || "";
  if (!tracking || !label.postage_label?.label_url)
    throw new Error("The purchased label is incomplete.");
  withDatabaseTransaction((db) => {
    const current = getOrder(orderNumber);
    if (!current) throw new Error("Order not found.");
    saveOrder({
      ...current,
      shippingLabelId: label.id,
      trackingNumber: tracking,
      status:
        current.status === "Shipped"
          ? "Shipped"
          : "Label purchased — awaiting handoff",
    });
    finishProviderOperation(db, operationKey, {
      id: label.id,
      labelUrl: label.postage_label?.label_url,
      tracking,
    });
  });
  return { labelUrl: label.postage_label.label_url, trackingNumber: tracking };
}
