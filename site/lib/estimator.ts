export type VisualizerKind =
  | "dining-room-table"
  | "end-table"
  | "scientists-desk"
  | "footstool"
  | "spice-rack"
  | "pantry-cabinets"
  | "pastry-table"
  | "hallway-bench"
  | "other-custom-work";

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

const BASE_HOURS: Record<VisualizerKind, number> = {
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

const BASE_MARKUP: Record<VisualizerKind, number> = {
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

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateBoardFeet(width: number, depth: number, height: number, kind: VisualizerKind) {
  const volumeFactor = kind === "pantry-cabinets" ? 1.8 : kind === "spice-rack" ? 0.35 : 1;
  return Number((((width * depth * Math.max(height, 1)) / 144) * volumeFactor * 0.14).toFixed(2));
}

export function calculateEstimate(input: VisualizerState, activeQueueCount = 6, currentLeadTimeDays = 84): EstimateBreakdown {
  const boardFeet = calculateBoardFeet(input.width, input.depth, input.height, input.kind);
  const rate = MATERIAL_RATES[input.material] ?? MATERIAL_RATES.default;
  const materialCostCents = Math.round(boardFeet * rate + input.drawers * 8500 + input.shelves * 3200);
  const baseHours = BASE_HOURS[input.kind] ?? BASE_HOURS["other-custom-work"];
  const joineryFactor = JOINERY_MULTIPLIER[input.joinery] ?? JOINERY_MULTIPLIER.default;
  const sizeFactor = Math.max(0.7, (input.width * input.depth) / (48 * 24));
  const laborHours = Number((baseHours * joineryFactor * sizeFactor + input.drawers * 4 + input.shelves * 1.5).toFixed(1));
  const laborCostCents = Math.round(laborHours * 7500);
  const overheadCostCents = Math.round((materialCostCents + laborCostCents) * 0.11);
  const markupRate = BASE_MARKUP[input.kind] ?? BASE_MARKUP["other-custom-work"];
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
  const dimensions: Record<VisualizerKind, [number, number, number]> = {
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

  const materials: Record<VisualizerKind, string> = {
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

  const [width, depth, height] = dimensions[kind];

  return {
    kind,
    material: materials[kind],
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
