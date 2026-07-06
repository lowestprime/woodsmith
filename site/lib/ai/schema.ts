import type { CandidatePiece, ImageAnalysisResult } from "@/lib/ai/providers/types";

const PRIMARY_OBJECTS = new Set<ImageAnalysisResult["primaryObject"]>(["furniture-piece", "part-detail", "room-context", "process-workshop", "drawing-plan", "hardware-detail", "people-context", "other"]);
const FURNITURE_CLASSES = new Set<ImageAnalysisResult["furnitureClass"]>(["entry table", "side table", "dining table", "writing desk", "desk", "cabinet", "bench", "pantry cabinet", "hutch", "outdoor bench", "tray", "stool", "rack", "footstool", "other"]);
const PHOTO_CONTEXTS = new Set<ImageAnalysisResult["photoContext"]>(["studio-shot", "workshop-photo", "in-situ", "detail-closeup", "process-shot", "plan-sketch", "property-context", "unknown"]);
const CONSTRUCTION_STAGES = new Set<ImageAnalysisResult["constructionStage"]>(["finished", "unfinished", "glue-up", "sanding", "assembly", "installation", "raw-material", "unknown"]);

const strings = (value: unknown, max = 24) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max) : [];
const text = (value: unknown, max = 800) => String(value ?? "").trim().slice(0, max);
const score = (value: unknown) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const normalized = text(value, 80).toLowerCase() as T;
  return allowed.has(normalized) ? normalized : fallback;
}

function candidates(value: unknown): CandidatePiece[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const slug = text(item.slug, 160);
    if (!slug) return [];
    return [{ slug, title: text(item.title, 200) || undefined, description: text(item.description, 500) || undefined, confidence: score(item.confidence), evidence: strings(item.evidence, 12) }];
  }).slice(0, 12);
}

export function normalizeImageAnalysis(raw: unknown, provider: string, model: string): ImageAnalysisResult {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const confidence = score(value.confidence);
  const ambiguity = score(value.ambiguity);
  const primaryObject = enumValue(value.primaryObject, PRIMARY_OBJECTS, "other");
  const unsafeReason = text(value.unsafeToAutoAssignReason, 500)
    || (primaryObject !== "furniture-piece" ? "Image is not a complete furniture-piece view." : ambiguity >= 0.35 ? "Candidate identity is ambiguous." : confidence < 0.7 ? "Analysis confidence is below the safe suggestion threshold." : "");

  return {
    schemaVersion: "woodsmith-media-v1",
    provider: text(value.provider, 80) || provider,
    model: text(value.model, 160) || model,
    analyzedAt: text(value.analyzedAt, 80) || new Date().toISOString(),
    primaryObject,
    furnitureClass: enumValue(value.furnitureClass ?? value.pieceType, FURNITURE_CLASSES, "other"),
    specificSubtype: text(value.specificSubtype, 200),
    photoContext: enumValue(value.photoContext, PHOTO_CONTEXTS, "unknown"),
    constructionStage: enumValue(value.constructionStage, CONSTRUCTION_STAGES, "unknown"),
    visibleFeatures: strings(value.visibleFeatures),
    woodSpecies: strings(value.woodSpecies),
    finishDescription: text(value.finishDescription, 500),
    joinery: text(value.joinery, 300) || "not visible",
    hardware: strings(value.hardware),
    shapeAndProportionNotes: text(value.shapeAndProportionNotes, 600),
    candidatePieceSlugs: candidates(value.candidatePieceSlugs),
    searchTags: strings(value.searchTags ?? value.tags, 32),
    description: text(value.description, 800),
    altTextDraft: text(value.altTextDraft, 500),
    confidence,
    ambiguity,
    uncertainty: strings(value.uncertainty, 20),
    unsafeToAutoAssignReason: unsafeReason,
    boundingBoxes: Array.isArray(value.boundingBoxes) ? value.boundingBoxes.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const box = entry as Record<string, unknown>;
      return [{ label: text(box.label, 120), confidence: score(box.confidence), x: score(box.x), y: score(box.y), width: score(box.width), height: score(box.height) }];
    }).slice(0, 20) : undefined,
    embeddingKeys: strings(value.embeddingKeys, 12)
  };
}

export const WOODSMITH_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    primaryObject: { type: "string", enum: [...PRIMARY_OBJECTS] },
    furnitureClass: { type: "string", enum: [...FURNITURE_CLASSES] },
    specificSubtype: { type: "string" },
    photoContext: { type: "string", enum: [...PHOTO_CONTEXTS] },
    constructionStage: { type: "string", enum: [...CONSTRUCTION_STAGES] },
    visibleFeatures: { type: "array", items: { type: "string" } },
    woodSpecies: { type: "array", items: { type: "string" } },
    finishDescription: { type: "string" },
    joinery: { type: "string" },
    hardware: { type: "array", items: { type: "string" } },
    shapeAndProportionNotes: { type: "string" },
    candidatePieceSlugs: { type: "array", items: { type: "object", additionalProperties: false, properties: { slug: { type: "string" }, confidence: { type: "number" }, evidence: { type: "array", items: { type: "string" } } }, required: ["slug", "confidence", "evidence"] } },
    searchTags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    altTextDraft: { type: "string" },
    confidence: { type: "number" },
    ambiguity: { type: "number" },
    uncertainty: { type: "array", items: { type: "string" } },
    unsafeToAutoAssignReason: { type: "string" }
  },
  required: ["primaryObject", "furnitureClass", "specificSubtype", "photoContext", "constructionStage", "visibleFeatures", "woodSpecies", "finishDescription", "joinery", "hardware", "shapeAndProportionNotes", "candidatePieceSlugs", "searchTags", "description", "altTextDraft", "confidence", "ambiguity", "uncertainty", "unsafeToAutoAssignReason"]
} as const;

export function buildWoodsmithAnalysisPrompt(candidatePieces: Array<{ slug: string; title: string; description: string }> = []) {
  const candidatesText = candidatePieces.length ? `\nKnown piece candidates (never force a match):\n${candidatePieces.map((piece) => `- ${piece.slug}: ${piece.title}. ${piece.description}`).join("\n")}` : "";
  return [
    "Analyze this image for a woodworking catalog and return only schema-valid JSON.",
    "Describe only visible evidence. Do not infer a piece identity, species, finish, joinery, or construction stage without visual support.",
    "Use candidatePieceSlugs only for plausible matches and include concise visible evidence. Empty arrays are valid.",
    "Set unsafeToAutoAssignReason whenever the view is a detail, process, room/property context, people context, low confidence, or ambiguous.",
    "Confidence and ambiguity are decimal values from 0 to 1.",
    candidatesText
  ].join("\n");
}
