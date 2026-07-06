import { readFile } from "node:fs/promises";
import path from "node:path";

export function isEnabled(value: string | undefined) {
  return value === "true" || value === "1";
}

export function imageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".heic" || extension === ".heif") return "image/heic";
  return "image/jpeg";
}

export async function imageDataUrl(filePath: string) {
  const bytes = await readFile(filePath);
  return `data:${imageMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

export async function imageBase64(filePath: string) {
  return (await readFile(filePath)).toString("base64");
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Provider request failed (${response.status}): ${details.slice(0, 360)}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Provider returned a non-object JSON payload.");
  return parsed as Record<string, unknown>;
}
