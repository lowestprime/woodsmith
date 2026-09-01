export type InlineEditResource =
  | "settings"
  | "homeSection"
  | "homeService"
  | "page"
  | "piece"
  | "post"
  | "user"
  | "category"
  | "commissionType"
  | "project";

export type InlineEditMode = "update" | "add" | "cut" | "move";
export type InlineEditKind =
  | "text"
  | "multiline"
  | "rich-text"
  | "url"
  | "email"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "enum"
  | "list"
  | "link-list"
  | "media-relation"
  | "relation";

export type InlineEditPatchInput = {
  resource?: unknown;
  id?: unknown;
  field?: unknown;
  index?: unknown;
  toIndex?: unknown;
  value?: unknown;
  expectedValue?: unknown;
  mode?: unknown;
};

export type InlineEditDefinition = {
  resource: InlineEditResource;
  field: string;
  kind: InlineEditKind;
  label: string;
  required?: boolean;
  nullable?: boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  values?: readonly string[];
  modes?: readonly InlineEditMode[];
};

export type ValidatedInlineEditPatch = {
  resource: InlineEditResource;
  id: string;
  field: string;
  index: number | null;
  toIndex: number | null;
  value: string | number | boolean | null | string[] | { label: string; url: string } | Array<{ label: string; url: string }>;
  expectedValue?: string;
  mode: InlineEditMode;
  definition: InlineEditDefinition;
};

const allModes = ["update", "add", "cut", "move"] as const;
const updateOnly = ["update"] as const;
const listModes = allModes;

function definitions(resource: InlineEditResource, entries: Array<Omit<InlineEditDefinition, "resource">>) {
  return entries.map((entry) => ({ resource, ...entry }));
}

