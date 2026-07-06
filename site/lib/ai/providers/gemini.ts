import { readFile } from "node:fs/promises";
import { buildWoodsmithAnalysisPrompt, normalizeImageAnalysis, WOODSMITH_ANALYSIS_SCHEMA } from "@/lib/ai/schema";
import type { AiProvider, ImageEmbeddingResult, ProviderHealth } from "@/lib/ai/providers/types";
import { fetchJson, imageBase64, imageMimeType, parseJsonObject } from "@/lib/ai/providers/common";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const visionModel = () => process.env.GEMINI_VISION_MODEL || "gemini-3.1-flash-lite";
const embeddingModel = () => process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

async function health(): Promise<ProviderHealth> {
  if (!apiKey()) return { provider: "gemini", configured: false, enabled: false, available: false, model: visionModel(), reason: "GEMINI_API_KEY is not configured." };
  const started = performance.now();
  try {
    await fetchJson(`${API_BASE}/models/${visionModel()}?key=${encodeURIComponent(apiKey())}`, {}, 4_000);
    return { provider: "gemini", configured: true, enabled: true, available: true, model: visionModel(), latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { provider: "gemini", configured: true, enabled: true, available: false, model: visionModel(), reason: error instanceof Error ? error.message : "Gemini unavailable", latencyMs: Math.round(performance.now() - started) };
  }
}

export const geminiProvider: AiProvider = {
  name: "gemini",
  get model() { return visionModel(); },
  health,
  async describeImageContent(input) {
    if (!apiKey()) return null;
    const image = await imageBase64(input.absolutePath);
    const result = await fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; modelVersion?: string }>(`${API_BASE}/models/${visionModel()}:generateContent?key=${encodeURIComponent(apiKey())}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildWoodsmithAnalysisPrompt(input.candidatePieces) }, { inlineData: { mimeType: imageMimeType(input.absolutePath), data: image } }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: WOODSMITH_ANALYSIS_SCHEMA }
      })
    }, Number(process.env.MEDIA_AI_REQUEST_TIMEOUT_MS || 120_000));
    const content = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    return content ? normalizeImageAnalysis(parseJsonObject(content), "gemini", result.modelVersion || visionModel()) : null;
  },
  async createTextEmbeddings(texts) {
    if (!apiKey() || texts.length === 0) return null;
    const vectors: number[][] = [];
    for (const text of texts) {
      const result = await fetchJson<{ embedding?: { values?: number[] } }>(`${API_BASE}/models/${embeddingModel()}:embedContent?key=${encodeURIComponent(apiKey())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: `models/${embeddingModel()}`, content: { parts: [{ text }] }, outputDimensionality: 768 })
      }, 30_000);
      if (!result.embedding?.values?.length) return null;
      vectors.push(result.embedding.values);
    }
    return vectors;
  },
  async createImageEmbeddings(inputs): Promise<ImageEmbeddingResult[]> {
    if (!apiKey()) return inputs.map((input) => ({ path: input.relativePath, provider: "gemini", model: embeddingModel(), version: "1", error: "GEMINI_API_KEY is not configured." }));
    const results: ImageEmbeddingResult[] = [];
    for (const input of inputs) {
      try {
        const bytes = await readFile(input.absolutePath);
        const response = await fetchJson<{ embedding?: { values?: number[] } }>(`${API_BASE}/models/${embeddingModel()}:embedContent?key=${encodeURIComponent(apiKey())}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: `models/${embeddingModel()}`, content: { parts: [{ inlineData: { mimeType: imageMimeType(input.absolutePath), data: bytes.toString("base64") } }] }, outputDimensionality: 768 })
        }, 45_000);
        results.push({ path: input.relativePath, embedding: response.embedding?.values, provider: "gemini", model: embeddingModel(), version: "1", computedAt: new Date().toISOString(), error: response.embedding?.values?.length ? undefined : "Gemini returned no image embedding." });
      } catch (error) {
        results.push({ path: input.relativePath, provider: "gemini", model: embeddingModel(), version: "1", error: error instanceof Error ? error.message : "Gemini image embedding failed." });
      }
    }
    return results;
  }
};
