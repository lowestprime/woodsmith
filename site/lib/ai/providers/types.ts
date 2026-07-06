export type AiProviderName = "local-sidecar" | "ollama" | "gemini" | "openai" | "disabled";

export type CandidatePiece = {
  slug: string;
  title?: string;
  description?: string;
  confidence: number;
  evidence: string[];
};

export type ImageAnalysisResult = {
  schemaVersion: "woodsmith-media-v1";
  provider: string;
  model: string;
  analyzedAt: string;
  primaryObject: "furniture-piece" | "part-detail" | "room-context" | "process-workshop" | "drawing-plan" | "hardware-detail" | "people-context" | "other";
  furnitureClass: "entry table" | "side table" | "dining table" | "writing desk" | "desk" | "cabinet" | "bench" | "pantry cabinet" | "hutch" | "outdoor bench" | "tray" | "stool" | "rack" | "footstool" | "other";
  specificSubtype: string;
  photoContext: "studio-shot" | "workshop-photo" | "in-situ" | "detail-closeup" | "process-shot" | "plan-sketch" | "property-context" | "unknown";
  constructionStage: "finished" | "unfinished" | "glue-up" | "sanding" | "assembly" | "installation" | "raw-material" | "unknown";
  visibleFeatures: string[];
  woodSpecies: string[];
  finishDescription: string;
  joinery: string;
  hardware: string[];
  shapeAndProportionNotes: string;
  candidatePieceSlugs: CandidatePiece[];
  searchTags: string[];
  description: string;
  altTextDraft: string;
  confidence: number;
  ambiguity: number;
  uncertainty: string[];
  unsafeToAutoAssignReason: string;
  boundingBoxes?: Array<{ label: string; confidence: number; x: number; y: number; width: number; height: number }>;
  embeddingKeys?: string[];
};

export type ImageAnalysisInput = {
  absolutePath: string;
  relativePath: string;
  candidatePieces?: Array<{ slug: string; title: string; description: string }>;
};

export type ImageEmbeddingResult = {
  path: string;
  embedding?: number[];
  provider: string;
  model: string;
  version: string;
  hash?: string;
  computedAt?: string;
  error?: string;
};

export type ProviderHealth = {
  provider: AiProviderName;
  configured: boolean;
  available: boolean;
  enabled: boolean;
  model?: string;
  reason?: string;
  latencyMs?: number;
};

export type AiProvider = {
  name: AiProviderName;
  model: string;
  health: () => Promise<ProviderHealth>;
  describeImageContent?: (input: ImageAnalysisInput) => Promise<ImageAnalysisResult | null>;
  createTextEmbeddings?: (texts: string[]) => Promise<number[][] | null>;
  createImageEmbeddings?: (inputs: ImageAnalysisInput[]) => Promise<ImageEmbeddingResult[]>;
};

export type SidecarAction = "scan" | "analyze" | "embed" | "cluster" | "rank" | "full" | "cancel";

export type SidecarActionRequest = {
  selectedPaths?: string[];
  texts?: string[];
  pieces?: Array<{ slug: string; title: string; description: string }>;
  limit?: number;
  dryRun?: boolean;
  includeReviewed?: boolean;
};

export type SidecarActionResponse = Record<string, unknown> & {
  ok?: boolean;
  action?: string;
  warnings?: string[];
  errors?: Array<{ path?: string; message: string }>;
};
