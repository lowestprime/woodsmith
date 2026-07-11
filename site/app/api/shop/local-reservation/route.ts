import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createDraftOrder, getPiece, getSiteSettings, listCartItems } from "@/lib/db";
import { getDropoffDriveMinutes, getFulfillmentSummary, getWoodshopZip, pieceShippingEnabled } from "@/lib/catalog";
import { calculateCheckoutTotals } from "@/lib/payments";
import { pieceCanEnterCart } from "@/lib/piece-model";

function redirectTo(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url));
}

function readText(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const buyerEmail = readText(formData, "email").toLowerCase();
  const pickupConsent = formData.get("pickupConsent") === "1";

  if (!buyerEmail) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent("Email is required for local pickup/drop-off review.")}`, request);
  }

  if (!pickupConsent) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent("Please confirm pickup/drop-off consent before continuing.")}`, request);
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

  if (pieces.length === 0) {
    return redirectTo(`/shop/cart?error=${encodeURIComponent(invalidItems.length ? `Some items are no longer available: ${invalidItems.join(", ")}` : "Your cart is empty.")}`, request);
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

  const orderNumber = createDraftOrder({
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
  });

  const summaries = pieces.map(({ piece }) => `${piece.title}: ${getFulfillmentSummary(piece)}`).join(" | ");
  return redirectTo(`/shop/cart?checkout=local-review&order=${encodeURIComponent(orderNumber)}&summary=${encodeURIComponent(summaries.slice(0, 180))}`, request);
}
