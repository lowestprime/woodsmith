export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatMoney(cents: number | null | undefined, currency = "USD") {
  if (cents == null) {
    return "By quote";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export function formatLeadTime(days: number | null | undefined) {
  if (!days) {
    return "Lead time confirmed after review";
  }

  const weeks = Math.max(1, Math.round(days / 7));
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function toMediaUrl(assetPath: string) {
  return `/media/${assetPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function sentenceCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
