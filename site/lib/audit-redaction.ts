const SENSITIVE_KEY_PATTERN =
  /(?:password|passphrase|secret|token|cookie|authorization|session|body|content|notes?|bio|address|phone|recipient|email|referrer|ip(?:address)?|latitude|longitude|private|attachment|html|text)/i;

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const IPV4_PATTERN =
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

const TOKEN_PATTERN =
  /\b(?:bearer\s+)?[A-Za-z0-9_-]{40,}\b/gi;

function redactString(value: string) {
  const scrubbed = value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(IPV4_PATTERN, "[redacted-network]")
    .replace(TOKEN_PATTERN, "[redacted-token]");
  if (/^https?:\/\//i.test(scrubbed)) {
    try {
      const url = new URL(scrubbed);
      url.search = "";
      url.hash = "";
      return url.toString().slice(0, 240);
    } catch {
      return "[redacted-url]";
    }
  }
  return scrubbed.length > 240
    ? `${scrubbed.slice(0, 237)}...`
    : scrubbed;
}

export function redactAuditPayload(
  value: unknown,
  depth = 0
): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (depth >= 5) {
    return "[redacted-depth]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 24)
      .map((item) => redactAuditPayload(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key)
            ? "[redacted]"
            : redactAuditPayload(item, depth + 1)
        ])
    );
  }
  return String(value);
}

export function redactAuditIdentifier(value: string) {
  const trimmed = value.trim().slice(0, 240);
  if (!trimmed) return "[unknown]";
  return redactString(trimmed);
}

export function maskAuditActor(value: string | null) {
  if (!value) return "System";
  const [name, domain] = value.split("@");
  if (!name || !domain) return "Administrator";
  return `${name.slice(0, 2)}***@${domain}`;
}
