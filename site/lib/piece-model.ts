export const PRICE_MODES = [
  "fixed",
  "not-listed",
  "contact-for-price",
  "determined-after-approval",
  "determined-at-order-completion"
] as const;

export type PriceMode = (typeof PRICE_MODES)[number];

export const INQUIRY_MODES = [
  "disabled",
  "exact-piece",
  "custom-pattern",
  "related-commission"
] as const;

export type InquiryMode = (typeof INQUIRY_MODES)[number];

export const REVIEWS_MODES = [
  "hidden",
  "display-approved",
  "display-and-accept"
] as const;

export type ReviewsMode = (typeof REVIEWS_MODES)[number];

export type PiecePolicySource = {
  status: "inventory" | "commission" | "archive";
  publicationStatus?: "published" | "draft" | "archived";
  availabilityLabel?: string;
  priceCents: number | null;
  priceMode?: PriceMode | null;
  publicPriceLabel?: string | null;
  inquiryMode?: InquiryMode | null;
  reviewsMode?: ReviewsMode | null;
  inventoryCount?: number;
  metadata?: Record<string, unknown>;
};

export type PiecePublicPriceDisplay =
  | { kind: "fixed"; cents: number }
  | { kind: "label"; label: string }
  | { kind: "unlisted" };

function oneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function normalizePriceMode(value: unknown, fallback: PriceMode = "not-listed"): PriceMode {
  return oneOf(value, PRICE_MODES) ? value : fallback;
}

export function normalizeInquiryMode(value: unknown, fallback: InquiryMode = "disabled"): InquiryMode {
  return oneOf(value, INQUIRY_MODES) ? value : fallback;
}

export function normalizeReviewsMode(value: unknown, fallback: ReviewsMode = "hidden"): ReviewsMode {
  return oneOf(value, REVIEWS_MODES) ? value : fallback;
}

export function inferLegacyPriceMode(source: Pick<PiecePolicySource, "status" | "availabilityLabel" | "priceCents">): PriceMode {
  if (typeof source.priceCents === "number" && source.priceCents > 0) return "fixed";
  if (source.status === "commission") return "determined-after-approval";

  const availability = String(source.availabilityLabel ?? "").toLowerCase();
  if (source.status === "inventory" && /(available|request|inquir|ask|contact)/.test(availability)) {
    return "contact-for-price";
  }

  return "not-listed";
}

export function inferLegacyInquiryMode(source: Pick<PiecePolicySource, "status" | "publicationStatus">): InquiryMode {
  if (source.publicationStatus === "archived") return "disabled";
  if (source.status === "inventory") return "exact-piece";
  if (source.status === "commission") return "custom-pattern";
  return source.publicationStatus === "published" ? "related-commission" : "disabled";
}

export function inferLegacyReviewsMode(source: Pick<PiecePolicySource, "publicationStatus">): ReviewsMode {
  return source.publicationStatus === "published" ? "display-and-accept" : "hidden";
}

export function getPiecePriceMode(piece: PiecePolicySource): PriceMode {
  const explicit = piece.priceMode ?? piece.metadata?.priceMode;
  return normalizePriceMode(explicit, inferLegacyPriceMode(piece));
}

export function getPieceInquiryMode(piece: PiecePolicySource): InquiryMode {
  const explicit = piece.inquiryMode ?? piece.metadata?.inquiryMode;
  return normalizeInquiryMode(explicit, inferLegacyInquiryMode(piece));
}

export function getPieceReviewsMode(piece: PiecePolicySource): ReviewsMode {
  const explicit = piece.reviewsMode ?? piece.metadata?.reviewsMode;
  return normalizeReviewsMode(explicit, inferLegacyReviewsMode(piece));
}

export function getPiecePublicPriceDisplay(piece: PiecePolicySource): PiecePublicPriceDisplay {
  const override = String(piece.publicPriceLabel ?? piece.metadata?.publicPriceLabel ?? "").trim();
  if (override) return { kind: "label", label: override };

  const mode = getPiecePriceMode(piece);
  if (mode === "fixed" && typeof piece.priceCents === "number" && piece.priceCents > 0) {
    return { kind: "fixed", cents: piece.priceCents };
  }
  if (mode === "contact-for-price") return { kind: "label", label: "Contact for price" };
  if (mode === "determined-after-approval") return { kind: "label", label: "Pricing follows design approval" };
  if (mode === "determined-at-order-completion") return { kind: "label", label: "Final price determined at completion" };
  return { kind: "unlisted" };
}

export function getPiecePublicPriceLabel(piece: PiecePolicySource): string | null {
  const display = getPiecePublicPriceDisplay(piece);
  return display.kind === "label" ? display.label : null;
}

export function pieceCanEnterCart(piece: PiecePolicySource): boolean {
  return piece.publicationStatus === "published"
    && piece.status === "inventory"
    && getPiecePriceMode(piece) === "fixed"
    && typeof piece.priceCents === "number"
    && piece.priceCents > 0
    && Number(piece.inventoryCount ?? 0) > 0;
}

export function pieceDisplaysReviews(piece: PiecePolicySource): boolean {
  return getPieceReviewsMode(piece) !== "hidden";
}

export function pieceAcceptsReviews(piece: PiecePolicySource): boolean {
  return getPieceReviewsMode(piece) === "display-and-accept";
}

export function pieceAllowsInquiry(piece: PiecePolicySource): boolean {
  return getPieceInquiryMode(piece) !== "disabled";
}
