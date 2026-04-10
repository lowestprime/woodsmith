import { readFileSync } from "node:fs";
import path from "node:path";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export type AiServiceStatus = {
  embeddingSearch: boolean;
  publicRendering: boolean;
  backgroundCleanup: boolean;
  mediaAnalysis: boolean;
  imageModel: string;
  embeddingModel: string;
  visionModel: string;
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

export type ImageAnalysisResult = {
  pieceType: string;
  woodSpecies: string[];
  finishDescription: string;
  joinery: string;
  photoContext: string;
  tags: string[];
  description: string;
};

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function enabled(value: string | undefined) {
  return value === "true" || value === "1";
}

export function getAiServiceStatus(): AiServiceStatus {
  return {
    embeddingSearch: hasOpenAiKey() && enabled(process.env.ENABLE_EMBEDDING_SEARCH),
    publicRendering: hasOpenAiKey() && enabled(process.env.ENABLE_PUBLIC_AI_RENDERING),
    backgroundCleanup: hasOpenAiKey() && enabled(process.env.ENABLE_AI_BACKGROUND_CLEANUP),
    mediaAnalysis: hasOpenAiKey() && enabled(process.env.ENABLE_AI_MEDIA_ANALYSIS),
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    visionModel: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini"
  };
}

async function openAiJson<T>(pathName: string, body: unknown): Promise<T> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured.");
  }

  const response = await fetch(`${OPENAI_API_BASE}${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details.slice(0, 320)}`);
  }

  return response.json() as Promise<T>;
}

async function openAiMultipart<T>(pathName: string, body: FormData): Promise<T> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured.");
  }

  const response = await fetch(`${OPENAI_API_BASE}${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details.slice(0, 320)}`);
  }

  return response.json() as Promise<T>;
}

function buildRenderPrompt(input: PhotorealisticRenderInput) {
  const dimensions = `${input.width} in wide, ${input.depth} in deep, ${input.height} in high`;
  const extras = [
    input.drawers ? `${input.drawers} drawer${input.drawers === 1 ? "" : "s"}` : "",
    input.shelves ? `${input.shelves} shelf level${input.shelves === 1 ? "" : "s"}` : "",
    input.notes ?? ""
  ].filter(Boolean).join(", ");

  return [
    "Photorealistic product rendering of a custom Beaman Woodworks furniture concept.",
    `Piece type: ${input.pieceType}.`,
    `Primary material and finish: ${input.material}.`,
    `Joinery direction: ${input.joinery}.`,
    `Approximate dimensions: ${dimensions}.`,
    extras ? `Functional details: ${extras}.` : "",
    "Show a full-color, realistic woodworking piece with accurate proportions, visible grain, restrained Mackintosh and Arts and Crafts influence, clean ebony-and-maple presentation, and no text or logos."
  ].filter(Boolean).join(" ");
}

export async function createTextEmbeddings(texts: string[]) {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch || texts.length === 0) {
    return null;
  }

  const result = await openAiJson<{ data?: Array<{ embedding?: number[] }> }>("/embeddings", {
    model: status.embeddingModel,
    input: texts
  });

  const embeddings = result.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item));
  return embeddings?.length === texts.length ? embeddings : null;
}

export async function createPhotorealisticPreview(input: PhotorealisticRenderInput) {
  const status = getAiServiceStatus();
  if (!status.publicRendering) {
    throw new Error("Public AI rendering is not enabled.");
  }

  const result = await openAiJson<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images/generations", {
    model: status.imageModel,
    prompt: buildRenderPrompt(input),
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    quality: process.env.OPENAI_IMAGE_QUALITY || "high",
    background: "opaque"
  });

  const image = result.data?.[0];
  if (!image?.b64_json && !image?.url) {
    throw new Error("Image generation did not return an image.");
  }

  return image.b64_json ? { b64Json: image.b64_json, url: null } : { b64Json: null, url: image.url ?? null };
}