export const INLINE_EDIT_DEFINITIONS: readonly InlineEditDefinition[] = [
  ...definitions("settings", [
    { field: "brandName", kind: "text", label: "Brand name", required: true, maxLength: 100, modes: updateOnly },
    { field: "brandTagline", kind: "multiline", label: "Brand description", required: true, maxLength: 300, modes: updateOnly },
    { field: "siteAnnouncement", kind: "multiline", label: "Site announcement", nullable: true, maxLength: 500, modes: updateOnly },
    { field: "builderName", kind: "text", label: "Builder name", required: true, maxLength: 100, modes: updateOnly },
    { field: "builderHeadline", kind: "text", label: "Builder title", nullable: true, maxLength: 120, modes: updateOnly },
    { field: "builderEmail", kind: "email", label: "Builder email", required: true, modes: updateOnly },
    { field: "developerName", kind: "text", label: "Developer name", required: true, maxLength: 100, modes: updateOnly },
    { field: "developerHeadline", kind: "text", label: "Developer title", nullable: true, maxLength: 120, modes: updateOnly },
    { field: "developerEmail", kind: "email", label: "Developer email", required: true, modes: updateOnly },
    { field: "supportEmail", kind: "email", label: "Support email", required: true, modes: updateOnly },
    { field: "notificationForwardEmail", kind: "email", label: "Notification forwarding email", nullable: true, modes: updateOnly },
    { field: "repoLabel", kind: "text", label: "Repository label", nullable: true, maxLength: 100, modes: updateOnly },
    { field: "repoUrl", kind: "url", label: "Repository URL", nullable: true, modes: updateOnly },
    { field: "navigation", kind: "link-list", label: "Navigation item", required: true, maxLength: 80, modes: listModes },
    { field: "navigation.href", kind: "url", label: "Navigation destination", required: true, modes: updateOnly },
    { field: "socialLinks", kind: "link-list", label: "Social link", maxLength: 80, modes: listModes },
    { field: "socialLinks.url", kind: "url", label: "Social-link destination", nullable: true, modes: updateOnly },
    { field: "footer.introHeading", kind: "text", label: "Footer heading", required: true, maxLength: 100, modes: updateOnly },
    { field: "footer.introBody", kind: "multiline", label: "Footer introduction", required: true, maxLength: 500, modes: updateOnly },
    { field: "footer.group.heading", kind: "text", label: "Footer group heading", required: true, maxLength: 80, modes: updateOnly },
    { field: "footer.group.visible", kind: "boolean", label: "Footer group visibility", modes: updateOnly },
    { field: "footer.group.order", kind: "number", label: "Footer group order", minimum: 0, maximum: 999, modes: updateOnly },
    { field: "footer.item.label", kind: "text", label: "Footer item label", required: true, maxLength: 80, modes: updateOnly },
    { field: "footer.item.value", kind: "text", label: "Footer item value", nullable: true, maxLength: 240, modes: updateOnly },
    { field: "footer.item.url", kind: "url", label: "Footer item destination", nullable: true, modes: updateOnly },
    { field: "footer.item.type", kind: "enum", label: "Footer item type", values: ["text", "internal-link", "external-link", "email"], modes: updateOnly },
    { field: "footer.item.visible", kind: "boolean", label: "Footer item visibility", modes: updateOnly },
    { field: "footer.item.newTab", kind: "boolean", label: "Open footer item in a new tab", modes: updateOnly },
    { field: "footer.item.order", kind: "number", label: "Footer item order", minimum: 0, maximum: 999, modes: updateOnly }
  ]),
  ...definitions("homeSection", [
    { field: "eyebrow", kind: "text", label: "Section eyebrow", nullable: true, maxLength: 120, modes: updateOnly },
    { field: "title", kind: "text", label: "Section title", required: true, maxLength: 220, modes: updateOnly },
    { field: "copy", kind: "multiline", label: "Section copy", nullable: true, maxLength: 1000, modes: updateOnly },
    { field: "primaryCta.label", kind: "text", label: "Primary action label", required: true, maxLength: 80, modes: updateOnly },
    { field: "primaryCta.href", kind: "url", label: "Primary action destination", required: true, modes: updateOnly },
    { field: "secondaryCta.label", kind: "text", label: "Secondary action label", required: true, maxLength: 80, modes: updateOnly },
    { field: "secondaryCta.href", kind: "url", label: "Secondary action destination", required: true, modes: updateOnly }
  ]),
  ...definitions("homeService", [
    { field: "title", kind: "text", label: "Service title", required: true, maxLength: 100, modes: updateOnly },
    { field: "body", kind: "multiline", label: "Service description", required: true, maxLength: 500, modes: updateOnly },
    { field: "href", kind: "url", label: "Service destination", required: true, modes: updateOnly },
    { field: "linkLabel", kind: "text", label: "Service action label", required: true, maxLength: 80, modes: updateOnly },
    { field: "visible", kind: "boolean", label: "Service visibility", modes: updateOnly },
    { field: "order", kind: "number", label: "Service order", minimum: 0, maximum: 999, modes: updateOnly }
  ]),
  ...definitions("page", [
    { field: "title", kind: "text", label: "Page title", required: true, maxLength: 200, modes: updateOnly },
    { field: "navLabel", kind: "text", label: "Navigation label", required: true, maxLength: 80, modes: updateOnly },
    { field: "intro", kind: "multiline", label: "Page introduction", nullable: true, maxLength: 2000, modes: updateOnly },
    { field: "body", kind: "rich-text", label: "Page body", nullable: true, maxLength: 50000, modes: updateOnly },
    { field: "layout", kind: "enum", label: "Page layout", values: ["document", "redirect"], modes: updateOnly },
    { field: "heroMediaPath", kind: "media-relation", label: "Hero media", nullable: true, modes: updateOnly },
    { field: "status", kind: "enum", label: "Publication state", values: ["published", "draft", "archived"], modes: updateOnly }
  ]),
  ...definitions("piece", [
    { field: "title", kind: "text", label: "Piece title", required: true, maxLength: 200, modes: updateOnly },
    { field: "subtitle", kind: "text", label: "Piece subtitle", nullable: true, maxLength: 240, modes: updateOnly },
    { field: "category", kind: "relation", label: "Piece category", required: true, modes: updateOnly },
    { field: "status", kind: "enum", label: "Piece status", values: ["inventory", "commission", "archive"], modes: updateOnly },
    { field: "publicationStatus", kind: "enum", label: "Publication state", values: ["published", "draft", "archived"], modes: updateOnly },
    { field: "availabilityLabel", kind: "text", label: "Availability", nullable: true, maxLength: 160, modes: updateOnly },
    { field: "summary", kind: "multiline", label: "Piece summary", nullable: true, maxLength: 2000, modes: updateOnly },
    { field: "story", kind: "rich-text", label: "Piece story", nullable: true, maxLength: 50000, modes: updateOnly },
    { field: "details", kind: "list", label: "Piece detail", maxLength: 500, modes: listModes },
    { field: "materials", kind: "list", label: "Material", maxLength: 120, modes: listModes },
    { field: "tags", kind: "list", label: "Tag", maxLength: 80, modes: listModes },
    { field: "mediaPaths", kind: "media-relation", label: "Piece media", nullable: true, modes: listModes },
    { field: "priceCents", kind: "currency", label: "Asking price", nullable: true, minimum: 0, maximum: 100000000, modes: updateOnly },
    { field: "priceMode", kind: "enum", label: "Price mode", values: ["fixed", "contact-for-price", "determined-after-approval", "not-listed"], modes: updateOnly },
    { field: "publicPriceLabel", kind: "text", label: "Public price label", nullable: true, maxLength: 120, modes: updateOnly },
    { field: "internalEstimateCents", kind: "currency", label: "Internal estimate", nullable: true, minimum: 0, maximum: 100000000, modes: updateOnly },
    { field: "inquiryMode", kind: "enum", label: "Inquiry mode", values: ["disabled", "exact-piece", "custom-pattern", "related-commission"], modes: updateOnly },
    { field: "reviewsMode", kind: "enum", label: "Review mode", values: ["hidden", "display-only", "display-and-accept"], modes: updateOnly },
    { field: "inventoryCount", kind: "number", label: "Inventory count", minimum: 0, maximum: 10000, modes: updateOnly },
    { field: "leadTimeDays", kind: "number", label: "Lead time", minimum: 0, maximum: 3650, modes: updateOnly },
    { field: "featuredRank", kind: "number", label: "Featured order", minimum: 0, maximum: 9999, modes: updateOnly },
    { field: "commissionTypeSlug", kind: "relation", label: "Commission type", nullable: true, modes: updateOnly },
    { field: "visualizerTemplate", kind: "relation", label: "Visualizer template", nullable: true, modes: updateOnly },
    { field: "processSectionTitle", kind: "text", label: "Process section title", nullable: true, maxLength: 160, modes: updateOnly },
    { field: "processSectionIntro", kind: "multiline", label: "Process section introduction", nullable: true, maxLength: 1000, modes: updateOnly }
  ]),
  ...definitions("post", [
    { field: "title", kind: "text", label: "Process title", required: true, maxLength: 200, modes: updateOnly },
    { field: "excerpt", kind: "multiline", label: "Process excerpt", nullable: true, maxLength: 2000, modes: updateOnly },
    { field: "body", kind: "rich-text", label: "Process body", nullable: true, maxLength: 50000, modes: updateOnly },
    { field: "sourceLabel", kind: "text", label: "Source label", nullable: true, maxLength: 160, modes: updateOnly },
    { field: "sourceUrl", kind: "url", label: "Source URL", nullable: true, modes: updateOnly },
    { field: "coverMediaPath", kind: "media-relation", label: "Cover media", nullable: true, modes: updateOnly },
    { field: "tags", kind: "list", label: "Process tag", maxLength: 80, modes: listModes },
    { field: "publicationStatus", kind: "enum", label: "Publication state", values: ["published", "draft", "archived"], modes: updateOnly },
    { field: "publishedAt", kind: "date", label: "Published date", nullable: true, modes: updateOnly }
  ]),
  ...definitions("user", [
    { field: "displayName", kind: "text", label: "Profile name", required: true, maxLength: 120, modes: updateOnly },
    { field: "headline", kind: "text", label: "Profile title", nullable: true, maxLength: 160, modes: updateOnly },
    { field: "bio", kind: "rich-text", label: "Profile biography", nullable: true, maxLength: 10000, modes: updateOnly },
    { field: "publicProfile", kind: "boolean", label: "Public profile", modes: updateOnly },
    { field: "avatarPath", kind: "media-relation", label: "Profile image", nullable: true, modes: updateOnly },
    { field: "links", kind: "link-list", label: "Profile link", maxLength: 120, modes: listModes }
  ]),
  ...definitions("category", [
    { field: "label", kind: "text", label: "Category label", required: true, maxLength: 80, modes: updateOnly },
    { field: "aliases", kind: "list", label: "Category alias", maxLength: 80, modes: listModes },
    { field: "icon", kind: "relation", label: "Category icon", required: true, modes: updateOnly },
    { field: "customIconSvg", kind: "multiline", label: "Custom category icon", nullable: true, maxLength: 8000, modes: updateOnly },
    { field: "sortOrder", kind: "number", label: "Category order", minimum: 0, maximum: 999, modes: updateOnly },
    { field: "visible", kind: "boolean", label: "Category visibility", modes: updateOnly }
  ]),
  ...definitions("commissionType", [
    { field: "label", kind: "text", label: "Commission type label", required: true, maxLength: 120, modes: updateOnly },
    { field: "description", kind: "multiline", label: "Commission type description", nullable: true, maxLength: 2000, modes: updateOnly },
    { field: "baseLaborHours", kind: "number", label: "Base labor hours", minimum: 0, maximum: 10000, modes: updateOnly },
    { field: "baseMarkupPercent", kind: "number", label: "Base markup", minimum: 0, maximum: 500, modes: updateOnly },
    { field: "materialOptions", kind: "list", label: "Allowed material", maxLength: 120, modes: listModes },
    { field: "active", kind: "boolean", label: "Commission type enabled", modes: updateOnly }
  ]),
  ...definitions("project", [
    { field: "status", kind: "text", label: "Project status", required: true, maxLength: 120, modes: updateOnly },
    { field: "stage", kind: "text", label: "Project stage", required: true, maxLength: 120, modes: updateOnly },
    { field: "publicNotes", kind: "multiline", label: "Buyer-visible project notes", nullable: true, maxLength: 5000, modes: updateOnly },
    { field: "leadTimeDays", kind: "number", label: "Project lead time", nullable: true, minimum: 0, maximum: 3650, modes: updateOnly }
  ])
] as const;

