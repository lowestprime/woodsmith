import type { EasyPostScope } from "./commerce-provider-scope.ts";
import Stripe from "stripe";

export type StripeAccountContext = {accountId:string|null;feeCents:number};

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
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_WEBHOOK_SECRET);
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

export async function stripeRequest<T = Record<string, unknown>>(resource: string, entries: Array<[string, string]>, idempotencyKey: string, scope?:StripeAccountContext) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe is not configured.");
  }

  const response = await fetch(`https://api.stripe.com/v1/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
      ...(scope?.accountId ? {"Stripe-Account":scope.accountId} : {})
    },
    body: formEncode(entries),
    signal: AbortSignal.timeout(30_000)
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
  totals: CheckoutTotals;
  scope?:StripeAccountContext;
}) {
  if (!input.automaticTax) throw new Error("Online checkout requires Stripe Tax. Enable automatic tax after configuring the business tax registrations; use invoice review otherwise.");
  validateCheckoutMoney(input.lines, input.totals);
  const entries: Array<[string, string]> = [
    ["mode", "payment"],
    ["customer_email", input.buyerEmail],
    ["success_url", `${input.baseUrl}${input.successPath}?order=${input.orderNumber}&checkout=success`],
    ["cancel_url", `${input.baseUrl}${input.cancelPath}?order=${input.orderNumber}&checkout=cancelled`],
    ["metadata[order_number]", input.orderNumber],
    ["billing_address_collection", "required"],
    ["client_reference_id", input.orderNumber],
    ["invoice_creation[enabled]", "true"]
  ];

  if(input.scope?.accountId){
    entries.push(['payment_intent_data[application_fee_amount]',String(input.scope.feeCents)]);
  }
  if (input.automaticTax) {
    entries.push(["automatic_tax[enabled]", "true"]);
  }

  if (input.totals.discountCents > 0) {
    const coupon = await stripeRequest<{id:string}>("coupons", [["amount_off",String(input.totals.discountCents)],["currency",input.currency.toLowerCase()],["duration","once"],["name",input.totals.appliedCoupon?.label || "Order discount"]], `checkout:${input.orderNumber}:coupon`,input.scope);
    entries.push(["discounts[0][coupon]",coupon.id]);
  } else if (input.allowPromotionCodes && !input.scope?.accountId) {
    entries.push(["allow_promotion_codes", "true"]);
  }

  if (input.collectShippingAddress) {
    entries.push(["shipping_address_collection[allowed_countries][0]", "US"]);
    entries.push(["shipping_address_collection[allowed_countries][1]", "CA"]);
  }

  entries.push(["shipping_options[0][shipping_rate_data][display_name]",input.totals.shippingCents ? "Agreed shipping estimate" : "Pickup / local fulfillment"],["shipping_options[0][shipping_rate_data][type]","fixed_amount"],["shipping_options[0][shipping_rate_data][fixed_amount][amount]",String(input.totals.shippingCents)],["shipping_options[0][shipping_rate_data][fixed_amount][currency]",input.currency.toLowerCase()],["shipping_options[0][shipping_rate_data][tax_behavior]","exclusive"]);

  input.lines.forEach((line, index) => {
    entries.push([`line_items[${index}][price_data][tax_behavior]`, "exclusive"]);
    entries.push([`line_items[${index}][price_data][product_data][metadata][piece_slug]`,line.slug]);
    entries.push([`line_items[${index}][price_data][currency]`, input.currency.toLowerCase()]);
    entries.push([`line_items[${index}][price_data][product_data][name]`, line.title]);
    if (line.description) {
      entries.push([`line_items[${index}][price_data][product_data][description]`, line.description]);
    }
    entries.push([`line_items[${index}][price_data][unit_amount]`, String(line.unitAmountCents)]);
    entries.push([`line_items[${index}][quantity]`, String(line.quantity)]);
  });

  return stripeRequest<{ id: string; url: string }>("checkout/sessions", entries, `checkout:${input.orderNumber}:session`,input.scope);
}

export async function createStripeInvoice(input: {
  customerEmail: string;
  orderNumber: string;
  currency: string;
  description: string;
  totalCents: number;
  scope?:StripeAccountContext;
}) {
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents <= 0) throw new Error("An invoice needs a positive confirmed total.");
  const key=`invoice:${input.orderNumber}`;
  const customer = await stripeRequest<{ id: string }>("customers", [["email", input.customerEmail]],`${key}:customer`,input.scope);
  const invoice = await stripeRequest<{id:string}>("invoices", [["customer",customer.id],["collection_method","send_invoice"],["days_until_due","7"],["metadata[order_number]",input.orderNumber],["auto_advance","false"],...(input.scope?.accountId ? [["application_fee_amount",String(input.scope.feeCents)] as [string,string]] : [])],`${key}:draft`,input.scope);
  await stripeRequest("invoiceitems", [["customer",customer.id],["invoice",invoice.id],["currency",input.currency.toLowerCase()],["amount",String(input.totalCents)],["description",input.description],["metadata[order_number]",input.orderNumber]],`${key}:line`,input.scope);
  await stripeRequest(`invoices/${invoice.id}/finalize`,[["auto_advance","false"]],`${key}:finalize`,input.scope);
  return stripeRequest<{id:string;status:string;hosted_invoice_url?:string}>(`invoices/${invoice.id}/send`,[],`${key}:send`,input.scope);
}

export function validateCheckoutMoney(lines: readonly CheckoutLine[],totals:CheckoutTotals) {
  if(!lines.length || lines.length>90)throw new Error("Checkout needs between one and ninety items.");
  for(const line of lines)if(!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>999||!Number.isSafeInteger(line.unitAmountCents)||line.unitAmountCents<=0)throw new Error("Invalid checkout line.");
  for(const value of [totals.subtotalCents,totals.shippingCents,totals.taxCents,totals.discountCents,totals.totalCents])if(!Number.isSafeInteger(value)||value<0)throw new Error("Invalid checkout total.");
  if(totals.subtotalCents!==lines.reduce((sum,line)=>sum+line.quantity*line.unitAmountCents,0)||totals.discountCents>totals.subtotalCents||totals.totalCents!==totals.subtotalCents+totals.shippingCents+totals.taxCents-totals.discountCents)throw new Error("Checkout totals do not reconcile.");
}
export function verifyStripeEvent(body:string,signature:string) {
  const secrets=[process.env.STRIPE_WEBHOOK_SECRET,process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((value):value is string=>Boolean(value));
  if(!secrets.length)throw new Error("Stripe webhook is not configured.");
  for(const secret of secrets){try{return Stripe.webhooks.constructEvent(body,signature,secret);}catch{ /* Each endpoint has its own signing secret. */ }}
  throw new Error("Invalid Stripe webhook signature.");
}
export async function getStripeSession(id:string,scope?:StripeAccountContext) {
  if(!/^cs_[a-zA-Z0-9_]+$/.test(id)||!process.env.STRIPE_SECRET_KEY)throw new Error("Invalid checkout session.");
  const response=await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`,{headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,...(scope?.accountId?{"Stripe-Account":scope.accountId}:{})},signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error(`Stripe session lookup failed (${response.status}).`);
  return response.json() as Promise<{id:string;url:string|null;status:string}>;
}

