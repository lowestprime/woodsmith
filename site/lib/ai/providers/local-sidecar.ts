import { normalizeImageAnalysis } from "@/lib/ai/schema";
import type { AiProvider, ImageAnalysisInput, ImageEmbeddingResult, ProviderHealth, SidecarAction, SidecarActionRequest, SidecarActionResponse } from "@/lib/ai/providers/types";
import { fetchJson } from "@/lib/ai/providers/common";

function baseUrl() {
  return (process.env.LOCAL_AI_SIDECAR_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
}

export async function callLocalSidecar(action: SidecarAction, body: SidecarActionRequest = {}): Promise<SidecarActionResponse> {
  const token = process.env.LOCAL_AI_SIDECAR_TOKEN?.trim();
  return fetchJson<SidecarActionResponse>(`${baseUrl()}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  }, Number(process.env.MEDIA_AI_REQUEST_TIMEOUT_MS || 120_000));
}

async function health(): Promise<ProviderHealth> {
  const started = performance.now();
  try {
    const token = process.env.LOCAL_AI_SIDECAR_TOKEN?.trim();
    const result = await fetchJson<{ ok?: boolean; model?: string }>(`${baseUrl()}/health`, { headers: token ? { authorization: `Bearer ${token}` } : undefined }, 2_500);
    return { provider: "local-sidecar", configured: true, enabled: true, available: result.ok !== false, model: result.model || process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32", latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { provider: "local-sidecar", configured: true, enabled: true, available: false, model: process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32", reason: error instanceof Error ? error.message : "Local sidecar unavailable", latencyMs: Math.round(performance.now() - started) };
  }
}

export const localSidecarProvider: AiProvider = {
  name: "local-sidecar",
  model: process.env.LOCAL_EMBEDDING_MODEL || "sentence-transformers/clip-ViT-B-32",
  health,
  async describeImageContent(input) {
    const response = await callLocalSidecar("analyze", {
      selectedPaths: [input.relativePath],
      pieces: input.candidatePieces,
      limit: 1
    });
    const items = Array.isArray(response.items) ? response.items as Array<Record<string, unknown>> : [];
    const raw = items[0]?.analysis ?? items[0];
    return raw ? normalizeImageAnalysis(raw, "local-sidecar", String(items[0]?.model || this.model)) : null;
  },
  async createTextEmbeddings(texts) {
    if (texts.length === 0) return [];
    const response = await callLocalSidecar("embed", { texts, limit: texts.length });
    const embeddings = Array.isArray(response.embeddings) ? response.embeddings : [];
    const vectors = embeddings.map((value) => Array.isArray(value) ? value.map(Number) : []);
    return vectors.length === texts.length && vectors.every((vector) => vector.length > 0) ? vectors : null;
  },
  async createImageEmbeddings(inputs: ImageAnalysisInput[]): Promise<ImageEmbeddingResult[]> {
    if (inputs.length === 0) return [];
    const response = await callLocalSidecar("embed", { selectedPaths: inputs.map((input) => input.relativePath), limit: inputs.length });
    const items = Array.isArray(response.items) ? response.items as Array<Record<string, unknown>> : [];
    const byPath = new Map(items.map((item) => [String(item.relativePath ?? item.path ?? ""), item]));
    return inputs.map((input) => {
      const item = byPath.get(input.relativePath);
      const vector = Array.isArray(item?.embedding) ? item.embedding.map(Number) : undefined;
      return {
        path: input.relativePath,
        embedding: vector?.length ? vector : undefined,
        provider: String(item?.provider || "local-sidecar"),
        model: String(item?.model || this.model),
        version: String(item?.version || "1"),
        hash: item?.hash ? String(item.hash) : undefined,
        computedAt: item?.computedAt ? String(item.computedAt) : undefined,
        error: item?.error ? String(item.error) : item ? undefined : "Sidecar returned no embedding result."
      };
    });
  }
};
