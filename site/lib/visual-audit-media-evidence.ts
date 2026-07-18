import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";

import { resolveMediaPath } from "./media.ts";

export const MEDIA_PROVENANCES = ["synthetic-fixture", "production-clone", "production-live", "unverified"] as const;
export type MediaProvenance = (typeof MEDIA_PROVENANCES)[number];

type PageLike = {
  slug: string;
  status: string;
  body: string;
  sections: Array<Record<string, unknown>>;
  heroMediaPath: string | null;
};

type PieceLike = {
  slug: string;
  publicationStatus: string;
  story: string;
  mediaPaths: string[];
  metadata: Record<string, unknown>;
};

type PieceMediaLinkLike = {
  pieceSlug: string;
  relativePath: string;
  role: string;
  public: boolean;
};

type PostLike = {
  slug: string;
  publicationStatus: string;
  body: string;
  coverMediaPath: string | null;
};

type UserLike = {
  avatarPath: string | null;
  publicProfile: boolean;
};

type MediaLike = {
  relativePath: string;
  kind: "image" | "video" | "other";
  tags: string[];
  metadata: Record<string, unknown>;
};

type MediaFileVersion = {
  size: number;
  mtimeMs: number;
};

export type PublicMediaEvidence = {
  provenance: MediaProvenance;
  databaseRecords: number;
  publicReferenced: number;
  publicPresent: number;
  missingPublic: number;
  publicImages: number;
  publicVideos: number;
  publicBytes: number;
  syntheticMarkers: number;
  publicReferenceDigest: string;
  publicMountDigest: string;
};

function sha256(lines: string[]) {
  return createHash("sha256").update(lines.sort().join("\n")).digest("hex");
}

function normalizeReference(value: string) {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed) return "";
  if (trimmed.startsWith("/media/")) {
    try {
      return trimmed.slice("/media/".length).split("/").map(decodeURIComponent).join("/");
    } catch {
      return "";
    }
  }
  return trimmed.replace(/^\/+/, "");
}

function collectReferencesFromText(text: string, knownPaths: Set<string>, output: Set<string>) {
  const direct = normalizeReference(text);
  if (knownPaths.has(direct)) output.add(direct);

  for (const match of text.matchAll(/\/media\/([^\s"'<>?#)]+)/g)) {
    const reference = normalizeReference(`/media/${match[1] ?? ""}`);
    if (knownPaths.has(reference)) output.add(reference);
  }
}

function collectReferences(value: unknown, knownPaths: Set<string>, output: Set<string>, depth = 0) {
  if (depth > 10 || value == null) return;
  if (typeof value === "string") {
    collectReferencesFromText(value, knownPaths, output);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, knownPaths, output, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectReferences(nested, knownPaths, output, depth + 1);
    }
  }
}

function containsSyntheticMarker(media: MediaLike) {
  const metadataValues = Object.entries(media.metadata)
    .filter(([key]) => /(?:source|provenance|fixture|synthetic|audit)/i.test(key))
    .map(([, value]) => String(value));
  const searchable = [media.relativePath, ...media.tags, ...metadataValues].join(" ").toLowerCase();
  return /(?:visual[-_ ]?audit[-_ ]?fixture|audit[-_ ]?example|synthetic[-_ ]?(?:fixture|media|asset))/.test(searchable);
}

function mountedVersion(relativePath: string): MediaFileVersion | null {
  try {
    const absolutePath = resolveMediaPath(relativePath);
    if (!existsSync(absolutePath)) return null;
    const stats = statSync(absolutePath);
    return stats.isFile() ? { size: stats.size, mtimeMs: stats.mtimeMs } : null;
  } catch {
    return null;
  }
}

export function parseMediaProvenance(value: string | undefined): MediaProvenance {
  const normalized = value?.trim().toLowerCase() ?? "";
  return MEDIA_PROVENANCES.includes(normalized as MediaProvenance)
    ? normalized as MediaProvenance
    : "unverified";
}

export function buildPublicMediaEvidence(input: {
  provenance: MediaProvenance;
  databaseRecords: number;
  pages: PageLike[];
  pieces: PieceLike[];
  pieceMediaLinks: PieceMediaLinkLike[];
  posts: PostLike[];
  users: UserLike[];
  media: MediaLike[];
  versionForPath?: (relativePath: string) => MediaFileVersion | null;
}): PublicMediaEvidence {
  const knownMedia = new Map(input.media.map((record) => [normalizeReference(record.relativePath), record]));
  const knownPaths = new Set(knownMedia.keys());
  const references = new Set<string>();

  for (const page of input.pages.filter((record) => record.status === "published")) {
    collectReferences(page.heroMediaPath, knownPaths, references);
    collectReferences(page.body, knownPaths, references);
    collectReferences(page.sections, knownPaths, references);
  }

  const publicLinksByPiece = new Map<string, PieceMediaLinkLike[]>();
  for (const link of input.pieceMediaLinks.filter((record) => record.public)) {
    const records = publicLinksByPiece.get(link.pieceSlug) ?? [];
    records.push(link);
    publicLinksByPiece.set(link.pieceSlug, records);
  }

  const displayRoles = new Set(["hero", "gallery", "detail", "context"]);
  for (const piece of input.pieces.filter((record) => record.publicationStatus === "published")) {
    const links = publicLinksByPiece.get(piece.slug) ?? [];
    for (const link of links) collectReferences(link.relativePath, knownPaths, references);
    if (!links.some((link) => displayRoles.has(link.role))) {
      collectReferences(piece.mediaPaths, knownPaths, references);
    }
    collectReferences(piece.story, knownPaths, references);
  }

  for (const post of input.posts.filter((record) => record.publicationStatus === "published")) {
    collectReferences(post.coverMediaPath, knownPaths, references);
    collectReferences(post.body, knownPaths, references);
  }

  for (const user of input.users.filter((record) => record.publicProfile)) {
    collectReferences(user.avatarPath, knownPaths, references);
  }

  const versionForPath = input.versionForPath ?? mountedVersion;
  const mounted: Array<{ path: string; version: MediaFileVersion; media: MediaLike }> = [];
  let missingPublic = 0;
  for (const relativePath of [...references].sort()) {
    const version = versionForPath(relativePath);
    const media = knownMedia.get(relativePath);
    if (!version || !media) {
      missingPublic += 1;
      continue;
    }
    mounted.push({ path: relativePath, version, media });
  }

  return {
    provenance: input.provenance,
    databaseRecords: Math.max(0, Math.trunc(input.databaseRecords)),
    publicReferenced: references.size,
    publicPresent: mounted.length,
    missingPublic,
    publicImages: mounted.filter((item) => item.media.kind === "image").length,
    publicVideos: mounted.filter((item) => item.media.kind === "video").length,
    publicBytes: mounted.reduce((total, item) => total + item.version.size, 0),
    syntheticMarkers: input.media.filter(containsSyntheticMarker).length,
    publicReferenceDigest: sha256([...references]),
    publicMountDigest: sha256(mounted.map((item) => `${item.path}\0${item.version.size}\0${item.version.mtimeMs.toFixed(3)}`))
  };
}
