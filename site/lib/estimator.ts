export type VisualizerKind = string;

export type VisualizerTemplate =
  | "table"
  | "bench"
  | "stool"
  | "cabinet"
  | "shelf"
  | "chair"
  | "door"
  | "bed"
  | "frame"
  | "board"
  | "easel"
  | "clock"
  | "object";

export type VisualizerState = {
  kind: VisualizerKind;
  material: string;
  joinery: string;
  width: number;
  depth: number;
  height: number;
  drawers: number;
  shelves: number;
  notes: string;
  includeVisualization: boolean;
};

export type EstimateBreakdown = {
  boardFeet: number;
  materialCostCents: number;
  laborHours: number;
  laborCostCents: number;
  overheadCostCents: number;
  markupCostCents: number;
  totalCents: number;
  leadTimeDays: number;
  activeQueueCount: number;
  bandwidthPercent: number;
};

const MATERIAL_RATES: Record<string, number> = {
  "White Oak": 1850,
  Walnut: 2450,
  Cherry: 1900,
  Maple: 1750,
  "Bird's-eye maple": 2600,
  "White maple": 1750,
  Ash: 1650,
  "Stone top": 4200,
  "Phenolic resin top": 3600,
  "Paint-grade hardwood": 1450,
  "Black Walnut": 2450,
  "Hard Maple": 1750,
  default: 1850
};

const BASE_HOURS: Record<string, number> = {
  "dining-room-table": 72,
  "end-table": 24,
  "scientists-desk": 48,
  footstool: 12,
  "spice-rack": 10,
  "pantry-cabinets": 140,
  "pastry-table": 44,
  "hallway-bench": 28,
  "other-custom-work": 36
};

const BASE_MARKUP: Record<string, number> = {
  "dining-room-table": 0.22,
  "end-table": 0.18,
  "scientists-desk": 0.22,
  footstool: 0.16,
  "spice-rack": 0.16,
  "pantry-cabinets": 0.24,
  "pastry-table": 0.21,
  "hallway-bench": 0.18,
  "other-custom-work": 0.2
};

const JOINERY_MULTIPLIER: Record<string, number> = {
  "Exposed dovetail": 1.16,
  "Mortise and tenon": 1.1,
  "Half-lap": 1.04,
  "Pinned frame": 1.07,
  "Concealed joinery": 1,
  default: 1
};

export const VISUALIZER_LIMITS = {
  width: { min: 4, max: 240 },
  depth: { min: 2, max: 120 },
  height: { min: 2, max: 144 },
  drawers: { min: 0, max: 24 },
  shelves: { min: 0, max: 24 }
} as const;

export function clampNumber(value: number, min: number, max: number) {
  const finiteValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, finiteValue));
}

export function normalizeVisualizerState(input: VisualizerState): VisualizerState {
  return {
    ...input,
    width: clampNumber(input.width, VISUALIZER_LIMITS.width.min, VISUALIZER_LIMITS.width.max),
    depth: clampNumber(input.depth, VISUALIZER_LIMITS.depth.min, VISUALIZER_LIMITS.depth.max),
    height: clampNumber(input.height, VISUALIZER_LIMITS.height.min, VISUALIZER_LIMITS.height.max),
    drawers: Math.round(clampNumber(input.drawers, VISUALIZER_LIMITS.drawers.min, VISUALIZER_LIMITS.drawers.max)),
    shelves: Math.round(clampNumber(input.shelves, VISUALIZER_LIMITS.shelves.min, VISUALIZER_LIMITS.shelves.max))
  };
}

export function resolveVisualizerTemplate(kind: VisualizerKind): VisualizerTemplate {
  const value = kind.trim().toLowerCase();
  if (/cabinet|pantry|cupboard|wardrobe|credenza/.test(value)) return "cabinet";
  if (/shelf|rack|bookcase/.test(value)) return "shelf";
  if (/chair|seat/.test(value)) return "chair";
  if (/stool|step/.test(value)) return "stool";
  if (/bench|settle/.test(value)) return "bench";
  if (/door|gate|screen/.test(value)) return "door";
  if (/bed|platform/.test(value)) return "bed";
  if (/frame|mirror/.test(value)) return "frame";
  if (/board|tray|platter/.test(value)) return "board";
  if (/easel|stand/.test(value)) return "easel";
  if (/clock/.test(value)) return "clock";
  if (/table|desk|console|island/.test(value)) return "table";
  return "object";
}

