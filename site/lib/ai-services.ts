import { readFileSync } from "node:fs";
import path from "node:path";
import { geminiProvider } from "@/lib/ai/providers/gemini";
import { localSidecarProvider, callLocalSidecar } from "@/lib/ai/providers/local-sidecar";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { openAiProvider } from "@/lib/ai/providers/openai";
import { isEnabled } from "@/lib/ai/providers/common";
import type { AiProvider, AiProviderName, ImageAnalysisInput, ImageAnalysisResult, ImageEmbeddingResult, ProviderHealth, SidecarAction, SidecarActionRequest } from "@/lib/ai/providers/types";

export type { AiProviderName, ImageAnalysisResult, ImageEmbeddingResult, ProviderHealth } from "@/lib/ai/providers/types";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export type AiServiceStatus = {
  embeddingSearch: boolean;
  publicRendering: boolean;
  backgroundCleanup: boolean;
  mediaAnalysis: boolean;
  imageModel: string;
  embeddingModel: string;
  visionModel: string;
  activeAnalysisProvider: AiProviderName;
  activeEmbeddingProvider: AiProviderName;
  fallbackProvider: AiProviderName;
  sidecarUrl: string;
  maxBatch: number;
  confidenceHigh: number;
  confidenceMin: number;
  ambiguityDelta: number;
  providers: Record<Exclude<AiProviderName, "disabled">, { configured: boolean; enabled: boolean; model: string; reason?: string }>;
};

export type PhotorealisticRenderInput = {
  pieceType: string;
  material: string;
  joinery: string;
  width: number;
  depth: number;
  height: number;
  drawers?: number;
  shelves?: number;
  notes?: string;
};

type ProviderSelection = { provider?: AiProviderName | "local" | "hybrid"; candidatePieces?: ImageAnalysisInput["candidatePieces"] };

const PROVIDERS: Record<Exclude<AiProviderName, "disabled">, AiProvider> = {
  "local-sidecar": localSidecarProvider,
  ollama: ollamaProvider,
  gemini: geminiProvider,
  openai: openAiProvider
};

function providerName(value: string | undefined, fallback: AiProviderName): AiProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "local" || normalized === "local-clip" || normalized === "local-sidecar") return "local-sidecar";
  if (normalized === "ollama" || normalized === "gemini" || normalized === "openai" || normalized === "disabled") return normalized;
  return fallback;
}

function maxBatch() {
  const value = Number(process.env.MEDIA_AI_MAX_BATCH || 24);
  return Math.max(1, Math.min(100, Number.isFinite(value) ? Math.round(value) : 24));
}

function threshold(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : fallback));
}

function requestedMode() {
  return (process.env.AI_PROVIDER || "local").trim().toLowerCase();
}

function analysisProvider() {
  const explicit = process.env.AI_ANALYSIS_PROVIDER;
  if (explicit) return providerName(explicit, "disabled");
  if (requestedMode() === "openai") return "openai";
  if (requestedMode() === "gemini") return "gemini";
  if (requestedMode() === "ollama") return "ollama";
  return "local-sidecar";
}

function embeddingProvider() {
  const explicit = process.env.AI_EMBEDDING_PROVIDER;
  if (explicit) return providerName(explicit, "disabled");
  if (requestedMode() === "openai") return "openai";
  if (requestedMode() === "gemini") return "gemini";
  return "local-sidecar";
}

function fallbackProvider() {
  return providerName(process.env.AI_FALLBACK_PROVIDER, isEnabled(process.env.ENABLE_GEMINI_FALLBACK) ? "gemini" : "disabled");
}

