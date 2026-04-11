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
  if (days == null || days < 0) {
    return "Lead time confirmed after review";
  }

  const weeks = Math.max(1, Math.round(days / 7));
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function formatDimensions(value: { width: number; depth: number; height: number; unit: string } | null | undefined) {
  if (!value) {
    return "Sized during review";
  }

  return `${value.width} × ${value.depth} × ${value.height} ${value.unit}`;
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

export function resolveAssetUrl(assetPath: string | null | undefined) {
  if (!assetPath) {
    return "";
  }

  if (assetPath.startsWith("profiles/")) {
    return `/${assetPath}`;
  }

  if (assetPath.startsWith("/")) {
    return assetPath;
  }

  return toMediaUrl(assetPath);
}

export function sentenceCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

const SANITIZE_TAG_ALLOW = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "a", "strong", "em", "code", "pre", "blockquote", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "span", "div", "section", "article", "details", "summary", "sup", "sub", "del", "ins", "mark"]);
const SANITIZE_ATTR_ALLOW = new Set(["href", "src", "alt", "title", "class", "id", "target", "rel", "width", "height", "loading"]);

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, "")
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\bon\w+\s*=[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<(\/?)(\w+)([^>]*)>/g, (match, slash, tag, attrs) => {
      const lowerTag = tag.toLowerCase();
      if (!SANITIZE_TAG_ALLOW.has(lowerTag)) return "";
      if (slash) return `</${lowerTag}>`;
      const cleanAttrs = (attrs as string).replace(/(\w[\w-]*)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g, (_, name: string, value: string) => {
        if (!SANITIZE_ATTR_ALLOW.has(name.toLowerCase())) return "";
        return value ? `${name.toLowerCase()}${value}` : name.toLowerCase();
      });
      return `<${lowerTag}${cleanAttrs}>`;
    });
}
