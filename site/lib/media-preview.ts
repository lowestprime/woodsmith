export type MediaPreviewStatus =
  | "available"
  | "unavailable";

export const MEDIA_PREVIEW_INSPECTION_VERSION = 2;
const TECHNICAL_KEYS = ["mediaPreviewStatus", "mediaPreviewReason", "mediaPreviewVersion", "mediaSourceSignature", "mediaSourceWidth", "mediaSourceHeight", "mediaPrimaryBytes"] as const;

export type MediaPreviewInspection = {
  status: MediaPreviewStatus;
  reason: string | null;
  width?: number;
  height?: number;
  primaryBytes?: number;
  sourceSignature?: string;
};

type MediaPreviewRecord = {
  kind: "image" | "video" | "other";
  metadata: Record<string, unknown>;
};

export function mergeMediaPreviewMetadata(
  metadata: Record<string, unknown>,
  inspection: MediaPreviewInspection
) {
  const next: Record<string, unknown> = {
    ...metadata,
    mediaPreviewStatus: inspection.status,
    mediaPreviewVersion: MEDIA_PREVIEW_INSPECTION_VERSION
  };

  if (inspection.reason) {
    next.mediaPreviewReason = inspection.reason;
  } else {
    delete next.mediaPreviewReason;
  }

  for (const [key, value] of [
    ["mediaSourceSignature", inspection.sourceSignature],
    ["mediaSourceWidth", inspection.width],
    ["mediaSourceHeight", inspection.height],
    ["mediaPrimaryBytes", inspection.primaryBytes]
  ] as const) {
    if (value !== undefined) next[key] = value;
    else delete next[key];
  }

  return next;
}

// Client/editor snapshots may preserve editorial metadata, but cannot restore a
// stale technical failure after reindexing or renaming a repaired source.
export function preserveMediaPreviewMetadata(metadata: Record<string, unknown>, trusted: Record<string, unknown>) {
  const next = { ...metadata };
  for (const key of TECHNICAL_KEYS) {
    if (key in trusted) next[key] = trusted[key];
    else delete next[key];
  }
  return next;
}

export function mediaPreviewAvailable(
  media: MediaPreviewRecord | null | undefined
) {
  return Boolean(
    media &&
    (
      media.kind !== "image" ||
      media.metadata.mediaPreviewStatus !== "unavailable"
    )
  );
}

export function mediaPreviewReasonLabel(
  media: MediaPreviewRecord | null | undefined
) {
  const reason = String(
    media?.metadata.mediaPreviewReason ?? ""
  );

  if (reason === "empty-file") return "The source file is empty.";
  if (reason === "unreadable-image") return "The source file cannot be read.";
  if (reason === "source-changed") return "The source changed during inspection. Refresh its preview.";
  if (reason === "missing-file") return "The source file is missing from the mounted library.";
  if (reason === "malformed-jpeg") return "The source JPEG structure is invalid.";
  if (reason.startsWith("invalid-")) return "The file contents do not match its image type.";
  if (reason.startsWith("truncated-")) return "The source image is incomplete.";
  return "The source image cannot be previewed.";
}