function providerConfigured(name: Exclude<AiProviderName, "disabled">) {
  if (name === "gemini") return Boolean(process.env.GEMINI_API_KEY?.trim());
  if (name === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
  return true;
}

export function getAiServiceStatus(): AiServiceStatus {
  const analysis = analysisProvider();
  const embedding = embeddingProvider();
  const mediaAnalysis = isEnabled(process.env.ENABLE_AI_MEDIA_ANALYSIS) && analysis !== "disabled";
  const localEmbeddingEnabled = process.env.ENABLE_LOCAL_IMAGE_EMBEDDINGS == null || isEnabled(process.env.ENABLE_LOCAL_IMAGE_EMBEDDINGS);
  const embeddingSearch = isEnabled(process.env.ENABLE_EMBEDDING_SEARCH) && embedding !== "disabled" && (embedding !== "local-sidecar" || localEmbeddingEnabled);
  const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  return {
    embeddingSearch,
    publicRendering: Boolean(process.env.OPENAI_API_KEY) && isEnabled(process.env.ENABLE_PUBLIC_AI_RENDERING),
    backgroundCleanup: Boolean(process.env.OPENAI_API_KEY) && isEnabled(process.env.ENABLE_AI_BACKGROUND_CLEANUP),
    mediaAnalysis,
    imageModel,
    embeddingModel: embedding === "gemini" ? process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2" : embedding === "openai" ? process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small" : process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32",
    visionModel: analysis === "gemini" ? process.env.GEMINI_VISION_MODEL || "gemini-3.1-flash-lite" : analysis === "openai" ? process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano" : analysis === "ollama" ? process.env.OLLAMA_VISION_MODEL || "gemma4" : process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32",
    activeAnalysisProvider: analysis,
    activeEmbeddingProvider: embedding,
    fallbackProvider: fallbackProvider(),
    sidecarUrl: process.env.LOCAL_AI_SIDECAR_URL || "http://127.0.0.1:8765",
    maxBatch: maxBatch(),
    confidenceHigh: threshold("MEDIA_AI_CONFIDENCE_HIGH", 0.82),
    confidenceMin: threshold("MEDIA_AI_CONFIDENCE_MIN", 0.58),
    ambiguityDelta: threshold("MEDIA_AI_AMBIGUITY_DELTA", 0.08),
    providers: {
      "local-sidecar": { configured: true, enabled: embedding === "local-sidecar" || analysis === "local-sidecar", model: process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32" },
      ollama: { configured: true, enabled: analysis === "ollama" || fallbackProvider() === "ollama", model: process.env.OLLAMA_VISION_MODEL || "gemma4" },
      gemini: { configured: providerConfigured("gemini"), enabled: analysis === "gemini" || embedding === "gemini" || fallbackProvider() === "gemini", model: process.env.GEMINI_VISION_MODEL || "gemini-3.1-flash-lite", reason: providerConfigured("gemini") ? undefined : "GEMINI_API_KEY is not configured." },
      openai: { configured: providerConfigured("openai"), enabled: analysis === "openai" || embedding === "openai" || fallbackProvider() === "openai", model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano", reason: providerConfigured("openai") ? undefined : "OPENAI_API_KEY is not configured." }
    }
  };
}

export async function getAiProviderRuntimeStatus(): Promise<Record<Exclude<AiProviderName, "disabled">, ProviderHealth>> {
  const status = getAiServiceStatus();
  const entries = await Promise.all((Object.keys(PROVIDERS) as Array<Exclude<AiProviderName, "disabled">>).map(async (name) => {
    const configured = status.providers[name];
    if (!configured.enabled) return [name, { provider: name, configured: configured.configured, enabled: false, available: false, model: configured.model, reason: configured.reason || "Provider is not selected." } satisfies ProviderHealth] as const;
    if (!configured.configured) return [name, { provider: name, configured: false, enabled: true, available: false, model: configured.model, reason: configured.reason } satisfies ProviderHealth] as const;
    return [name, await PROVIDERS[name].health()] as const;
  }));
  return Object.fromEntries(entries) as Record<Exclude<AiProviderName, "disabled">, ProviderHealth>;
}

function providerSequence(primary: AiProviderName, override?: ProviderSelection["provider"]): AiProvider[] {
  const requested = override === "local" ? "local-sidecar" : override === "hybrid" ? primary : override || primary;
  if (requested === "disabled") return [];
  const names: AiProviderName[] = [requested as AiProviderName];
  if (requestedMode() === "hybrid" || override === "hybrid") names.push(fallbackProvider());
  return [...new Set(names)].flatMap((name) => name !== "disabled" && providerConfigured(name) ? [PROVIDERS[name]] : []);
}

export async function createTextEmbeddings(texts: string[], selection: ProviderSelection = {}) {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch || texts.length === 0) return null;
  for (const provider of providerSequence(status.activeEmbeddingProvider, selection.provider)) {
    if (!provider.createTextEmbeddings) continue;
    try {
      const result = await provider.createTextEmbeddings(texts.slice(0, status.maxBatch));
      if (result?.length === Math.min(texts.length, status.maxBatch)) return result;
    } catch {
      continue;
    }
  }
  return null;
}

export async function createImageEmbeddings(inputs: ImageAnalysisInput[], selection: ProviderSelection = {}): Promise<ImageEmbeddingResult[]> {
  const status = getAiServiceStatus();
  const batch = inputs.slice(0, status.maxBatch);
  if (!status.embeddingSearch || batch.length === 0) return [];
  const errors: ImageEmbeddingResult[] = [];
  for (const provider of providerSequence(status.activeEmbeddingProvider, selection.provider)) {
    if (!provider.createImageEmbeddings) continue;
    try {
      const results = await provider.createImageEmbeddings(batch);
      if (results.some((entry) => entry.embedding?.length)) return results;
      errors.push(...results);
    } catch (error) {
      errors.push(...batch.map((input) => ({ path: input.relativePath, provider: provider.name, model: provider.model, version: "1", error: error instanceof Error ? error.message : "Image embedding failed." })));
    }
  }
  return errors.length ? errors : batch.map((input) => ({ path: input.relativePath, provider: "disabled", model: "none", version: "1", error: "No image embedding provider is available." }));
}

export async function createImageEmbedding(input: ImageAnalysisInput, selection: ProviderSelection = {}): Promise<number[] | null> {
  const result = (await createImageEmbeddings([input], selection))[0];
  return result?.embedding?.length ? result.embedding : null;
}

export async function describeImageContent(absolutePath: string, relativePath: string, selection: ProviderSelection = {}): Promise<ImageAnalysisResult | null> {
  const status = getAiServiceStatus();
  if (!status.mediaAnalysis) return null;
  for (const provider of providerSequence(status.activeAnalysisProvider, selection.provider)) {
    if (!provider.describeImageContent) continue;
    try {
      const result = await provider.describeImageContent({ absolutePath, relativePath, candidatePieces: selection.candidatePieces });
      if (result) return result;
    } catch {
      continue;
    }
  }
  return null;
}

export async function runLocalSidecarAction(action: SidecarAction, request: SidecarActionRequest = {}) {
  return callLocalSidecar(action, { ...request, limit: Math.min(request.limit ?? maxBatch(), maxBatch()) });
}

async function openAiJson<T>(pathName: string, body: unknown): Promise<T> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key is not configured.");
  const response = await fetch(`${OPENAI_API_BASE}${pathName}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 320)}`);
  return response.json() as Promise<T>;
}

async function openAiMultipart<T>(pathName: string, body: FormData): Promise<T> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key is not configured.");
  const response = await fetch(`${OPENAI_API_BASE}${pathName}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 320)}`);
  return response.json() as Promise<T>;
}

