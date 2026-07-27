export const EDITABLE_PIECE_MEDIA_ROLES = ["hero", "gallery", "detail", "context", "process", "drawing", "plan", "installation", "source"] as const;
export type EditablePieceMediaRole = (typeof EDITABLE_PIECE_MEDIA_ROLES)[number];

export type NormalizedPieceMediaLink = {
  relativePath: string;
  role: EditablePieceMediaRole;
  stage: string | null;
  occurredAt: string | null;
  title: string;
  caption: string;
  technicalNote: string;
  altOverride: string | null;
  displayOrder: number;
  public: boolean;
};

export type PieceMediaEditorLinkInput = {
  relativePath: string;
  role: EditablePieceMediaRole | "private-project";
  stage?: string | null;
  occurredAt?: string | null;
  title?: string;
  caption?: string;
  technicalNote?: string;
  altOverride?: string | null;
  displayOrder?: number;
  public?: boolean;
};

function optionalText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxLength) throw new Error(`Media relation text exceeds ${maxLength} characters.`);
  return normalized;
}

function relativePath(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized.includes("\0")) {
    throw new Error("Media relations require a safe mounted-library relative path.");
  }
  return normalized;
}

function occurredAt(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error("Build-record dates must be valid dates.");
  return parsed.toISOString();
}

export function normalizePieceMediaLinks(value: unknown): NormalizedPieceMediaLink[] {
  if (!Array.isArray(value)) throw new Error("Piece media relations must be a list.");
  if (value.length > 64) throw new Error("A piece cannot contain more than 64 media relations.");
  const seen = new Set<string>();
  let heroCount = 0;
  const links = value.map((entry, index): NormalizedPieceMediaLink => {
    if (!entry || typeof entry !== "object") throw new Error("Each piece media relation must be an object.");
    const record = entry as Record<string, unknown>;
    const role = String(record.role ?? "gallery") as EditablePieceMediaRole;
    if (!(EDITABLE_PIECE_MEDIA_ROLES as readonly string[]).includes(role)) throw new Error(`Unsupported piece media role '${role}'.`);
    if (role === "hero") heroCount += 1;
    const path = relativePath(record.relativePath);
    const stage = optionalText(record.stage, 100) || null;
    const identity = `${path}\0${role}\0${stage ?? ""}`;
    if (seen.has(identity)) throw new Error(`Duplicate '${role}' relation for '${path}'.`);
    seen.add(identity);
    const parsedOrder = Number(record.displayOrder);
    return {
      relativePath: path,
      role,
      stage,
      occurredAt: occurredAt(record.occurredAt),
      title: optionalText(record.title, 160),
      caption: optionalText(record.caption, 1000),
      technicalNote: optionalText(record.technicalNote, 1000),
      altOverride: optionalText(record.altOverride, 400) || null,
      displayOrder: Number.isFinite(parsedOrder) ? Math.max(0, Math.min(9999, Math.round(parsedOrder))) : index,
      public: record.public === true
    };
  });
  if (heroCount > 1) throw new Error("A piece can have only one hero image.");
  return links.sort((left, right) => left.displayOrder - right.displayOrder);
}

export function buildInitialPieceMediaLinks(
  initialLinks: readonly PieceMediaEditorLinkInput[],
  legacyPaths: readonly string[]
): NormalizedPieceMediaLink[] {
  const normalizedInitialLinks = normalizePieceMediaLinks(
    initialLinks.map((link) => ({
      relativePath: link.relativePath,
      role: link.role === "private-project" ? "source" : link.role,
      stage: link.stage ?? null,
      occurredAt: link.occurredAt ?? null,
      title: link.title ?? "",
      caption: link.caption ?? "",
      technicalNote: link.technicalNote ?? "",
      altOverride: link.altOverride ?? null,
      displayOrder: link.displayOrder,
      public: link.public === true
    }))
  );

  const initialDisplayPaths = new Set(
    normalizedInitialLinks
      .filter((link) => ["hero", "gallery", "detail", "context"].includes(link.role))
      .map((link) => link.relativePath)
  );

  const legacyLinks = legacyPaths
    .map((path) => String(path).trim())
    .filter((path) => path && !initialDisplayPaths.has(path))
    .map((path, index): NormalizedPieceMediaLink => ({
      relativePath: path,
      role: initialDisplayPaths.size === 0 && index === 0 ? "hero" : "gallery",
      stage: null,
      occurredAt: null,
      title: "",
      caption: "",
      technicalNote: "",
      altOverride: null,
      displayOrder: normalizedInitialLinks.length + index,
      public: true
    }));

  const normalizedLegacyLinks =
    normalizePieceMediaLinks(
      legacyLinks
    );

  return [
    ...normalizedInitialLinks,
    ...normalizedLegacyLinks
  ].map((link, index) => ({
    ...link,
    displayOrder: index
  }));
}
