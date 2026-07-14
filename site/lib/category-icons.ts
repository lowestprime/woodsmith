export const BUILTIN_CATEGORY_ICON_NAMES = [
  "all",
  "table",
  "desk",
  "side-table",
  "bench",
  "chair",
  "stool",
  "cabinet",
  "shelf",
  "door",
  "bed",
  "frame",
  "board",
  "easel",
  "clock",
  "object"
] as const;

export type BuiltinCategoryIconName = (typeof BUILTIN_CATEGORY_ICON_NAMES)[number];

export type BuiltinCategoryIconDefinition = {
  name: BuiltinCategoryIconName;
  label: string;
  keywords: string[];
};

export function categoryIconAccessibility(label?: string) {
  const accessibleLabel = label?.trim();
  return accessibleLabel
    ? { "aria-label": accessibleLabel, role: "img" as const }
    : { "aria-hidden": true as const };
}

export const BUILTIN_CATEGORY_ICONS: BuiltinCategoryIconDefinition[] = [
  { name: "all", label: "All pieces", keywords: ["all", "collection", "grid"] },
  { name: "table", label: "Table", keywords: ["table", "dining", "pastry"] },
  { name: "desk", label: "Desk", keywords: ["desk", "writing", "scientist"] },
  { name: "side-table", label: "Side or entry table", keywords: ["side", "entry", "end table"] },
  { name: "bench", label: "Bench", keywords: ["bench", "hallway", "outdoor"] },
  { name: "chair", label: "Chair", keywords: ["chair", "seat"] },
  { name: "stool", label: "Stool or stepstool", keywords: ["stool", "stepstool", "footstool"] },
  { name: "cabinet", label: "Cabinet", keywords: ["cabinet", "pantry", "tool storage"] },
  { name: "shelf", label: "Shelf or rack", keywords: ["shelf", "rack", "spice"] },
  { name: "door", label: "Door", keywords: ["door", "entry", "deck"] },
  { name: "bed", label: "Bed or platform", keywords: ["bed", "platform"] },
  { name: "frame", label: "Frame or mirror", keywords: ["frame", "mirror", "portrait"] },
  { name: "board", label: "Cutting board or tray", keywords: ["board", "tray", "cutting"] },
  { name: "easel", label: "Easel", keywords: ["easel", "artist"] },
  { name: "clock", label: "Clock", keywords: ["clock", "restoration"] },
  { name: "object", label: "Object or other", keywords: ["object", "other", "miscellaneous"] }
];

const LEGACY_ICON_MAP: Record<string, BuiltinCategoryIconName> = {
  tables: "table",
  benches: "bench",
  stepstools: "stool",
  cabinets: "cabinet",
  objects: "object"
};

export function normalizeBuiltinCategoryIcon(value: unknown, fallback: BuiltinCategoryIconName = "object"): BuiltinCategoryIconName {
  const key = String(value ?? "").trim().toLowerCase();
  if (key in LEGACY_ICON_MAP) return LEGACY_ICON_MAP[key];
  return (BUILTIN_CATEGORY_ICON_NAMES as readonly string[]).includes(key) ? key as BuiltinCategoryIconName : fallback;
}

const ALLOWED_TAGS = new Set(["g", "path", "rect", "circle", "line", "polyline", "polygon", "ellipse"]);
const ALLOWED_ATTRIBUTES = new Set([
  "d", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "rx", "ry",
  "cx", "cy", "r", "points", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "fill-rule", "clip-rule", "opacity", "transform"
]);

