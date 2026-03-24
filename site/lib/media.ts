import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export type MediaKind = "image" | "video" | "other";

export type MediaScanRecord = {
  relativePath: string;
  folder: string;
  fileName: string;
  kind: MediaKind;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  clusterKey: string;
  guessedAlt: string;
};

export function getMediaRoot() {
  if (process.env.MEDIA_ROOT) {
    return path.resolve(process.env.MEDIA_ROOT);
  }

  return path.resolve(process.cwd(), "..", "pics");
}

export function getMediaUrl(relativePath: string) {
  return `/media/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function detectMediaKind(fileName: string): MediaKind {
  const extension = path.extname(fileName).toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return "other";
}

function deriveDatePrefix(fileName: string) {
  const patterns = [
    /^(?:IMG|PXL)_(\d{8})/i,
    /^(\d{8})_/i,
    /^DSC_(\d{4})/i,
    /^([A-Z]{2,5}_\d{4,8})/i
  ];

  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return path.parse(fileName).name.slice(0, 10).toLowerCase();
}

export function deriveClusterKey(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const parsed = path.posix.parse(normalized);
  const folder = parsed.dir || "root";
  const prefix = deriveDatePrefix(parsed.base);
  return `${folder}:${prefix}`;
}

export function guessAltFromPath(relativePath: string) {
  const parsed = path.posix.parse(normalizeRelativePath(relativePath));
  return parsed.name
    .replace(/[_-]+/g, " ")
    .replace(/\bimg\b|\bpxl\b|\bdsc\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || parsed.base;
}

function walkMedia(directory: string, root: string, output: MediaScanRecord[]) {
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walkMedia(absolutePath, root, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = statSync(absolutePath);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

    output.push({
      relativePath,
      folder: path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath),
      fileName: entry.name,
      kind: detectMediaKind(entry.name),
      sizeBytes: stats.size,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      clusterKey: deriveClusterKey(relativePath),
      guessedAlt: guessAltFromPath(relativePath)
    });
  }
}

export function scanMediaLibrary() {
  const root = getMediaRoot();
  mkdirSync(root, { recursive: true });
  const files: MediaScanRecord[] = [];
  walkMedia(root, root, files);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function resolveMediaPath(relativePath: string) {
  const root = getMediaRoot();
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalized);

  if (!absolutePath.startsWith(root)) {
    throw new Error("Media path escapes the configured media root.");
  }

  return absolutePath;
}

export async function persistUploadedMedia(file: File, folder = "Uploads") {
  const safeFolder = slugify(folder) || "uploads";
  const originalName = file.name || "upload";
  const extension = path.extname(originalName) || ".bin";
  const stem = slugify(path.basename(originalName, extension)) || `upload-${randomUUID().slice(0, 8)}`;
  const finalName = `${stem}-${randomUUID().slice(0, 8)}${extension.toLowerCase()}`;
  const relativePath = `${safeFolder}/${finalName}`;
  const absolutePath = resolveMediaPath(relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  writeFileSync(absolutePath, Buffer.from(arrayBuffer));
  return relativePath;
}

export function renameMediaAsset(relativePath: string, nextBaseName: string) {
  const currentAbsolutePath = resolveMediaPath(relativePath);
  const parsed = path.parse(currentAbsolutePath);
  const baseName = slugify(nextBaseName) || `media-${randomUUID().slice(0, 8)}`;
  const targetAbsolutePath = path.join(parsed.dir, `${baseName}${parsed.ext.toLowerCase()}`);
  renameSync(currentAbsolutePath, targetAbsolutePath);
  const mediaRoot = getMediaRoot();
  return normalizeRelativePath(path.relative(mediaRoot, targetAbsolutePath));
}

export function deleteMediaAsset(relativePath: string) {
  const absolutePath = resolveMediaPath(relativePath);
  rmSync(absolutePath, { force: true });
}
