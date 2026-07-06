export type PieceCategoryIcon = "tables" | "benches" | "stepstools" | "cabinets" | "objects";

export type PieceCategoryDefinition = {
  key: string;
  label: string;
  icon: PieceCategoryIcon;
  aliases: string[];
};

export const defaultPieceCategories: PieceCategoryDefinition[] = [
  { key: "tables", label: "Tables", icon: "tables", aliases: ["table", "desk", "pastry table", "end table"] },
  { key: "benches", label: "Benches", icon: "benches", aliases: ["bench", "hallway bench"] },
  { key: "stepstools", label: "Stepstools", icon: "stepstools", aliases: ["stepstool", "step stool", "stool", "footstool"] },
  { key: "cabinets", label: "Cabinets", icon: "cabinets", aliases: ["cabinet", "pantry", "spice rack", "rack"] },
  { key: "objects", label: "Objects", icon: "objects", aliases: ["object", "tray", "small object"] }
];

const categoryIcons = new Set<PieceCategoryIcon>(["tables", "benches", "stepstools", "cabinets", "objects"]);

export function categoryKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function cleanAliases(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

export function normalizePieceCategories(value: unknown): PieceCategoryDefinition[] {
  if (!Array.isArray(value)) return defaultPieceCategories.map((category) => ({ ...category, aliases: [...category.aliases] }));

  const seen = new Set<string>();
  const normalized = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const key = categoryKey(String(record.key ?? record.label ?? ""));
    const label = String(record.label ?? "").trim();
    if (!key || key === "all" || !label || seen.has(key)) return [];
    seen.add(key);
    const iconCandidate = String(record.icon ?? key) as PieceCategoryIcon;
    const icon = categoryIcons.has(iconCandidate) ? iconCandidate : "objects";
    return [{ key, label, icon, aliases: cleanAliases(record.aliases) }];
  });

  return normalized.length > 0 ? normalized : defaultPieceCategories.map((category) => ({ ...category, aliases: [...category.aliases] }));
}

function normalizedText(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findPieceCategory(value: string | null | undefined, categories: PieceCategoryDefinition[] = defaultPieceCategories) {
  const normalized = normalizedText(value);
  if (!normalized) return null;

  const exact = categories.find((category) => normalized === normalizedText(category.key) || normalized === normalizedText(category.label));
  if (exact) return exact;

  return categories.find((category) => category.aliases.some((alias) => {
    const term = normalizedText(alias);
    return term.length > 0 && (normalized === term || normalized.includes(term));
  })) ?? null;
}

export function pieceCategoryKey(value: string | null | undefined, categories: PieceCategoryDefinition[] = defaultPieceCategories) {
  return findPieceCategory(value, categories)?.key ?? (categoryKey(String(value ?? "")) || "objects");
}

export function pieceCategoryIcon(value: string | null | undefined, categories: PieceCategoryDefinition[] = defaultPieceCategories): PieceCategoryIcon {
  return findPieceCategory(value, categories)?.icon ?? "objects";
}