const registry = new Map(INLINE_EDIT_DEFINITIONS.map((definition) => [`${definition.resource}:${definition.field}`, definition]));

export function getInlineEditDefinition(resource: string, field: string) {
  return registry.get(`${resource}:${field}`) ?? null;
}

export function normalizeInlineEditUrl(value: unknown, nullable = false) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed && nullable) return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("mailto:")) {
    const address = trimmed.slice(7).split("?")[0] ?? "";
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return trimmed;
    throw new Error("mailto: links must contain a valid email address.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter an http, https, mailto, or root-relative /path URL.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("URL scheme is not allowed.");
  return parsed.toString();
}

function integer(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer.`);
  return parsed;
}

function cleanString(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function normalizeMediaPath(value: unknown, nullable: boolean) {
  const path = cleanString(value).replace(/\\/g, "/");
  if (!path && nullable) return "";
  if (!path || path.startsWith("/") || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Media selections must use a safe library-relative path.");
  }
  return path;
}

function parseStringList(value: unknown, maxLength: number) {
  const source = Array.isArray(value) ? value : cleanString(value).split(/\r?\n|,/g);
  const values = source.map(cleanString).filter(Boolean);
  if (values.some((entry) => entry.length > maxLength)) throw new Error(`List items may not exceed ${maxLength} characters.`);
  return [...new Set(values)];
}

function parseLinks(value: unknown, maxLength: number) {
  let source: unknown = value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try { source = JSON.parse(value); } catch { throw new Error("Link-list JSON is invalid."); }
  }
  if (!Array.isArray(source)) throw new Error("A complete link-list update must be an array.");
  return source.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Each link must contain a label and URL.");
    const record = entry as Record<string, unknown>;
    const label = cleanString(record.label);
    if (!label || label.length > maxLength) throw new Error(`Link labels must be 1-${maxLength} characters.`);
    return { label, url: normalizeInlineEditUrl(record.url ?? record.href ?? "", true) };
  });
}

function normalizedValue(definition: InlineEditDefinition, patch: InlineEditPatchInput, mode: InlineEditMode) {
  if (mode === "cut" || mode === "move") return "";
  const raw = patch.value;
  if (definition.kind === "boolean") {
    if (typeof raw === "boolean") return raw;
    const value = cleanString(raw).toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    throw new Error(`${definition.label} must be true or false.`);
  }
  if (definition.kind === "number" || definition.kind === "currency") {
    if (cleanString(raw) === "" && definition.nullable) return null;
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${definition.label} must be a number.`);
    const normalized = definition.kind === "currency" ? Math.round(number) : number;
    if (definition.minimum != null && normalized < definition.minimum) throw new Error(`${definition.label} must be at least ${definition.minimum}.`);
    if (definition.maximum != null && normalized > definition.maximum) throw new Error(`${definition.label} must not exceed ${definition.maximum}.`);
    return normalized;
  }
  if (definition.kind === "list") return parseStringList(raw, definition.maxLength ?? 500);
  if (definition.kind === "link-list") {
    if (mode === "update" && patch.index == null) return parseLinks(raw, definition.maxLength ?? 120);
    if (raw && typeof raw === "object") return parseLinks([raw], definition.maxLength ?? 120)[0];
  }
  if (definition.kind === "url") return normalizeInlineEditUrl(raw, Boolean(definition.nullable));
  if (definition.kind === "email") {
    const value = cleanString(raw).toLowerCase();
    if (!value && definition.nullable) return "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new Error(`${definition.label} must be a valid email address.`);
    return value;
  }
  if (definition.kind === "media-relation") {
    if (mode === "update" && patch.index == null && Array.isArray(raw)) return raw.map((entry) => normalizeMediaPath(entry, false));
    return normalizeMediaPath(raw, Boolean(definition.nullable));
  }
  if (definition.kind === "date") {
    const value = cleanString(raw);
    if (!value && definition.nullable) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${definition.label} must be a valid date.`);
    return date.toISOString();
  }
  const value = cleanString(raw);
  if (!value && definition.required) throw new Error(`${definition.label} cannot be empty.`);
  if (!value && !definition.nullable && mode !== "add") throw new Error(`${definition.label} cannot be empty.`);
  if (definition.maxLength != null && value.length > definition.maxLength) throw new Error(`${definition.label} may not exceed ${definition.maxLength} characters.`);
  if (definition.kind === "enum" && !definition.values?.includes(value)) throw new Error(`${definition.label} has an unsupported value.`);
  if (definition.kind === "relation" && value && !/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,199}$/.test(value)) throw new Error(`${definition.label} contains unsupported characters.`);
  return value;
}

export function validateInlineEditPatch(input: InlineEditPatchInput): ValidatedInlineEditPatch {
  const resource = cleanString(input.resource);
  const field = cleanString(input.field);
  const id = cleanString(input.id);
  const definition = getInlineEditDefinition(resource, field);
  if (!definition) throw new Error(`Field '${resource}.${field}' is not inline editable.`);
  const mode = (["add", "cut", "move"].includes(cleanString(input.mode)) ? cleanString(input.mode) : "update") as InlineEditMode;
  if (!(definition.modes ?? updateOnly).includes(mode)) throw new Error(`${definition.label} does not support '${mode}'.`);
  const index = input.index == null || input.index === "" ? null : integer(input.index, "Item index");
  const toIndex = input.toIndex == null || input.toIndex === "" ? null : integer(input.toIndex, "Destination index");
  if ((mode === "cut" || mode === "move") && index == null) throw new Error(`${definition.label} requires an item index for '${mode}'.`);
  if (mode === "move" && toIndex == null) throw new Error(`${definition.label} requires a destination index.`);
  return {
    resource: definition.resource,
    field,
    id,
    index,
    toIndex,
    value: normalizedValue(definition, input, mode),
    ...(input.expectedValue !== undefined ? { expectedValue: cleanString(input.expectedValue) } : {}),
    mode,
    definition
  };
}

export function editInlineList<T>(current: readonly T[], patch: Pick<ValidatedInlineEditPatch, "mode" | "index" | "toIndex">, added: readonly T[]) {
  const next = [...current];
  if (patch.mode === "update") {
    if (patch.index == null) return [...added];
    if (patch.index >= next.length || added.length !== 1) throw new Error("The selected list item is no longer available.");
    next[patch.index] = added[0];
    return next;
  }
  if (patch.mode === "add") {
    const insertion = patch.toIndex == null ? next.length : Math.min(patch.toIndex, next.length);
    next.splice(insertion, 0, ...added);
    return next;
  }
  if (patch.mode === "cut") {
    if (patch.index == null || patch.index >= next.length) throw new Error("The selected list item is no longer available.");
    next.splice(patch.index, 1);
    return next;
  }
  if (patch.index == null || patch.index >= next.length || patch.toIndex == null || patch.toIndex >= next.length) {
    throw new Error("The list move is outside the available range.");
  }
  const [moved] = next.splice(patch.index, 1);
  next.splice(patch.toIndex, 0, moved);
  return next;
}
