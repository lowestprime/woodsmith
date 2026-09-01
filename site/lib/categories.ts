import {
  normalizeBuiltinCategoryIcon,
  sanitizeCategoryIconSvg,
  type BuiltinCategoryIconName
} from "./category-icons.ts";

export type PieceCategoryIcon = BuiltinCategoryIconName;
export type PieceCategoryIconType = "builtin" | "custom";

export type PieceCategoryDefinition = {
  key: string;
  label: string;
  icon: PieceCategoryIcon;
  iconType: PieceCategoryIconType;
  iconName: PieceCategoryIcon;
  customIconSvg: string | null;
  aliases: string[];
  sortOrder: number;
  visible: boolean;
};

const defaultCategoryInput: Array<Pick<PieceCategoryDefinition, "key" | "label" | "iconName" | "aliases">> = [
  { key: "tables", label: "Tables", iconName: "table", aliases: ["table", "dining", "pastry table"] },
  { key: "desks", label: "Desks", iconName: "desk", aliases: ["desk", "writing desk", "scientist desk", "scientists desk"] },
  { key: "benches", label: "Benches", iconName: "bench", aliases: ["bench", "hallway bench", "outdoor bench"] },
  { key: "chairs", label: "Chairs", iconName: "chair", aliases: ["chair", "seat"] },
  { key: "stools", label: "Stools", iconName: "stool", aliases: ["stepstool", "step stool", "stool", "footstool"] },
  { key: "cabinets", label: "Cabinets", iconName: "cabinet", aliases: ["cabinet", "pantry", "cupboard"] },
  { key: "shelves", label: "Shelves & racks", iconName: "shelf", aliases: ["shelf", "shelves", "rack", "spice rack"] },
  { key: "doors", label: "Doors", iconName: "door", aliases: ["door", "entry door", "deck door"] },
  { key: "beds", label: "Beds & platforms", iconName: "bed", aliases: ["bed", "platform", "bed platform"] },
  { key: "frames", label: "Frames & mirrors", iconName: "frame", aliases: ["frame", "mirror", "portrait frame"] },
  { key: "boards", label: "Boards & trays", iconName: "board", aliases: ["cutting board", "board", "tray"] },
  { key: "easels", label: "Easels", iconName: "easel", aliases: ["easel", "artist easel"] },
  { key: "objects", label: "Objects", iconName: "object", aliases: ["object", "clock", "small object", "other"] }
];

export const defaultPieceCategories: PieceCategoryDefinition[] = defaultCategoryInput.map((category, index) => ({
  ...category,
  icon: category.iconName,
  iconType: "builtin",
  customIconSvg: null,
  sortOrder: index * 10,
  visible: true
}));

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

function normalizeCustomIcon(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return sanitizeCategoryIconSvg(value);
  } catch {
    return null;
  }
}

function cloneDefaults() {
  return defaultPieceCategories.map((category) => ({ ...category, aliases: [...category.aliases] }));
}

export function normalizePieceCategories(value: unknown): PieceCategoryDefinition[] {
  if (!Array.isArray(value)) return cloneDefaults();

  const seen = new Set<string>();
  const normalized = value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const key = categoryKey(String(record.key ?? record.label ?? ""));
    const label = String(record.label ?? "").trim();
    if (!key || key === "all" || !label || seen.has(key)) return [];
    seen.add(key);

    const customIconSvg = normalizeCustomIcon(record.customIconSvg);
    const iconType: PieceCategoryIconType = record.iconType === "custom" && customIconSvg ? "custom" : "builtin";
    const iconName = normalizeBuiltinCategoryIcon(record.iconName ?? record.icon ?? key);
    const rawOrder = Number(record.sortOrder);
    const sortOrder = Number.isFinite(rawOrder) ? Math.max(0, Math.min(9999, Math.round(rawOrder))) : index * 10;

    return [{
      key,
      label,
      icon: iconName,
      iconType,
      iconName,
      customIconSvg: iconType === "custom" ? customIconSvg : null,
      aliases: cleanAliases(record.aliases),
      sortOrder,
      visible: record.visible !== false
    } satisfies PieceCategoryDefinition];
  });

  return normalized.length > 0
    ? normalized.sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    : cloneDefaults();
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
  return findPieceCategory(value, categories)?.iconName ?? "object";
}
