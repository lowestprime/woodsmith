import { readFileSync } from "node:fs";
import path from "node:path";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export type AiServiceStatus = {
  embeddingSearch: boolean;
  publicRendering: boolean;
  backgroundCleanup: boolean;
  imageModel: string;
  embeddingModel: string;
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
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
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
