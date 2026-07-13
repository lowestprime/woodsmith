import path from "node:path";
import type { MediaOperationSnapshot, PieceMediaLinkRecord, PieceMediaRole } from "./db.ts";
import { moveMediaAsset, previewMediaOrganizePath, scanMediaAsset } from "./media.ts";

export type MediaBatchOptions = {
  folder?: string;
  renamePattern?: string;
  pieceAssignment: "keep" | "clear" | "set";
  pieceSlug?: string;
  role: "keep" | PieceMediaRole;
  stageMode: "keep" | "clear" | "set";
  stage?: string;
  visibility: "keep" | "private" | "public";
  review: "keep" | "unreviewed" | "reviewed";
  addTags: string[];
  removeTags: string[];
  photoQuality?: "keep" | "unrated" | "shop-ready" | "portfolio-ready" | "background-distracting" | "needs-reshoot";
  actorEmail?: string | null;
};

export type MediaOperationMutation = {
  before: MediaOperationSnapshot;
  after: MediaOperationSnapshot;
};

export type MovedMediaAsset = {
  previousPath: string;
  nextPath: string;
};

function applyRenamePattern(pattern: string, relativePath: string, index: number) {
  const parsed = path.posix.parse(relativePath);
  const folderName = parsed.dir.split("/").filter(Boolean).at(-1) ?? "media";
  return pattern
    .replaceAll("{name}", parsed.name)
    .replaceAll("{index}", String(index + 1).padStart(3, "0"))
    .replaceAll("{folder}", folderName);
}

function remapLinkPath(link: PieceMediaLinkRecord, relativePath: string): PieceMediaLinkRecord {
  return { ...link, relativePath };
}

