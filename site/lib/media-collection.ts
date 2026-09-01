export const MEDIA_COLLECTION_VARIANTS = ["detail-stage", "editorial-grid", "process-sequence", "picker-grid", "single"] as const;

export type MediaCollectionVariant = (typeof MEDIA_COLLECTION_VARIANTS)[number];

export type MediaCollectionItem = {
  id: string;
  src: string;
  alt: string;
  kind?: "image" | "video";
  focalX?: number;
  focalY?: number;
  zoom?: number;
  cleanupMode?: string;
  caption?: string;
  title?: string;
  stage?: string | null;
  occurredAt?: string | null;
  role?: string;
  order: number;
};

export type MediaPreviewSlot = "primary" | "thumbnail" | "grid";

export function normalizeMediaCollectionItems(items: MediaCollectionItem[]) {
  const seen = new Set<string>();
  const normalized = items.map((item, sourceIndex) => {
    const id = item.id.trim();
    if (!id) throw new Error("Media collection items require a stable identity.");
    if (seen.has(id)) throw new Error(`Media collection identity is duplicated: ${id}`);
    if (!item.src.trim()) throw new Error(`Media collection item ${id} is missing a source.`);
    if (!item.alt.trim()) throw new Error(`Media collection item ${id} is missing alt text.`);
    seen.add(id);
    return {
      ...item,
      id,
      kind: item.kind ?? "image" as const,
      order: Number.isFinite(item.order) ? item.order : sourceIndex,
      sourceIndex
    };
  });

  return normalized
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
    .map(({ sourceIndex: _sourceIndex, ...item }) => item);
}

export function mediaPreviewPolicy(input: {
  variant: MediaCollectionVariant;
  slot: MediaPreviewSlot;
  index: number;
  preloadFirst?: boolean;
}) {
  const preload = Boolean(input.preloadFirst && input.slot === "primary" && input.index === 0);
  const sizes = input.slot === "thumbnail"
    ? "(max-width: 520px) 27vw, 8rem"
    : input.variant === "editorial-grid" || input.variant === "process-sequence" || input.variant === "picker-grid"
      ? "(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 34vw"
      : "(max-width: 760px) 100vw, (max-width: 1200px) 58vw, 48rem";

  return { preload, loading: preload ? undefined : "lazy" as const, sizes };
}

export function mediaItemHeading(item: MediaCollectionItem, index: number) {
  return item.stage?.trim() || item.title?.trim() || item.role?.replaceAll("-", " ").trim() || `Item ${index + 1}`;
}

export function formatMediaDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(date);
}
