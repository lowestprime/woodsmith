import type { PieceRecord } from "@/lib/db";

export const portfolioCategories = [
  { key: "all", label: "All pieces" },
  { key: "tables", label: "Tables" },
  { key: "benches", label: "Benches" },
  { key: "stepstools", label: "Stepstools" },
  { key: "cabinets", label: "Cabinets" },
  { key: "objects", label: "Objects" }
] as const;

export type PortfolioCategoryKey = (typeof portfolioCategories)[number]["key"];

export function normalizePortfolioCategory(value: string | null | undefined): PortfolioCategoryKey {
  const normalized = (value || "").toLowerCase().trim();

  if (normalized.includes("bench")) {
    return "benches";
  }

  if (normalized.includes("step") || normalized.includes("stool")) {
    return "stepstools";
  }

  if (normalized.includes("cabinet") || normalized.includes("rack")) {
    return "cabinets";
  }

  if (normalized.includes("table") || normalized.includes("desk")) {
    return "tables";
  }

  if (normalized.includes("tray") || normalized.includes("object")) {
    return "objects";
  }

  return "all";
}

export function getPiecePortfolioCategory(piece: Pick<PieceRecord, "category">): PortfolioCategoryKey {
  return normalizePortfolioCategory(piece.category);
}

export function getDisplayMediaPaths(piece: Pick<PieceRecord, "mediaPaths" | "metadata" | "status">) {
  const preferredLimit = Number(piece.metadata?.publicMediaLimit ?? (piece.status === "inventory" ? 5 : 4));
  const safeLimit = Number.isFinite(preferredLimit) ? Math.max(1, Math.min(12, Math.round(preferredLimit))) : 4;
  return piece.mediaPaths.slice(0, safeLimit);
}

export function hasVerifiedMedia(piece: Pick<PieceRecord, "mediaPaths" | "metadata">) {
  if (piece.mediaPaths.length === 0) {
    return false;
  }

  return piece.metadata?.verifiedMedia !== false;
}

export function pieceShippingEnabled(piece: Pick<PieceRecord, "metadata">) {
  return Boolean(piece.metadata?.shippingEnabled || piece.metadata?.shipEligible || piece.metadata?.shippingAllowed);
}

export function getWoodshopZip(metadata?: Record<string, unknown>) {
  const value = metadata?.woodshopZip ?? metadata?.shopZip ?? metadata?.originZip;
  return typeof value === "string" && value.trim() ? value.trim() : "94122";
}

export function getPickupRadiusMiles(metadata?: Record<string, unknown>) {
  const value = Number(metadata?.pickupRadiusMiles ?? metadata?.dropoffRadiusMiles ?? 120);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 120;
}

export function getFulfillmentOptions(piece: Pick<PieceRecord, "metadata" | "status">) {
  const stored = piece.metadata?.fulfillmentOptions;
  if (Array.isArray(stored) && stored.some((value) => typeof value === "string" && value.trim().length > 0)) {
    return stored.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  const zip = getWoodshopZip(piece.metadata);
  const radius = getPickupRadiusMiles(piece.metadata);
  const local = [`Pickup near ${zip}`, `Drop-off review within ~${radius} miles`];

  if (pieceShippingEnabled(piece)) {
    return [...local, "Shipping enabled for this piece"];
  }

  if (piece.status === "inventory") {
    return [...local, "Shipping disabled unless separately approved"];
  }

  return ["Built to order", ...local, "Shipping only if enabled during review"];
}

export function getFulfillmentSummary(piece: Pick<PieceRecord, "metadata" | "status">) {
  const zip = getWoodshopZip(piece.metadata);
  const radius = getPickupRadiusMiles(piece.metadata);
  return pieceShippingEnabled(piece)
    ? `Pickup near ${zip}, local drop-off review within ~${radius} miles, or shipping when confirmed for this piece.`
    : `Default: in-person pickup near ${zip} or local drop-off review within ~${radius} miles. Shipping is not enabled for this piece unless separately approved.`;
}