function nextLinks(
  before: MediaOperationSnapshot,
  relativePath: string,
  options: MediaBatchOptions,
  timestamp: string
) {
  let links = before.links.map((link) => remapLinkPath(link, relativePath));
  if (options.pieceAssignment === "clear") {
    links = [];
  } else if (options.pieceAssignment === "set") {
    if (!options.pieceSlug) throw new Error("Choose a piece before assigning selected media.");
    const previous = links.find((link) => link.pieceSlug === options.pieceSlug) ?? links[0];
    links = [{
      id: previous?.id ?? "",
      pieceSlug: options.pieceSlug,
      relativePath,
      role: options.role === "keep" ? previous?.role ?? "gallery" : options.role,
      stage: options.stageMode === "keep" ? previous?.stage ?? null : options.stageMode === "clear" ? null : options.stage?.trim() || null,
      occurredAt: previous?.occurredAt ?? null,
      title: previous?.title ?? "",
      caption: previous?.caption ?? "",
      technicalNote: previous?.technicalNote ?? "",
      altOverride: previous?.altOverride ?? null,
      displayOrder: previous?.displayOrder ?? 0,
      public: options.visibility === "public" ? true : options.visibility === "private" ? false : previous?.public ?? false,
      legacySynced: false,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp
    }];
  } else {
    links = links.map((link) => ({
      ...link,
      role: options.role === "keep" ? link.role : options.role,
      stage: options.stageMode === "keep" ? link.stage : options.stageMode === "clear" ? null : options.stage?.trim() || null,
      public: options.visibility === "public" ? true : options.visibility === "private" ? false : link.public,
      updatedAt: timestamp
    }));
  }
  const identities = new Set<string>();
  return links.filter((link) => {
    const identity = `${link.pieceSlug}\u0000${link.role}\u0000${link.stage ?? ""}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

function snapshotsDiffer(left: MediaOperationSnapshot, right: MediaOperationSnapshot) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function buildMediaOperationPlan(snapshots: MediaOperationSnapshot[], options: MediaBatchOptions): MediaOperationMutation[] {
  if (snapshots.length === 0) throw new Error("Select at least one media item.");
  if (snapshots.length > 96) throw new Error("A media batch can contain at most 96 items.");
  if (options.stageMode === "set" && !options.stage?.trim()) throw new Error("Enter a build stage or choose Keep/Clear stage.");
  const hasRequestedChange = Boolean(options.folder?.trim())
    || Boolean(options.renamePattern?.trim() && options.renamePattern.trim() !== "{name}")
    || options.pieceAssignment !== "keep"
    || options.role !== "keep"
    || options.stageMode !== "keep"
    || options.visibility !== "keep"
    || options.review !== "keep"
    || options.addTags.length > 0
    || options.removeTags.length > 0
    || Boolean(options.photoQuality && options.photoQuality !== "keep");
  if (!hasRequestedChange) throw new Error("Choose at least one folder, name, assignment, role, stage, review, tag, or quality change.");
  const timestamp = new Date().toISOString();
  const pattern = options.renamePattern?.trim() || "{name}";
  const removeTags = new Set(options.removeTags.map((tag) => tag.toLowerCase()));
  const targets = new Set<string>();

  const mutations = snapshots.map((before, index): MediaOperationMutation => {
    const nextBaseName = applyRenamePattern(pattern, before.media.relativePath, index);
    const relativePath = previewMediaOrganizePath(before.media.relativePath, {
      baseName: nextBaseName,
      folder: options.folder
    });
    if (targets.has(relativePath)) throw new Error(`Two selected files would be moved to '${relativePath}'. Change the rename pattern.`);
    targets.add(relativePath);

    const links = nextLinks(before, relativePath, options, timestamp);
    const assignedPiece = options.pieceAssignment === "clear"
      ? null
      : options.pieceAssignment === "set"
        ? options.pieceSlug ?? null
        : before.media.pieceSlug;
    const reviewed = options.visibility === "public" || options.review === "reviewed"
      ? true
      : options.review === "unreviewed"
        ? false
        : before.media.reviewed;
    const publicLinks = reviewed ? links : links.map((link) => ({ ...link, public: false }));
    const tags = [...new Set([
      ...before.media.tags.filter((tag) => !removeTags.has(tag.toLowerCase())),
      ...options.addTags
    ].filter(Boolean))];
    const metadata = {
      ...before.media.metadata,
      ...(options.photoQuality && options.photoQuality !== "keep" ? { photoQuality: options.photoQuality } : {}),
      batchOrganizedAt: timestamp,
      batchOrganizedBy: options.actorEmail ?? null
    };
    const after: MediaOperationSnapshot = {
      media: {
        ...before.media,
        relativePath,
        folder: path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath),
        fileName: path.posix.basename(relativePath),
        pieceSlug: assignedPiece,
        reviewed,
        tags,
        metadata
      },
      links: publicLinks
    };
    return { before, after };
  });

  if (!mutations.some((mutation) => snapshotsDiffer(mutation.before, mutation.after))) {
    throw new Error("The selected batch does not change any media records.");
  }
  return mutations;
}

export function moveMediaOperationFiles(mutations: MediaOperationMutation[]) {
  const moved: MovedMediaAsset[] = [];
  try {
    for (const mutation of mutations) {
      const previousPath = mutation.before.media.relativePath;
      const nextPath = mutation.after.media.relativePath;
      if (previousPath === nextPath) continue;
      const current = scanMediaAsset(previousPath);
      if (!current) throw new Error(`Media '${previousPath}' is no longer present in the mounted library.`);
      if (mutation.before.media.sizeBytes > 0 && current.sizeBytes !== mutation.before.media.sizeBytes) {
        throw new Error(`Media '${previousPath}' changed on disk after this operation was prepared.`);
      }
      moveMediaAsset(previousPath, nextPath);
      moved.push({ previousPath, nextPath });
    }
    return moved;
  } catch (error) {
    try {
      restoreMediaOperationFiles(moved);
    } catch (rollbackError) {
      throw new Error(`Media move failed and filesystem rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: error });
    }
    throw error;
  }
}

export function restoreMediaOperationFiles(moved: MovedMediaAsset[]) {
  const failures: string[] = [];
  for (const item of [...moved].reverse()) {
    try {
      moveMediaAsset(item.nextPath, item.previousPath);
    } catch (error) {
      failures.push(`${item.nextPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(`Could not restore ${failures.length} media file(s): ${failures.join("; ")}`);
}

export function invertMediaOperationPlan(items: Array<{ before: MediaOperationSnapshot; after: MediaOperationSnapshot }>) {
  return items.map((item) => ({ before: item.after, after: item.before }));
}
