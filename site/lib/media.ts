import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg", ".bmp", ".heic", ".heif", ".tif", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const IGNORED_MEDIA_FILE_NAMES = new Set(["synoindex_media_info", ".ds_store", "thumbs.db"]);
const DEFAULT_MEDIA_ROOT = "/app/pics";

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
  const configuredRoot = process.env.MEDIA_ROOT?.trim() || DEFAULT_MEDIA_ROOT;
  if (!path.isAbsolute(configuredRoot)) {
    throw new Error("MEDIA_ROOT must be an absolute filesystem path.");
  }
  return path.normalize(configuredRoot);
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

export function sanitizeMediaFolder(value: string) {
  return value
    .split(/[\\/]+/g)
    .map(slugify)
    .filter(Boolean)
    .join("/");
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

function shouldIgnoreMediaEntry(name: string) {
  const normalized = name.toLowerCase();
  if (IGNORED_MEDIA_FILE_NAMES.has(normalized) || normalized.startsWith("._") || normalized.startsWith("~rf")) {
    return true;
  }
  if (normalized === "@eadir" || normalized === "@synoeastream" || normalized === ".woodsmith-trash") {
    return true;
  }
  if (normalized.startsWith("synophoto_") || normalized.startsWith("synoindex_") || normalized.includes("synofile_thumb")) {
    return true;
  }
  return false;
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
    if (shouldIgnoreMediaEntry(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (shouldIgnoreMediaEntry(entry.name)) {
        continue;
      }
      walkMedia(absolutePath, root, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = statSync(absolutePath);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
    const rpLower = relativePath.toLowerCase();
    if (rpLower.includes("@eadir") || rpLower.includes("@synoeastream") || rpLower.includes("/.woodsmith-trash/") || rpLower.includes("synofile_thumb") || /(^|\/)synophoto_/i.test(relativePath) || /(^|\/)synoindex_/i.test(relativePath)) {
      continue;
    }

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
  if (!existsSync(root)) {
    return [];
  }

  const files: MediaScanRecord[] = [];
  walkMedia(root, root, files);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function resolveMediaPath(relativePath: string) {
  const root = getMediaRoot();
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalized);
  const rootRelativePath = path.relative(root, absolutePath);

  if (rootRelativePath.startsWith("..") || path.isAbsolute(rootRelativePath)) {
    throw new Error("Media path escapes the configured media root.");
  }

  return absolutePath;
}

export type MediaUploadPolicy = {
  maxBytes?: number;
  allowedMimePrefixes?: string[];
  allowedExtensions?: string[];
};

export async function persistUploadedMedia(file: File, folder = "Uploads", policy: MediaUploadPolicy = {}) {
  const safeFolder = sanitizeMediaFolder(folder) || "uploads";
  const originalName = file.name || "upload";
  const originalExtension = path.extname(originalName) || "";
  const extension = originalExtension.toLowerCase();
  const maxBytes = Math.max(1, policy.maxBytes ?? 250 * 1024 * 1024);
  const allowedMimePrefixes = policy.allowedMimePrefixes ?? ["image/", "video/"];
  const allowedExtensions = new Set((policy.allowedExtensions ?? [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif", ".mp4", ".mov", ".m4v", ".webm"]).map((value) => value.toLowerCase()));
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`Upload must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (!extension || !allowedExtensions.has(extension)) throw new Error("This upload file type is not allowed.");
  if (!allowedMimePrefixes.some((prefix) => file.type.toLowerCase().startsWith(prefix))) throw new Error("The upload content type is not allowed.");
  const stem = slugify(path.basename(originalName, originalExtension)) || `upload-${randomUUID().slice(0, 8)}`;
  const finalName = `${stem}-${randomUUID().slice(0, 8)}${extension.toLowerCase()}`;
  const relativePath = `${safeFolder}/${finalName}`;
  const absolutePath = resolveMediaPath(relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  writeFileSync(absolutePath, Buffer.from(arrayBuffer));
  return relativePath;
}

export function persistGeneratedMedia(base64Image: string, folder = "generated", baseName = "preview", extension = ".png") {
  const safeFolder = sanitizeMediaFolder(folder) || "generated";
  const safeBase = slugify(baseName) || `generated-${randomUUID().slice(0, 8)}`;
  const cleanExtension = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const relativePath = `${safeFolder}/${safeBase}-${randomUUID().slice(0, 8)}${cleanExtension}`;
  const absolutePath = resolveMediaPath(relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, Buffer.from(base64Image, "base64"));
  return relativePath;
}

export function renameMediaAsset(relativePath: string, nextBaseName: string) {
  const nextPath = previewMediaRenamePath(relativePath, nextBaseName);
  return moveMediaAsset(relativePath, nextPath);
}

export function scanMediaAsset(relativePath: string): MediaScanRecord | null {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.split("/").some(shouldIgnoreMediaEntry)) return null;
  const absolutePath = resolveMediaPath(normalized);
  if (!existsSync(absolutePath)) return null;
  const stats = statSync(absolutePath);
  if (!stats.isFile()) return null;
  const fileName = path.posix.basename(normalized);
  return {
    relativePath: normalized,
    folder: path.posix.dirname(normalized) === "." ? "" : path.posix.dirname(normalized),
    fileName,
    kind: detectMediaKind(fileName),
    sizeBytes: stats.size,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    clusterKey: deriveClusterKey(normalized),
    guessedAlt: guessAltFromPath(normalized)
  };
}

export function previewMediaRenamePath(relativePath: string, nextBaseName: string) {
  return previewMediaOrganizePath(relativePath, { baseName: nextBaseName });
}

export function previewMediaOrganizePath(relativePath: string, options: { baseName?: string; folder?: string }) {
  const currentAbsolutePath = resolveMediaPath(relativePath);
  const parsed = path.parse(currentAbsolutePath);
  const baseName = slugify(options.baseName ?? parsed.name) || `media-${randomUUID().slice(0, 8)}`;
  const mediaRoot = getMediaRoot();
  const currentFolder = normalizeRelativePath(path.relative(mediaRoot, parsed.dir));
  const requestedFolder = options.folder == null || options.folder.trim() === ""
    ? currentFolder
    : sanitizeMediaFolder(options.folder);
  const targetDirectory = requestedFolder ? resolveMediaPath(requestedFolder) : mediaRoot;
  const targetAbsolutePath = path.join(targetDirectory, `${baseName}${parsed.ext.toLowerCase()}`);
  if (path.resolve(targetAbsolutePath) === path.resolve(currentAbsolutePath)) {
    return normalizeRelativePath(path.relative(mediaRoot, currentAbsolutePath));
  }
  if (existsSync(targetAbsolutePath)) {
    throw new Error(`A media file named '${path.basename(targetAbsolutePath)}' already exists in this folder.`);
  }
  return normalizeRelativePath(path.relative(mediaRoot, targetAbsolutePath));
}

export function moveMediaAsset(relativePath: string, nextRelativePath: string) {
  const currentAbsolutePath = resolveMediaPath(relativePath);
  const targetAbsolutePath = resolveMediaPath(nextRelativePath);
  if (path.resolve(targetAbsolutePath) === path.resolve(currentAbsolutePath)) return normalizeRelativePath(nextRelativePath);
  if (existsSync(targetAbsolutePath)) throw new Error(`A media file named '${path.basename(targetAbsolutePath)}' already exists in this folder.`);
  mkdirSync(path.dirname(targetAbsolutePath), { recursive: true });
  renameSync(currentAbsolutePath, targetAbsolutePath);
  return normalizeRelativePath(nextRelativePath);
}

export function stageMediaAssetDeletion(relativePath: string) {
  const parsed = path.posix.parse(normalizeRelativePath(relativePath));
  const stagedPath = `.woodsmith-trash/${randomUUID()}-${parsed.base}`;
  moveMediaAsset(relativePath, stagedPath);
  return { originalPath: normalizeRelativePath(relativePath), stagedPath };
}

export function restoreStagedMediaAsset(input: { originalPath: string; stagedPath: string }) {
  return moveMediaAsset(input.stagedPath, input.originalPath);
}

export function finalizeStagedMediaDeletion(input: { stagedPath: string }) {
  const absolutePath = resolveMediaPath(input.stagedPath);
  rmSync(absolutePath, { force: true });
}

export function deleteMediaAsset(relativePath: string) {
  const absolutePath = resolveMediaPath(relativePath);
  rmSync(absolutePath, { force: true });
}
