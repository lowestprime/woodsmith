import { getPieceInquiryMode, pieceAllowsInquiry, type PiecePolicySource } from "./piece-model.ts";

export const WEBSITE_INQUIRY_INTENTS = ["general-inquiry", "purchase-interest", "price-availability", "commission-similar", "custom-commission"] as const;
export type WebsiteInquiryIntent = typeof WEBSITE_INQUIRY_INTENTS[number];
export const WEBSITE_INQUIRY_TOPICS = ["general", "piece", "custom-work", "delivery", "care-repair"] as const;
export type InquiryPiece = PiecePolicySource & { slug: string; title: string };
export type WebsiteInquiry = {
  customerName: string;
  customerEmail: string;
  topic: typeof WEBSITE_INQUIRY_TOPICS[number];
  intent: WebsiteInquiryIntent;
  message: string;
  piece: { slug: string; title: string; availability: string; status: string; inquiryMode: string; inventoryCount: number } | null;
  reference: string;
  sourceRoute: string;
  sourceSurface: "about" | "contact" | "portfolio" | "shop" | "commission-planner";
  channel: "inquiry" | "commission";
  plannerContext: Record<string, unknown>;
};

function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const normalized = value.normalize("NFKC").trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max || /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)) throw new Error(`${label} is too long or contains invalid characters.`);
  return normalized;
}

export function pieceInquiryIntents(piece: InquiryPiece): WebsiteInquiryIntent[] {
  if (!pieceAllowsInquiry(piece) || piece.publicationStatus !== "published") return [];
  const exact = piece.status === "inventory" && getPieceInquiryMode(piece) === "exact-piece" && Number(piece.inventoryCount ?? 0) > 0;
  return exact ? ["purchase-interest", "price-availability", "commission-similar"] : ["commission-similar", "general-inquiry"];
}

export function inquiryContextUrl(piece: InquiryPiece, intent: WebsiteInquiryIntent, sourceRoute: string) {
  const params = new URLSearchParams({ piece: piece.slug, intent, source: sourceRoute });
  return `/contact?${params.toString()}`;
}

export function normalizeWebsiteInquiry(input: Record<string, unknown>, options: { channel: WebsiteInquiry["channel"]; piece?: InquiryPiece | null; plannerContext?: Record<string, unknown> }): WebsiteInquiry {
  const customerName = text(input.customerName, "Your name", 120, true);
  const customerEmail = text(input.email, "Email", 254, true).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(customerEmail) || /[\r\n]/.test(customerEmail)) throw new Error("Enter a valid email address.");
  const message = text(input.message || input.brief, "Message", 20_000, true);
  // The planner's legacy reference field also accepts names and external URLs.
  // Only an explicit pieceSlug or a server-resolved reference asserts identity.
  const requestedSlug = text(input.pieceSlug || (options.channel === "commission" ? options.piece?.slug : input.referencePieceSlug), "Piece reference", 120);
  const piece = options.piece ?? null;
  if (requestedSlug && (!piece || piece.slug !== requestedSlug || !pieceAllowsInquiry(piece) || piece.publicationStatus !== "published")) throw new Error("This piece is not currently accepting inquiries. Choose a general inquiry instead.");
  let intent = text(input.intent, "Inquiry intent", 40) || (piece ? pieceInquiryIntents(piece)[0] : "general-inquiry");
  if (options.channel === "commission") intent = "custom-commission";
  if (!(WEBSITE_INQUIRY_INTENTS as readonly string[]).includes(intent)) throw new Error("Choose a valid inquiry intent.");
  if (options.channel === "inquiry" && piece && !pieceInquiryIntents(piece).includes(intent as WebsiteInquiryIntent)) throw new Error("That inquiry option is no longer available for this piece.");
  if (!piece && ["purchase-interest", "price-availability", "commission-similar"].includes(intent)) throw new Error("Choose a piece for this inquiry, or select a general question.");
  const topic = text(input.topic, "Inquiry topic", 32) || (piece ? "piece" : options.channel === "commission" ? "custom-work" : "general");
  if (!(WEBSITE_INQUIRY_TOPICS as readonly string[]).includes(topic)) throw new Error("Choose a valid inquiry topic.");
  const route = options.channel === "commission" ? "/commissions" : text(input.sourceRoute, "Source route", 256) || "/contact";
  if (!/^\/(?:about|contact|shop|portfolio(?:\/[a-z0-9-]+)?|commissions)$/.test(route)) throw new Error("The inquiry source route is invalid.");
  const sourceSurface = options.channel === "commission" ? "commission-planner" : route.startsWith("/portfolio") ? "portfolio" : route === "/shop" ? "shop" : route === "/about" ? "about" : "contact";
  return {
    customerName, customerEmail, topic: topic as WebsiteInquiry["topic"], intent: intent as WebsiteInquiryIntent, message,
    piece: piece ? { slug: piece.slug, title: piece.title, availability: piece.availabilityLabel || "Contact the woodshop", status: piece.status, inquiryMode: getPieceInquiryMode(piece), inventoryCount: Number(piece.inventoryCount ?? 0) } : null,
    reference: text(input.pieceReference || (options.channel === "commission" ? input.referencePieceSlug : ""), "Optional piece or project reference", options.channel === "commission" ? 2048 : 120), sourceRoute: route, sourceSurface,
    channel: options.channel, plannerContext: options.plannerContext ?? {}
  };
}

export type InquiryClassification = { disposition: "legitimate" | "quarantine"; version: 1; signals: string[] };

export function classifyWebsiteInquiry(message: string): InquiryClassification {
  const normalized = message.normalize("NFKC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ");
  const signals: string[] = [];
  const offer = /\b(?:we|i|our (?:team|agency))\b.{0,65}\b(?:offer|provide|speciali[sz]e|can help|help businesses|would like to offer|deliver)\b/.test(normalized);
  const service = /\b(?:seo services|search engine optimi[sz]ation|backlinks?|link[- ]building|guest[- ]post(?:ing|s)?|digital marketing services|web(?:site)? (?:design|development) services)\b/.test(normalized);
  const sales = /\b(?:free (?:seo |website )?audit|our (?:packages|services|agency)|pricing (?:plans|packages)|increase (?:your )?(?:rankings|traffic)|rank (?:your (?:site|website)|higher)|first page (?:of|on) google|boost (?:your )?(?:rankings|traffic)|schedule (?:a |an )?(?:call|demo)|book a (?:call|demo))\b/.test(normalized);
  const linkPitch = /\b(?:buy|sell|selling|offering|paid|dofollow)\b.{0,45}\b(?:backlinks?|guest posts?|link placements?)\b/.test(normalized) && /\b(?:domain authority|da\s?\d{2}|dr\s?\d{2}|high[- ]authority|rates|price list|bulk|packages)\b/.test(normalized);
  if (offer) signals.push("service-offer");
  if (service) signals.push("seo-or-marketing-service");
  if (sales) signals.push("solicitation-call-to-action");
  if (linkPitch) signals.push("paid-link-placement-pitch");
  return { disposition: (offer && service && sales) || linkPitch ? "quarantine" : "legitimate", version: 1, signals };
}

export const INQUIRY_INTENT_LABELS: Record<WebsiteInquiryIntent, string> = {
  "general-inquiry": "General inquiry", "purchase-interest": "Interested in purchasing", "price-availability": "Ask price / availability", "commission-similar": "Commission something similar", "custom-commission": "Custom commission"
};
