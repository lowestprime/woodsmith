export type MediaPreviewStatus =
  | "available"
  | "unavailable";

export type MediaPreviewInspection = {
  status: MediaPreviewStatus;
  reason: string | null;
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
    mediaPreviewStatus: inspection.status
  };

  if (inspection.reason) {
    next.mediaPreviewReason = inspection.reason;
  } else {
    delete next.mediaPreviewReason;
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
  if (reason.startsWith("invalid-")) return "The file contents do not match its image type.";
  if (reason.startsWith("truncated-")) return "The source image is incomplete.";
  return "The source image cannot be previewed.";
}
