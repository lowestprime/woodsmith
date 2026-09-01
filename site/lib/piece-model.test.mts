import test from "node:test";
import assert from "node:assert/strict";
import {
  getPieceInquiryMode,
  getPiecePriceMode,
  getPiecePublicPriceDisplay,
  getPiecePublicPriceLabel,
  getPieceReviewsMode,
  pieceAcceptsReviews,
  pieceAllowsInquiry,
  pieceCanEnterCart,
  pieceDisplaysReviews,
  type PiecePolicySource,
  type PriceMode
} from "./piece-model.ts";

function piece(overrides: Partial<PiecePolicySource> = {}): PiecePolicySource {
  return {
    status: "inventory",
    publicationStatus: "published",
    availabilityLabel: "Available",
    priceCents: 125_000,
    inventoryCount: 1,
    metadata: {},
    ...overrides
  };
}

test("fixed-price cart eligibility requires public positive inventory", () => {
  assert.equal(pieceCanEnterCart(piece({ priceMode: "fixed" })), true);
  assert.equal(pieceCanEnterCart(piece({ priceMode: "fixed", priceCents: 0 })), false);
  assert.equal(pieceCanEnterCart(piece({ priceMode: "fixed", inventoryCount: 0 })), false);
  assert.equal(pieceCanEnterCart(piece({ priceMode: "contact-for-price" })), false);
  assert.equal(pieceCanEnterCart(piece({ priceMode: "fixed", publicationStatus: "draft" })), false);
});

test("all pricing modes resolve without interpreting sentinels as money", () => {
  const modes: PriceMode[] = [
    "fixed",
    "not-listed",
    "contact-for-price",
    "determined-after-approval",
    "determined-at-order-completion"
  ];
  for (const mode of modes) assert.equal(getPiecePriceMode(piece({ priceMode: mode })), mode);
  assert.equal(getPiecePriceMode(piece({ status: "archive", priceCents: -1, priceMode: null })), "not-listed");
  assert.equal(getPiecePriceMode(piece({ status: "inventory", priceCents: -1, priceMode: null })), "contact-for-price");
  assert.equal(getPiecePublicPriceLabel(piece({ priceMode: "contact-for-price" })), "Contact for price");
  assert.equal(getPiecePublicPriceLabel(piece({ priceMode: "not-listed" })), null);
  assert.deepEqual(getPiecePublicPriceDisplay(piece({ priceMode: "fixed", inventoryCount: 0 })), { kind: "fixed", cents: 125_000 });
  assert.deepEqual(getPiecePublicPriceDisplay(piece({ priceMode: "fixed", priceCents: 0 })), { kind: "unlisted" });
  assert.deepEqual(getPiecePublicPriceDisplay(piece({ priceMode: "determined-after-approval" })), { kind: "label", label: "Pricing follows design approval" });
  assert.deepEqual(getPiecePublicPriceDisplay(piece({ priceMode: "fixed", publicPriceLabel: "Price on written quote" })), { kind: "label", label: "Price on written quote" });
});

test("inquiry and review modes are independent from legacy status", () => {
  const source = piece({ inquiryMode: "disabled", reviewsMode: "hidden" });
  assert.equal(getPieceInquiryMode(source), "disabled");
  assert.equal(pieceAllowsInquiry(source), false);
  assert.equal(getPieceReviewsMode(source), "hidden");
  assert.equal(pieceDisplaysReviews(source), false);
  assert.equal(pieceAcceptsReviews(source), false);

  const enabled = piece({ inquiryMode: "related-commission", reviewsMode: "display-and-accept" });
  assert.equal(pieceAllowsInquiry(enabled), true);
  assert.equal(pieceDisplaysReviews(enabled), true);
  assert.equal(pieceAcceptsReviews(enabled), true);
});
