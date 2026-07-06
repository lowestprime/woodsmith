import { buildWoodsmithAnalysisPrompt, normalizeImageAnalysis, WOODSMITH_ANALYSIS_SCHEMA } from "@/lib/ai/schema";
import type { AiProvider, ProviderHealth } from "@/lib/ai/providers/types";
import { fetchJson, imageDataUrl, parseJsonObject } from "@/lib/ai/providers/common";

const API_BASE = "https://api.openai.com/v1";
const visionModel = () => process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano";
const embeddingModel = () => process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

function apiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function headers() {
  return { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" };
}

async function health(): Promise<ProviderHealth> {
  if (!apiKey()) return { provider: "openai", configured: false, enabled: false, available: false, model: visionModel(), reason: "OPENAI_API_KEY is not configured." };
  return { provider: "openai", configured: true, enabled: true, available: true, model: visionModel(), reason: "Configured; connectivity is tested only when explicitly selected." };
}

export const openAiProvider: AiProvider = {
  name: "openai",
  get model() { return visionModel(); },
  health,
  async describeImageContent(input) {
    if (!apiKey()) return null;
    const dataUrl = await imageDataUrl(input.absolutePath);
    const result = await fetchJson<{ output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; model?: string }>(`${API_BASE}/responses`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: visionModel(),
        input: [{ role: "user", content: [{ type: "input_text", text: buildWoodsmithAnalysisPrompt(input.candidatePieces) }, { type: "input_image", image_url: dataUrl }] }],
        text: { format: { type: "json_schema", name: "woodsmith_media_analysis", strict: true, schema: WOODSMITH_ANALYSIS_SCHEMA } }
      })
    }, Number(process.env.MEDIA_AI_REQUEST_TIMEOUT_MS || 120_000));
    const content = result.output?.flatMap((entry) => entry.content ?? []).find((entry) => entry.type === "output_text")?.text;
    return content ? normalizeImageAnalysis(parseJsonObject(content), "openai", result.model || visionModel()) : null;
  },
  async createTextEmbeddings(texts) {
    if (!apiKey() || texts.length === 0) return null;
    const result = await fetchJson<{ data?: Array<{ embedding?: number[]; index?: number }> }>(`${API_BASE}/embeddings`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model: embeddingModel(), input: texts })
    });
    const vectors = result.data?.slice().sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0)).map((entry) => entry.embedding || []) ?? [];
    return vectors.length === texts.length && vectors.every((vector) => vector.length > 0) ? vectors : null;
  }
};