export type ShippingAddress={name:string;street1:string;city:string;state:string;zip:string;country?:string};
export type ShippingParcel={weightOunces:number;lengthInches:number;widthInches:number;heightInches:number};
export type ShippingRate={id:string;carrier:string;service:string;rate:string;currency:string};
export type ShippingShipment={id:string;rates:ShippingRate[];postage_label?:{label_url?:string};tracker?:{tracking_code?:string};tracking_code?:string;selected_rate?:ShippingRate};
async function easyPostRequest(resource:string,body?:unknown,scope?:EasyPostScope) {
  const apiKey=scope?.apiKey||process.env.EASYPOST_API_KEY;
  if(!apiKey)throw new Error("EasyPost is not configured.");
  const response=await fetch(`https://api.easypost.com/v2/${resource}`,{method:body===undefined?"GET":"POST",headers:{Authorization:`Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30_000)});
  let value: Record<string,unknown>;try{value=await response.json();}catch{throw new Error(`EasyPost returned a non-JSON response (${response.status}).`);}
  if(!response.ok)throw new Error(`EasyPost request failed (${response.status}); review provider status and the saved operation before retrying.`);
  return value;
}
export async function createEasyPostShipment(input:ShippingAddress & ShippingParcel,scope?:EasyPostScope) {
  const from=scope?.fromAddress??{name:process.env.SHIP_FROM_NAME||"Beaman Woodworks",street1:process.env.SHIP_FROM_STREET1||"",city:process.env.SHIP_FROM_CITY||"",state:process.env.SHIP_FROM_STATE||"",zip:process.env.SHIP_FROM_ZIP||"",country:process.env.SHIP_FROM_COUNTRY||"US"};
  const to={name:input.name,street1:input.street1,city:input.city,state:input.state,zip:input.zip,country:input.country||"US"};
  if(Object.values(from).some(v=>!v.trim())||Object.values(to).some(v=>!v.trim()))throw new Error("Complete both shipping addresses before requesting rates.");
  for(const value of [input.weightOunces,input.lengthInches,input.widthInches,input.heightInches])if(!Number.isFinite(value)||value<=0||value>10000)throw new Error("Enter real package weight and dimensions.");
  // Address verification is a separate provider operation; rejected addresses do not create a shipment.
  const verified=await easyPostRequest("addresses",{address:to,verify:["delivery"]},scope) as {id:string;verifications?:{delivery?:{success?:boolean}}};
  if(verified.verifications?.delivery?.success!==true)throw new Error("The destination could not be verified. Correct it before buying postage.");
  const shipment=await easyPostRequest("shipments",{shipment:{to_address:{id:verified.id},from_address:from,parcel:{weight:input.weightOunces,length:input.lengthInches,width:input.widthInches,height:input.heightInches}}},scope) as ShippingShipment;
  if(!shipment.id||!Array.isArray(shipment.rates)||!shipment.rates.length)throw new Error("No shipping rates are available for this package.");
  return shipment;
}
export async function getEasyPostShipment(id:string,scope?:EasyPostScope) {
  if(!/^shp_[a-zA-Z0-9]+$/.test(id))throw new Error("Invalid shipment identifier.");
  return easyPostRequest(`shipments/${id}`,undefined,scope) as Promise<ShippingShipment>;
}
export class ShippingPurchaseNotStartedError extends Error {}

export async function buyEasyPostShippingLabel(shipmentId:string,rateId:string,expected?:{amount:string;currency:string},scope?:EasyPostScope) {
  let shipment:ShippingShipment;
  try { shipment=await getEasyPostShipment(shipmentId,scope); }
  catch { throw new ShippingPurchaseNotStartedError('The shipment could not be checked. No purchase was started; retry the quote.'); }
  if(shipment.postage_label?.label_url)return shipment;
  const rate=shipment.rates.find(rate=>rate.id===rateId);
  if(!rate)throw new ShippingPurchaseNotStartedError("Choose a rate from this shipment.");
  if(expected&&(Number(rate.rate)!==Number(expected.amount)||rate.currency.toUpperCase()!==expected.currency.toUpperCase()))throw new ShippingPurchaseNotStartedError("The shipping rate changed. Request and confirm fresh rates before purchasing.");
  const bought=await easyPostRequest(`shipments/${shipmentId}/buy`,{rate:{id:rateId}},scope) as ShippingShipment;
  if(!bought.postage_label?.label_url||!(bought.tracking_code||bought.tracker?.tracking_code))throw new Error("Label purchase was not confirmed; reconcile this shipment before retrying.");
  return bought;
}
