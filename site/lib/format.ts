export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function toMediaUrl(assetPath: string) {
  return `/media/${assetPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