function safeAttribute(name: string, value: string) {
  if (!ALLOWED_ATTRIBUTES.has(name)) return null;
  if (/url\s*\(|javascript:|data:|https?:|#(?![0-9a-f]{3,8}\b)/i.test(value)) return null;
  if (name === "fill" || name === "stroke") {
    return /^(none|currentColor|#[0-9a-f]{3,8})$/i.test(value) ? value : null;
  }
  if (name === "fill-rule" || name === "clip-rule") return /^(nonzero|evenodd)$/i.test(value) ? value : null;
  if (name === "stroke-linecap") return /^(butt|round|square)$/i.test(value) ? value : null;
  if (name === "stroke-linejoin") return /^(arcs|bevel|miter|miter-clip|round)$/i.test(value) ? value : null;
  if (name === "d") return /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(value) ? value : null;
  if (name === "points") return /^[0-9eE+.,\s-]+$/.test(value) ? value : null;
  if (name === "transform") return /^(?:(?:translate|scale|rotate|matrix)\([0-9eE+.,\s-]+\)\s*)+$/.test(value) ? value : null;
  return /^[0-9eE+.,\s-]+$/.test(value) ? value : null;
}

export function sanitizeCategoryIconSvg(input: string) {
  const source = input.trim();
  if (!source) return null;
  if (source.length > 12_000) throw new Error("Custom category SVG exceeds the 12 KB limit.");
  if (/<\/?(?:script|style|foreignObject|iframe|object|embed|image|use|a)\b/i.test(source)) {
    throw new Error("Custom category SVG contains an unsupported element.");
  }
  if (/\bon[a-z]+\s*=|\b(?:href|xlink:href|style)\s*=|<!DOCTYPE|<\?xml/i.test(source)) {
    throw new Error("Custom category SVG contains an unsafe attribute or declaration.");
  }

  const viewBoxMatch = source.match(/<svg\b[^>]*\bviewBox\s*=\s*["']\s*([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s*["'][^>]*>/i);
  const viewBox = viewBoxMatch
    ? viewBoxMatch.slice(1, 5).map(Number)
    : [0, 0, 48, 48];
  if (viewBox.some((value) => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0 || viewBox[2] > 4096 || viewBox[3] > 4096) {
    throw new Error("Custom category SVG has an invalid viewBox.");
  }

  if (!/^<svg\b[\s\S]*<\/svg>$/i.test(source)) {
    throw new Error("Custom category SVG must contain one complete svg element.");
  }

  const elements: string[] = [];
  const tagPattern = /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let rootOpen = false;
  let rootClosed = false;
  let groupDepth = 0;
  while ((match = tagPattern.exec(source))) {
    if (source.slice(cursor, match.index).trim()) {
      throw new Error("Custom category SVG contains unsupported text or markup.");
    }
    cursor = tagPattern.lastIndex;
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    if (tag === "svg") {
      if (!closing) {
        if (rootOpen || rootClosed || elements.length > 0) throw new Error("Custom category SVG contains a nested svg element.");
        rootOpen = true;
      } else {
        if (!rootOpen || rootClosed || groupDepth !== 0) throw new Error("Custom category SVG is not structurally balanced.");
        rootClosed = true;
      }
      continue;
    }
    if (!rootOpen || rootClosed) throw new Error("Custom category SVG contains content outside its root element.");
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`Custom category SVG element '${tag}' is not allowed.`);
    if (closing) {
      if (tag !== "g" || groupDepth === 0) throw new Error(`Custom category SVG has an invalid closing '${tag}' element.`);
      groupDepth -= 1;
      elements.push("</g>");
      continue;
    }

    const attributes: string[] = [];
    const attributePattern = /([a-z][a-z0-9:-]*)\s*=\s*["']([^"']*)["']/gi;
    let attribute: RegExpExecArray | null;
    let unparsedAttributes = match[2].replace(/\/\s*$/, "");
    while ((attribute = attributePattern.exec(match[2]))) {
      const name = attribute[1].toLowerCase();
      const value = safeAttribute(name, attribute[2].trim());
      if (value == null) throw new Error(`Custom category SVG attribute '${name}' is not allowed.`);
      attributes.push(`${name}="${value}"`);
      unparsedAttributes = unparsedAttributes.replace(attribute[0], "");
    }
    if (unparsedAttributes.trim()) throw new Error("Custom category SVG contains an unsupported or malformed attribute.");
    const selfClosing = tag !== "g" || /\/\s*>$/.test(match[0]);
    if (tag === "g" && !selfClosing) groupDepth += 1;
    elements.push(`<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}${selfClosing ? " />" : ">"}`);
  }

  if (source.slice(cursor).trim() || !rootClosed || groupDepth !== 0) throw new Error("Custom category SVG is not structurally complete.");
  if (elements.length === 0 || elements.length > 96) throw new Error("Custom category SVG does not contain a supported shape set.");
  return `<svg viewBox="${viewBox.join(" ")}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${elements.join("")}</svg>`;
}
