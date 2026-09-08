import { normalizeNotificationAddresses } from "./notification-routing.ts";
import { WEBSITE_INQUIRY_INTENTS, WEBSITE_INQUIRY_TOPICS, type WebsiteInquiry } from "./website-inquiry.ts";

export const CONDITIONAL_NOTIFICATION_TYPES = ["customer_inquiry_admin", "commission_submitted"] as const;
export const CONDITIONAL_DIMENSIONS = {
  intent: WEBSITE_INQUIRY_INTENTS,
  topic: WEBSITE_INQUIRY_TOPICS,
  sourceSurface: ["about", "contact", "portfolio", "shop", "commission-planner"],
  channel: ["inquiry", "commission"],
  pieceAvailability: ["no-piece", "available", "reference-only"]
} as const;
export type ConditionalContext = Pick<WebsiteInquiry, "intent" | "topic" | "sourceSurface" | "sourceRoute" | "channel"> & {
  pieceSlug: string;
  pieceAvailability: typeof CONDITIONAL_DIMENSIONS.pieceAvailability[number];
};
export type ConditionalRule = {
  id: string;
  name: string;
  enabled: boolean;
  category: "" | typeof CONDITIONAL_NOTIFICATION_TYPES[number];
  conditions: Partial<ConditionalContext>;
  bccRecipients: string[];
};
export type ConditionalRoutingRecord = { rules: ConditionalRule[]; updatedAt: string };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeConditionalRules(value: unknown): ConditionalRule[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Use at most 20 conditional rules.");
  const ids = new Set<string>();
  return value.map((rule, index) => {
    const label = `Rule ${index + 1}`;
    if (!object(rule) || Object.keys(rule).some(key => !["id", "name", "enabled", "category", "conditions", "bccRecipients"].includes(key))) throw new Error(`${label} contains unsupported fields.`);
    if (typeof rule.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(rule.id) || ids.has(rule.id)) throw new Error(`${label} needs a unique identifier.`);
    ids.add(rule.id);
    if (typeof rule.name !== "string" || !rule.name.trim() || rule.name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(rule.name)) throw new Error(`${label} needs a name of at most 80 characters.`);
    if (typeof rule.enabled !== "boolean") throw new Error(`${label} needs an enabled state.`);
    if (rule.category !== "" && !(CONDITIONAL_NOTIFICATION_TYPES as readonly unknown[]).includes(rule.category)) throw new Error(`${label} has an unsupported notification type.`);
    if (!object(rule.conditions)) throw new Error(`${label} needs conditions.`);
    const conditions: Record<string, string> = {};
    // Fixed key order makes equivalent input/replays deterministic.
    const keys = [...Object.keys(CONDITIONAL_DIMENSIONS), "sourceRoute", "pieceSlug"];
    if (Object.keys(rule.conditions).some(key => !keys.includes(key))) throw new Error(`${label} has an unsupported condition.`);
    for (const key of keys) {
      const raw = rule.conditions[key];
      if (raw === undefined || raw === "") continue;
      if (typeof raw !== "string") throw new Error(`${label}: ${key} must be text.`);
      const candidate = raw.trim();
      if (key in CONDITIONAL_DIMENSIONS) {
        if (!(CONDITIONAL_DIMENSIONS[key as keyof typeof CONDITIONAL_DIMENSIONS] as readonly string[]).includes(candidate)) throw new Error(`${label}: invalid ${key}.`);
      } else if (key === "sourceRoute") {
        if (candidate.length > 256 || !/^\/(?:about|contact|shop|portfolio(?:\/[a-z0-9-]+)?|commissions)$/.test(candidate)) throw new Error(`${label}: use a supported website source route without a query or fragment.`);
      } else if (!/^[a-z0-9-]{1,120}$/.test(candidate)) throw new Error(`${label}: use a canonical piece slug.`);
      conditions[key] = candidate;
    }
    if (!Object.keys(conditions).length) throw new Error(`${label} needs at least one condition. Use global or per-Type forwarding for unconditional copies.`);
    if (!Array.isArray(rule.bccRecipients) || rule.bccRecipients.some(address => typeof address !== "string" || address.length > 8000)) throw new Error(`${label} needs a bounded recipient list.`);
    const bccRecipients = normalizeNotificationAddresses(rule.bccRecipients, `${label} BCC`);
    if (!bccRecipients.length) throw new Error(`${label} needs at least one BCC recipient. Remove the rule to clear its copies.`);
    return { id: rule.id, name: rule.name.trim(), enabled: rule.enabled, category: rule.category as ConditionalRule["category"], conditions, bccRecipients };
  });
}

// Called only with persisted, server-normalized B1 data. Never derives facts
// from template variables, free text, browser labels, or security tokens.
export function conditionalContextFromInquiry(inquiry: WebsiteInquiry): ConditionalContext {
  return {
    intent: inquiry.intent, topic: inquiry.topic, sourceSurface: inquiry.sourceSurface,
    sourceRoute: inquiry.sourceRoute, channel: inquiry.channel,
    pieceSlug: inquiry.piece?.slug ?? "",
    pieceAvailability: !inquiry.piece ? "no-piece" : inquiry.piece.status === "inventory" && inquiry.piece.inquiryMode === "exact-piece" && inquiry.piece.inventoryCount > 0 ? "available" : "reference-only"
  };
}

export function matchConditionalRules(rules: readonly ConditionalRule[], category: string, context?: ConditionalContext | null) {
  if (!context || !(CONDITIONAL_NOTIFICATION_TYPES as readonly string[]).includes(category)) return { ruleNames: [], bccRecipients: [] };
  const matches = rules.filter(rule => rule.enabled && (!rule.category || rule.category === category)
    && Object.entries(rule.conditions).every(([key, value]) => context[key as keyof ConditionalContext] === value));
  return { ruleNames: matches.map(rule => rule.name), bccRecipients: [...new Set(matches.flatMap(rule => rule.bccRecipients))] };
}