export function calculateBoardFeet(width: number, depth: number, height: number, kind: VisualizerKind) {
  const safeWidth = clampNumber(width, VISUALIZER_LIMITS.width.min, VISUALIZER_LIMITS.width.max);
  const safeDepth = clampNumber(depth, VISUALIZER_LIMITS.depth.min, VISUALIZER_LIMITS.depth.max);
  const safeHeight = clampNumber(height, VISUALIZER_LIMITS.height.min, VISUALIZER_LIMITS.height.max);
  const template = resolveVisualizerTemplate(kind);
  const volumeFactor = template === "cabinet" ? 1.8 : template === "shelf" ? 0.35 : 1;
  return Number((((safeWidth * safeDepth * safeHeight) / 144) * volumeFactor * 0.14).toFixed(2));
}

export function calculateEstimate(input: VisualizerState, activeQueueCount = 6, currentLeadTimeDays = 84): EstimateBreakdown {
  const normalized = normalizeVisualizerState(input);
  const boardFeet = calculateBoardFeet(normalized.width, normalized.depth, normalized.height, normalized.kind);
  const rate = MATERIAL_RATES[normalized.material] ?? MATERIAL_RATES.default;
  const materialCostCents = Math.round(boardFeet * rate + normalized.drawers * 8500 + normalized.shelves * 3200);
  const baseHours = BASE_HOURS[normalized.kind] ?? BASE_HOURS["other-custom-work"];
  const joineryFactor = JOINERY_MULTIPLIER[normalized.joinery] ?? JOINERY_MULTIPLIER.default;
  const sizeFactor = Math.max(0.7, (normalized.width * normalized.depth) / (48 * 24));
  const laborHours = Number((baseHours * joineryFactor * sizeFactor + normalized.drawers * 4 + normalized.shelves * 1.5).toFixed(1));
  const laborCostCents = Math.round(laborHours * 7500);
  const overheadCostCents = Math.round((materialCostCents + laborCostCents) * 0.11);
  const markupRate = BASE_MARKUP[normalized.kind] ?? BASE_MARKUP["other-custom-work"];
  const markupCostCents = Math.round((materialCostCents + laborCostCents + overheadCostCents) * markupRate);
  const totalCents = materialCostCents + laborCostCents + overheadCostCents + markupCostCents;
  const queueContribution = activeQueueCount * 5;
  const laborContribution = Math.round(laborHours / 2.8);
  const leadTimeDays = clampNumber(currentLeadTimeDays + queueContribution + laborContribution, 21, 224);
  const bandwidthPercent = clampNumber(Math.round(((activeQueueCount * 18) + laborHours) / 2.25), 12, 98);

  return {
    boardFeet,
    materialCostCents,
    laborHours,
    laborCostCents,
    overheadCostCents,
    markupCostCents,
    totalCents,
    leadTimeDays,
    activeQueueCount,
    bandwidthPercent
  };
}

export function defaultVisualizerState(kind: VisualizerKind = "hallway-bench"): VisualizerState {
  const dimensions: Record<string, [number, number, number]> = {
    "dining-room-table": [84, 40, 30],
    "end-table": [22, 22, 24],
    "scientists-desk": [48, 24, 30],
    footstool: [19, 12, 10],
    "spice-rack": [20, 4, 18],
    "pantry-cabinets": [96, 24, 90],
    "pastry-table": [48, 26, 34],
    "hallway-bench": [60, 15, 18],
    "other-custom-work": [48, 20, 30]
  };

  const materials: Record<string, string> = {
    "dining-room-table": "White Oak",
    "end-table": "Walnut",
    "scientists-desk": "Phenolic resin top",
    footstool: "White Oak",
    "spice-rack": "Maple",
    "pantry-cabinets": "Paint-grade hardwood",
    "pastry-table": "Stone top",
    "hallway-bench": "White Oak",
    "other-custom-work": "White Oak"
  };

  const [width, depth, height] = dimensions[kind] ?? dimensions["other-custom-work"];

  return {
    kind,
    material: materials[kind] ?? materials["other-custom-work"],
    joinery: kind === "pantry-cabinets" ? "Pinned frame" : "Mortise and tenon",
    width,
    depth,
    height,
    drawers: kind === "scientists-desk" ? 1 : 0,
    shelves: kind === "pantry-cabinets" ? 4 : kind === "pastry-table" ? 1 : 0,
    notes: "",
    includeVisualization: true
  };
}
