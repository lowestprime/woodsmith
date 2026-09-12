import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { inspectJpegStructure } from "./jpeg-structure.ts";
import { MEDIA_PREVIEW_INSPECTION_VERSION } from "./media-preview.ts";

import type {
  MediaPreviewInspection
} from "./media-preview.ts";

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
  preview: MediaPreviewInspection;
};

export function getMediaRoot() {
  const configuredRoot = process.env.MEDIA_ROOT?.trim() || DEFAULT_MEDIA_ROOT;
  if (!path.isAbsolute(configuredRoot)) {
    throw new Error("MEDIA_ROOT must be an absolute filesystem path.");
  }
  return path.normalize(configuredRoot);
}

export function getMediaUrl(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);

  return `/media/${normalized
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

function bufferStartsWith(
  buffer: Buffer,
  signature: readonly number[]
) {
  return signature.every(
    (value, index) => buffer[index] === value
  );
}

function unavailable(reason: string): MediaPreviewInspection {
  return { status: "unavailable", reason };
}

function inspectMediaPreviewBytes(
  descriptor: number,
  fileName: string,
  kind: MediaKind,
  sizeBytes: number
): MediaPreviewInspection {
  if (kind !== "image") {
    return { status: "available", reason: null };
  }
  if (sizeBytes <= 0) return unavailable("empty-file");

  const extension = path.extname(fileName).toLowerCase();
  const headLength = Math.min(4_096, sizeBytes);
  const tailLength = Math.min(4_096, sizeBytes);
  const head = Buffer.alloc(headLength);
  const tail = Buffer.alloc(tailLength);
  try {
    const headRead = readSync(
      descriptor,
      head,
      0,
      headLength,
      0
    );
    const tailRead = readSync(
      descriptor,
      tail,
      0,
      tailLength,
      Math.max(0, sizeBytes - tailLength)
    );
    const header = head.subarray(0, headRead);
    const footer = tail.subarray(0, tailRead);

    if (extension === ".jpg" || extension === ".jpeg") {
      return inspectJpegStructure(descriptor, sizeBytes);
    }

    if (extension === ".png") {
      if (!bufferStartsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return unavailable("invalid-png-signature");
      }
      return footer.includes(Buffer.from("IEND", "ascii"))
        ? { status: "available", reason: null }
        : unavailable("truncated-png");
    }

    if (extension === ".gif") {
      const signature = header.subarray(0, 6).toString("ascii");
      if (signature !== "GIF87a" && signature !== "GIF89a") {
        return unavailable("invalid-gif-signature");
      }
      return footer.includes(0x3b)
        ? { status: "available", reason: null }
        : unavailable("truncated-gif");
    }

    if (extension === ".webp") {
      const signatureValid =
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "WEBP";
      if (!signatureValid || header.length < 12) {
        return unavailable("invalid-webp-signature");
      }
      const declaredBytes = header.readUInt32LE(4) + 8;
      return declaredBytes <= sizeBytes
        ? { status: "available", reason: null }
        : unavailable("truncated-webp");
    }

    if (extension === ".svg") {
      const source = header.toString("utf8").replace(/^\ufeff/, "").toLowerCase();
      return source.includes("<svg")
        ? { status: "available", reason: null }
        : unavailable("invalid-svg-signature");
    }

    if (extension === ".bmp") {
      return header.subarray(0, 2).toString("ascii") === "BM"
        ? { status: "available", reason: null }
        : unavailable("invalid-bmp-signature");
    }

    if (extension === ".tif" || extension === ".tiff") {
      const littleEndian = bufferStartsWith(header, [0x49, 0x49, 0x2a, 0x00]);
      const bigEndian = bufferStartsWith(header, [0x4d, 0x4d, 0x00, 0x2a]);
      return littleEndian || bigEndian
        ? { status: "available", reason: null }
        : unavailable("invalid-tiff-signature");
    }

    if ([".avif", ".heic", ".heif"].includes(extension)) {
      return header.subarray(4, 8).toString("ascii") === "ftyp"
        ? { status: "available", reason: null }
        : unavailable("invalid-bmff-signature");
    }

    return { status: "available", reason: null };
  } catch {
    return unavailable("unreadable-image");
  }
}

const previewCache = new Map<string, { signature: string; inspection: MediaPreviewInspection }>();

export function inspectMediaPreviewFile(absolutePath: string, fileName: string, kind: MediaKind, sizeBytes: number, options: { force?: boolean } = {}): MediaPreviewInspection {
  if (kind !== "image") return { status: "available", reason: null };
  let descriptor: number | undefined;
  try {
    descriptor = openSync(absolutePath, "r");
    const fingerprint = () => {
      const stat = fstatSync(descriptor!, { bigint: true });
      return createHash("sha256").update([MEDIA_PREVIEW_INSPECTION_VERSION, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":")).digest("hex");
    };
    const before = fingerprint();
    const actualSize = Number(fstatSync(descriptor).size);
    // Some filesystems preserve timestamps, or coalesce immediate writes. A
    // content revision also detects same-size edits with identical stat values.
    const hash = createHash("sha256").update(`preview-v${MEDIA_PREVIEW_INSPECTION_VERSION}:`);
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < actualSize) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, actualSize - position), position);
      if (!count) return unavailable("source-changed");
      hash.update(chunk.subarray(0, count));
      position += count;
    }
    const signature = hash.digest("hex");
    const cached = previewCache.get(absolutePath);
    const inspection = !options.force && cached?.signature === signature
      ? cached.inspection : inspectMediaPreviewBytes(descriptor, fileName, kind, actualSize);
    // Detect writes and atomic replacements during inspection.
    const current = statSync(absolutePath, { bigint: true });
    const inspected = fstatSync(descriptor, { bigint: true });
    if (before !== fingerprint() || current.ino !== inspected.ino || current.dev !== inspected.dev) return unavailable("source-changed");
    const result = { ...inspection, sourceSignature: signature };
    previewCache.delete(absolutePath);
    if (previewCache.size >= 512) previewCache.delete(previewCache.keys().next().value!);
    previewCache.set(absolutePath, { signature, inspection: result });
    return { ...result };
  } catch {
    return unavailable("unreadable-image");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
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
      guessedAlt: guessAltFromPath(relativePath),
      preview: inspectMediaPreviewFile(
        absolutePath,
        entry.name,
        detectMediaKind(entry.name),
        stats.size
      )
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

export function scanMediaAsset(relativePath: string, options: { force?: boolean } = {}): MediaScanRecord | null {
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
    guessedAlt: guessAltFromPath(normalized),
    preview: inspectMediaPreviewFile(
      absolutePath,
      fileName,
      detectMediaKind(fileName),
      stats.size,
      options
    )
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
