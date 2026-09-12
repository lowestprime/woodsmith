import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { consumeCommissionSubmissionQuota, getPiece, getSiteSettings, listCartItems } from "@/lib/db";
import { getDropoffDriveMinutes, getFulfillmentSummary, getWoodshopZip, pieceShippingEnabled } from "@/lib/catalog";
import { calculateCheckoutTotals } from "@/lib/payments";
import { pieceCanEnterCart } from "@/lib/piece-model";
import { assertTrustedMutationOrigin, UntrustedMutationOriginError } from "@/lib/request-security";
import { normalizeNotificationAddresses } from "@/lib/notification-routing";
import { createOrderInquiry, retryNotificationDelivery } from "@/lib/notifications";
import { commissionOwnerKey } from "@/lib/commission-security";

function redirectTo(path: string) {
  // Keep the browser on its public origin rather than Next's container hostname.
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function readText(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); }
  catch (error) {
    if (error instanceof UntrustedMutationOriginError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
  const formData = await request.formData();
  let buyerEmail: string;
  try {
    const addresses = normalizeNotificationAddresses(readText(formData, "email"));
    if (addresses.length !== 1) throw new Error("Enter one customer email address.");
    buyerEmail = addresses[0];
  } catch {
    return redirectTo(`/shop/cart?error=${encodeURIComponent("Enter one valid email address for local pickup/delivery review.")}`);
  }
  const pickupConsent = formData.get("pickupConsent") === "1";

  if (!pickupConsent) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent("Please confirm pickup/drop-off consent before continuing.")}`);
  }

  const cookieStore = await cookies();
  const cartToken = cookieStore.get("beaman-cart")?.value || "";
  const user = await getCurrentUser();
  const site = getSiteSettings();
  const cartItems = listCartItems(cartToken, user?.email ?? null);
  const invalidItems: string[] = [];
  const pieces = cartItems.flatMap((item) => {
    const piece = getPiece(item.pieceSlug);
    if (!piece || !pieceCanEnterCart(piece) || piece.priceCents == null || item.quantity > piece.inventoryCount) {
      invalidItems.push(item.pieceSlug);
      return [];
    }
    return [{ item, piece }];
  });

  if (pieces.length === 0 || invalidItems.length > 0) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent(invalidItems.length ? `Some items are no longer available: ${invalidItems.join(", ")}` : "Your cart is empty.")}`);
  }

  const lines = pieces.map(({ item, piece }) => ({
    slug: piece.slug,
    title: piece.title,
    quantity: item.quantity,
    unitAmountCents: piece.priceCents!,
    description: piece.subtitle
  }));

  const totals = calculateCheckoutTotals({
    lines,
    couponCodes: [...site.couponCodes],
    couponCode: readText(formData, "couponCode") || null,
    shippingBaseCents: 0,
    shippingPerItemCents: 0,
    taxRate: site.localTaxRate
  });

  const firstPiece = pieces[0]?.piece;
  const woodshopZip = firstPiece ? getWoodshopZip(firstPiece.metadata) : "94122";
  const dropoffDriveMinutes = firstPiece ? getDropoffDriveMinutes(firstPiece.metadata) : 120;
  const anyShippingEnabled = pieces.some(({ piece }) => pieceShippingEnabled(piece));

  if (!consumeCommissionSubmissionQuota(`local-reservation:${await commissionOwnerKey(user?.email)}`, 5).allowed) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent("Too many requests. Please try again later.")}`);
  }
  const { orderNumber, notice } = createOrderInquiry({
    kind: "local_review", customerName: readText(formData, "shippingName") || user?.displayName || "Customer",
    customerEmail: buyerEmail, lines,
    studioUrl: new URL("/studio?panel=orders", process.env.SITE_URL || request.url).href,
    order: {
    userEmail: user?.email ?? buyerEmail,
    subtotalCents: totals.subtotalCents,
    shippingCents: 0,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    currency: site.cartCurrency,
    couponCode: totals.appliedCoupon?.code ?? null,
    shippingRateLabel: anyShippingEnabled ? "Local pickup/drop-off review; shipping only if explicitly confirmed" : "Local pickup/drop-off review",
    shippingAddress: {
      name: readText(formData, "shippingName"),
      street1: readText(formData, "shippingStreet1"),
      city: readText(formData, "shippingCity"),
      state: readText(formData, "shippingState"),
      zip: readText(formData, "shippingZip"),
      fulfillmentMode: "local_review",
      pickupConsent,
      woodshopZip,
      dropoffDriveMinutes,
      anonymityNote: "Do not reveal exact shop or buyer address until fulfillment is approved."
    },
    billingAddress: {
      email: buyerEmail
    }
    }
  });
  if (notice.shouldDeliver) await retryNotificationDelivery(notice.delivery.id);

  const summaries = pieces.map(({ piece }) => `${piece.title}: ${getFulfillmentSummary(piece)}`).join(" | ");
  return redirectTo(`/shop/cart?checkout=local-review&order=${encodeURIComponent(orderNumber)}&summary=${encodeURIComponent(summaries.slice(0, 180))}`);
}
