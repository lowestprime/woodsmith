import { buildWoodsmithAnalysisPrompt, normalizeImageAnalysis, WOODSMITH_ANALYSIS_SCHEMA } from "@/lib/ai/schema";
import type { AiProvider, ProviderHealth } from "@/lib/ai/providers/types";
import { fetchJson, imageBase64, parseJsonObject } from "@/lib/ai/providers/common";

const baseUrl = () => (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const model = () => process.env.OLLAMA_VISION_MODEL || "gemma4";

async function health(): Promise<ProviderHealth> {
  const started = performance.now();
  try {
    const result = await fetchJson<{ models?: Array<{ name?: string; model?: string }> }>(`${baseUrl()}/api/tags`, {}, 2_500);
    const configuredModel = model();
    const available = Boolean(result.models?.some((entry) => [entry.name, entry.model].filter(Boolean).some((name) => String(name).split(":")[0] === configuredModel.split(":")[0])));
    return { provider: "ollama", configured: true, enabled: true, available, model: configuredModel, reason: available ? undefined : `Model ${configuredModel} is not installed.`, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { provider: "ollama", configured: true, enabled: true, available: false, model: model(), reason: error instanceof Error ? error.message : "Ollama unavailable", latencyMs: Math.round(performance.now() - started) };
  }
}

export const ollamaProvider: AiProvider = {
  name: "ollama",
  get model() { return model(); },
  health,
  async describeImageContent(input) {
    const image = await imageBase64(input.absolutePath);
    const result = await fetchJson<{ message?: { content?: string }; model?: string }>(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: model(),
        stream: false,
        format: WOODSMITH_ANALYSIS_SCHEMA,
        options: { temperature: 0 },
        messages: [{ role: "user", content: buildWoodsmithAnalysisPrompt(input.candidatePieces), images: [image] }]
      })
    }, Number(process.env.MEDIA_AI_REQUEST_TIMEOUT_MS || 120_000));
    const content = result.message?.content;
    if (!content) return null;
    return normalizeImageAnalysis(parseJsonObject(content), "ollama", result.model || model());
  }
};
