import type { FooterConfiguration, FooterGroupDefinition, FooterItemDefinition, HomeServiceDefinition } from "./seed.ts";

function text(value: unknown, label: string, maxLength = 240) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters.`);
  return normalized;
}

function optionalText(value: unknown, maxLength = 800) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxLength) throw new Error(`Content exceeds ${maxLength} characters.`);
  return normalized;
}

function identifier(value: unknown, fallback: string) {
  const normalized = String(value ?? fallback).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return normalized || fallback;
}

function order(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(9999, Math.round(parsed))) : fallback;
}

export function normalizeSiteLink(value: unknown, type: FooterItemDefinition["type"] | "service") {
  const candidate = String(value ?? "").trim();
  if (type === "text") return "";
  if (!candidate) throw new Error("A destination is required for each linked item.");
  if ((type === "internal-link" || type === "service") && candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  if (type === "email") {
    const email = candidate.replace(/^mailto:/i, "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `mailto:${email}`;
    throw new Error("Email links must contain a valid email address.");
  }
  if (type === "external-link" || type === "service") {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Report one consistent validation message below.
    }
  }
  throw new Error("Links must use a site-relative path, http(s) URL, or valid email destination.");
}

function normalizeFooterItem(value: unknown, index: number): FooterItemDefinition {
  if (!value || typeof value !== "object") throw new Error("Each footer item must be a valid object.");
  const record = value as Record<string, unknown>;
  const type = ["text", "internal-link", "external-link", "email"].includes(String(record.type))
    ? String(record.type) as FooterItemDefinition["type"]
    : "text";
  return {
    id: identifier(record.id, `item-${index + 1}`),
    label: text(record.label, "Footer item label", 80),
    value: text(record.value, "Footer item value", 240),
    url: normalizeSiteLink(record.url || (type === "email" ? record.value : ""), type),
    type,
    visible: record.visible !== false,
    newTab: type === "external-link" && record.newTab === true,
    order: order(record.order, index * 10)
  };
}

function normalizeFooterGroup(value: unknown, index: number): FooterGroupDefinition {
  if (!value || typeof value !== "object") throw new Error("Each footer group must be a valid object.");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) throw new Error("Each footer group needs an item list.");
  if (record.items.length > 24) throw new Error("A footer group cannot contain more than 24 items.");
  const items = record.items.map(normalizeFooterItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Footer item identifiers must be unique within a group.");
  return {
    id: identifier(record.id, `group-${index + 1}`),
    heading: text(record.heading, "Footer group heading", 80),
    visible: record.visible !== false,
    order: order(record.order, index * 10),
    items: items.sort((left, right) => left.order - right.order)
  };
}

export function normalizeFooterConfiguration(value: unknown): FooterConfiguration {
  if (!value || typeof value !== "object") throw new Error("Footer configuration is missing.");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.groups) || record.groups.length === 0) throw new Error("Add at least one footer group.");
  if (record.groups.length > 12) throw new Error("The footer cannot contain more than 12 groups.");
  const groups = record.groups.map(normalizeFooterGroup);
  if (new Set(groups.map((group) => group.id)).size !== groups.length) throw new Error("Footer group identifiers must be unique.");
  return {
    introHeading: text(record.introHeading, "Footer heading", 100),
    introBody: optionalText(record.introBody, 600),
    groups: groups.sort((left, right) => left.order - right.order)
  };
}

export function normalizeHomeServices(value: unknown): HomeServiceDefinition[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Add at least one homepage service.");
  if (value.length > 12) throw new Error("The homepage cannot contain more than 12 service links.");
  const services = value.map((entry, index): HomeServiceDefinition => {
    if (!entry || typeof entry !== "object") throw new Error("Each homepage service must be a valid object.");
    const record = entry as Record<string, unknown>;
    return {
      id: identifier(record.id, `service-${index + 1}`),
      title: text(record.title, "Service title", 100),
      body: optionalText(record.body, 500),
      href: normalizeSiteLink(record.href, "service"),
      linkLabel: text(record.linkLabel, "Service link label", 100),
      visible: record.visible !== false,
      order: order(record.order, index * 10)
    };
  });
  if (new Set(services.map((service) => service.id)).size !== services.length) throw new Error("Homepage service identifiers must be unique.");
  return services.sort((left, right) => left.order - right.order);
}

export function safeFooterConfiguration(value: unknown, fallback: FooterConfiguration) {
  try {
    return normalizeFooterConfiguration(value);
  } catch {
    return fallback;
  }
}

export function safeHomeServices(value: unknown, fallback: HomeServiceDefinition[]) {
  try {
    return normalizeHomeServices(value);
  } catch {
    return fallback;
  }
}
