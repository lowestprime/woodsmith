export const MEDIA_CROP_ASPECTS = ["free", "square", "portrait", "wide"] as const;
export const MEDIA_CROP_MIN_ZOOM = 1;
export const MEDIA_CROP_MAX_ZOOM = 4;
export type MediaCropAspect = typeof MEDIA_CROP_ASPECTS[number];

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

// Normalize persisted editor defaults only. Server request validation still
// rejects explicitly invalid submissions rather than silently accepting them.
export function normalizeMediaCrop(input: { focalX?: unknown; focalY?: unknown; zoom?: unknown; cropAspect?: unknown }) {
  return {
    focalX: bounded(input.focalX, 50, 0, 100),
    focalY: bounded(input.focalY, 50, 0, 100),
    zoom: bounded(input.zoom, 1, MEDIA_CROP_MIN_ZOOM, MEDIA_CROP_MAX_ZOOM),
    cropAspect: MEDIA_CROP_ASPECTS.includes(input.cropAspect as MediaCropAspect) ? input.cropAspect as MediaCropAspect : "free" as const
  };
}

export function mediaCropFormFields(data: FormData) {
  return {
    focalX: Number(data.get("focalX") ?? 50),
    focalY: Number(data.get("focalY") ?? 50),
    zoom: Number(data.get("zoom") ?? 1),
    cropAspect: String(data.get("cropAspect") ?? "free") as MediaCropAspect
  };
}
