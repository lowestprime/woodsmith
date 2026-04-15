export type CheckoutLine = {
  slug: string;
  title: string;
  quantity: number;
  unitAmountCents: number;
  description?: string;
};

export type AppliedCoupon = {
  code: string;
  label: string;
  percentOff: number;
};

export type CheckoutTotals = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  appliedCoupon: AppliedCoupon | null;
};

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}

export function easyPostConfigured() {
  return Boolean(process.env.EASYPOST_API_KEY);
}

export function resolveCoupon(couponCodes: Array<{ code: string; label: string; percentOff: number; active: boolean }>, code?: string | null) {
  if (!code) {
    return null;
  }

  const normalizedCode = code.trim().toUpperCase();
  return couponCodes.find((coupon) => coupon.active && coupon.code.toUpperCase() === normalizedCode) ?? null;
}

export function calculateCheckoutTotals(input: {
  lines: CheckoutLine[];
  couponCodes: Array<{ code: string; label: string; percentOff: number; active: boolean }>;
  couponCode?: string | null;
  shippingBaseCents: number;
  shippingPerItemCents: number;
  taxRate: number;
}) {
  const subtotalCents = input.lines.reduce((sum, line) => sum + line.unitAmountCents * line.quantity, 0);
  const totalQuantity = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const shippingCents = totalQuantity > 0 ? input.shippingBaseCents + Math.max(0, totalQuantity - 1) * input.shippingPerItemCents : 0;
  const appliedCoupon = resolveCoupon(input.couponCodes, input.couponCode);
  const discountCents = appliedCoupon ? Math.round(subtotalCents * (appliedCoupon.percentOff / 100)) : 0;
  const taxableAmount = Math.max(0, subtotalCents - discountCents) + shippingCents;
  const taxCents = Math.round(taxableAmount * input.taxRate);
  const totalCents = Math.max(0, subtotalCents + shippingCents + taxCents - discountCents);

  const totals: CheckoutTotals = {
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents,
    totalCents,
    appliedCoupon: appliedCoupon
      ? { code: appliedCoupon.code, label: appliedCoupon.label, percentOff: appliedCoupon.percentOff }
      : null
  };

  return totals;
}

function formEncode(entries: Array<[string, string]>) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) {
    body.append(key, value);
  }
  return body;
}

async function stripeRequest<T = Record<string, unknown>>(resource: string, entries: Array<[string, string]>) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe is not configured.");
  }

  const response = await fetch(`https://api.stripe.com/v1/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formEncode(entries)
  });

  let payload: T & { error?: { message?: string } };
  try {
    payload = await response.json() as T & { error?: { message?: string } };
  } catch {
    throw new Error(`Stripe request failed with status ${response.status} (non-JSON response).`);
  }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Stripe request failed with status ${response.status}.`);
  }

  return payload;
}

export async function createStripeCheckoutSession(input: {
  baseUrl: string;
  currency: string;
  orderNumber: string;
  buyerEmail: string;
  lines: CheckoutLine[];
  successPath: string;
  cancelPath: string;
  automaticTax: boolean;
  allowPromotionCodes: boolean;
  collectShippingAddress: boolean;
}) {
  const entries: Array<[string, string]> = [
    ["mode", "payment"],
    ["customer_email", input.buyerEmail],
    ["success_url", `${input.baseUrl}${input.successPath}?order=${input.orderNumber}&checkout=success`],
    ["cancel_url", `${input.baseUrl}${input.cancelPath}?order=${input.orderNumber}&checkout=cancelled`],
    ["metadata[order_number]", input.orderNumber],
    ["billing_address_collection", "required"]
  ];

  if (input.automaticTax) {
    entries.push(["automatic_tax[enabled]", "true"]);
  }

  if (input.allowPromotionCodes) {
    entries.push(["allow_promotion_codes", "true"]);
  }

  if (input.collectShippingAddress) {
    entries.push(["shipping_address_collection[allowed_countries][0]", "US"]);
    entries.push(["shipping_address_collection[allowed_countries][1]", "CA"]);
  }

  input.lines.forEach((line, index) => {
    entries.push([`line_items[${index}][price_data][currency]`, input.currency.toLowerCase()]);
    entries.push([`line_items[${index}][price_data][product_data][name]`, line.title]);
    if (line.description) {
      entries.push([`line_items[${index}][price_data][product_data][description]`, line.description]);
    }
    entries.push([`line_items[${index}][price_data][unit_amount]`, String(line.unitAmountCents)]);
    entries.push([`line_items[${index}][quantity]`, String(line.quantity)]);
  });

  return stripeRequest<{ id: string; url: string }>("checkout/sessions", entries);
}

export async function createStripeInvoice(input: {
  customerEmail: string;
  orderNumber: string;
  currency: string;
  description: string;
  totalCents: number;
}) {
  const customer = await stripeRequest<{ id: string }>("customers", [["email", input.customerEmail], ["name", input.customerEmail]]);
  await stripeRequest("invoiceitems", [
    ["customer", customer.id],
    ["currency", input.currency.toLowerCase()],
    ["amount", String(input.totalCents)],
    ["description", input.description],
    ["metadata[order_number]", input.orderNumber]
  ]);

  return stripeRequest<{ id: string; hosted_invoice_url?: string }>("invoices", [
    ["customer", customer.id],
    ["collection_method", "send_invoice"],
    ["days_until_due", "7"],
    ["metadata[order_number]", input.orderNumber],
    ["auto_advance", "true"]
  ]);
}

export async function createEasyPostShippingLabel(input: {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  weightOunces: number;
}) {
  const apiKey = process.env.EASYPOST_API_KEY;
  if (!apiKey) {
    throw new Error("EasyPost is not configured.");
  }

  const response = await fetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      shipment: {
        to_address: {
          name: input.name,
          street1: input.street1,
          city: input.city,
          state: input.state,
          zip: input.zip,
          country: input.country ?? "US"
        },
        from_address: {
          name: process.env.SHIP_FROM_NAME || "Beaman Woodworks",
          street1: process.env.SHIP_FROM_STREET1 || "",
          city: process.env.SHIP_FROM_CITY || "",
          state: process.env.SHIP_FROM_STATE || "",
          zip: process.env.SHIP_FROM_ZIP || "",
          country: process.env.SHIP_FROM_COUNTRY || "US"
        },
        parcel: {
          weight: input.weightOunces
        }
      }
    })
  });

  let payload: { error?: { message?: string } } & Record<string, unknown>;
  try {
    payload = await response.json() as { error?: { message?: string } } & Record<string, unknown>;
  } catch {
    throw new Error(`EasyPost request failed with status ${response.status} (non-JSON response).`);
  }
  if (!response.ok) {
    throw new Error(payload.error?.message || `EasyPost request failed with status ${response.status}.`);
  }

  return payload;
}