function buildRenderPrompt(input: PhotorealisticRenderInput) {
  const extras = [input.drawers ? `${input.drawers} drawers` : "", input.shelves ? `${input.shelves} shelf levels` : "", input.notes ?? ""].filter(Boolean).join(", ");
  return [`Photorealistic product rendering of a custom Beaman Woodworks ${input.pieceType}.`, `Material and finish: ${input.material}.`, `Joinery: ${input.joinery}.`, `Dimensions: ${input.width} in wide, ${input.depth} in deep, ${input.height} in high.`, extras ? `Functional details: ${extras}.` : "", "Accurate proportions, visible grain, restrained Mackintosh and Arts and Crafts influence, clean ebony-and-maple presentation, no text or logos."].filter(Boolean).join(" ");
}

export async function createPhotorealisticPreview(input: PhotorealisticRenderInput) {
  const status = getAiServiceStatus();
  if (!status.publicRendering) throw new Error("Public AI rendering is not enabled.");
  const result = await openAiJson<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images/generations", { model: status.imageModel, prompt: buildRenderPrompt(input), size: process.env.OPENAI_IMAGE_SIZE || "1024x1024", quality: process.env.OPENAI_IMAGE_QUALITY || "high", background: "opaque" });
  const image = result.data?.[0];
  if (!image?.b64_json && !image?.url) throw new Error("Image generation did not return an image.");
  return image.b64_json ? { b64Json: image.b64_json, url: null } : { b64Json: null, url: image.url ?? null };
}

export async function createCleanedBackgroundVariant(relativePath: string, absolutePath: string, prompt: string) {
  const status = getAiServiceStatus();
  if (!status.backgroundCleanup) throw new Error("AI background cleanup is not enabled.");
  const imageBytes = readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const type = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const form = new FormData();
  form.set("model", status.imageModel);
  form.set("prompt", prompt || "Create a clean product-photography version of this woodworking piece. Remove distracting background clutter but preserve the piece, grain, joinery, proportions, and lighting.");
  form.set("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.set("image[]", new Blob([imageBytes], { type }), path.basename(relativePath));
  const result = await openAiMultipart<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images/edits", form);
  const image = result.data?.[0];
  if (!image?.b64_json && !image?.url) throw new Error("Image cleanup did not return an image.");
  return image.b64_json ? { b64Json: image.b64_json, url: null } : { b64Json: null, url: image.url ?? null };
}

export async function removeImageBackground(absolutePath: string, relativePath: string) {
  return createCleanedBackgroundVariant(relativePath, absolutePath, "Remove the background, isolate the woodworking piece on transparency, and preserve grain, joinery, proportions, and lighting.");
}

export async function batchDescribeMedia(items: ImageAnalysisInput[]) {
  const results: Array<{ relativePath: string; analysis: ImageAnalysisResult | null; error?: string }> = [];
  for (const item of items.slice(0, maxBatch())) {
    try {
      results.push({ relativePath: item.relativePath, analysis: await describeImageContent(item.absolutePath, item.relativePath, { candidatePieces: item.candidatePieces }) });
    } catch (error) {
      results.push({ relativePath: item.relativePath, analysis: null, error: error instanceof Error ? error.message : "Analysis failed." });
    }
  }
  return results;
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0, leftMagnitude = 0, rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0, b = right[index] ?? 0;
    dot += a * b; leftMagnitude += a * a; rightMagnitude += b * b;
  }
  return leftMagnitude && rightMagnitude ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) : 0;
}

export const serializeEmbedding = (embedding: number[]) => JSON.stringify(embedding);
export function deserializeEmbedding(serialized: string): number[] {
  try { const parsed = JSON.parse(serialized); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch { return []; }
}