export async function createCleanedBackgroundVariant(relativePath: string, absolutePath: string, prompt: string) {
  const status = getAiServiceStatus();
  if (!status.backgroundCleanup) {
    throw new Error("AI background cleanup is not enabled.");
  }

  const imageBytes = readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const type = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const form = new FormData();
  form.set("model", status.imageModel);
  form.set("prompt", prompt || "Create a clean product-photography version of this woodworking piece. Remove distracting background clutter, keep the piece itself unchanged, preserve wood grain, joinery, proportions, and lighting, and use a neutral warm maple-and-ebony presentation.");
  form.set("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.set("image[]", new Blob([imageBytes], { type }), path.basename(relativePath));

  const result = await openAiMultipart<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images/edits", form);
  const image = result.data?.[0];
  if (!image?.b64_json && !image?.url) {
    throw new Error("Image cleanup did not return an image.");
  }

  return image.b64_json ? { b64Json: image.b64_json, url: null } : { b64Json: null, url: image.url ?? null };
}

export async function describeImageContent(absolutePath: string, relativePath: string): Promise<ImageAnalysisResult | null> {
  const status = getAiServiceStatus();
  if (!status.mediaAnalysis) {
    return null;
  }

  const imageBytes = readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  const base64 = imageBytes.toString("base64");

  const result = await openAiJson<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
    model: status.visionModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Analyze this woodworking piece image. Return ONLY a JSON object with these keys:",
              '- "pieceType": string (table, bench, cabinet, stool, tray, desk, rack, footstool, or other)',
              '- "woodSpecies": string[] (visible wood species, e.g. ["white oak", "maple"])',
              '- "finishDescription": string (brief finish description)',
              '- "joinery": string (visible joinery type or "not visible")',
              '- "photoContext": string (one of: studio-shot, workshop-photo, in-situ, detail-closeup, process-shot)',
              '- "tags": string[] (5-8 descriptive search tags for this specific image)',
              '- "description": string (one-sentence description of what is shown)',
              "Return only valid JSON, no markdown fences."
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" }
          }
        ]
      }
    ],
    max_tokens: 400
  });

  const content = result.choices?.[0]?.message?.content?.trim() ?? "";
  const jsonContent = content.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
    return {
      pieceType: String(parsed.pieceType ?? "unknown"),
      woodSpecies: Array.isArray(parsed.woodSpecies) ? parsed.woodSpecies.map(String) : [],
      finishDescription: String(parsed.finishDescription ?? ""),
      joinery: String(parsed.joinery ?? "not visible"),
      photoContext: String(parsed.photoContext ?? "unknown"),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      description: String(parsed.description ?? "")
    };
  } catch {
    return {
      pieceType: "unknown",
      woodSpecies: [],
      finishDescription: "",
      joinery: "not visible",
      photoContext: "unknown",
      tags: content.split(/[\s,]+/).filter((word) => word.length > 2).slice(0, 8),
      description: content.slice(0, 200)
    };
  }
}

export async function removeImageBackground(absolutePath: string, relativePath: string): Promise<{ b64Json: string | null; url: string | null }> {
  const status = getAiServiceStatus();
  if (!status.backgroundCleanup) {
    throw new Error("AI background cleanup is not enabled.");
  }

  const imageBytes = readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const form = new FormData();
  form.set("model", status.imageModel);
  form.set("prompt", "Remove the background completely, isolating the woodworking piece on a pure transparent background. Preserve all wood grain detail, joinery, proportions, and lighting on the piece itself. Output with transparent background.");
  form.set("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.set("background", "transparent");
  form.set("image[]", new Blob([imageBytes], { type: mimeType }), path.basename(relativePath));

  const result = await openAiMultipart<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images/edits", form);
  const image = result.data?.[0];
  if (!image?.b64_json && !image?.url) {
    throw new Error("Background removal did not return an image.");
  }

  return image.b64_json ? { b64Json: image.b64_json, url: null } : { b64Json: null, url: image.url ?? null };
}

export async function batchDescribeMedia(items: Array<{ absolutePath: string; relativePath: string }>): Promise<Array<{ relativePath: string; analysis: ImageAnalysisResult | null }>> {
  const results: Array<{ relativePath: string; analysis: ImageAnalysisResult | null }> = [];

  for (const item of items) {
    try {
      const analysis = await describeImageContent(item.absolutePath, item.relativePath);
      results.push({ relativePath: item.relativePath, analysis });
    } catch {
      results.push({ relativePath: item.relativePath, analysis: null });
    }
  }

  return results;
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

export function deserializeEmbedding(serialized: string): number[] {
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}
