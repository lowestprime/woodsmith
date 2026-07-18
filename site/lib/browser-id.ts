export type BrowserRandomSource = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

let fallbackSequence = 0;

function uuidFromBytes(bytes: Uint8Array) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function browserOperationId(
  source: BrowserRandomSource | null = globalThis.crypto as unknown as BrowserRandomSource
) {
  if (typeof source?.randomUUID === "function") {
    try {
      return source.randomUUID.call(source);
    } catch {
      // randomUUID is restricted to secure contexts in some browsers.
    }
  }

  if (typeof source?.getRandomValues === "function") {
    return uuidFromBytes(source.getRandomValues(new Uint8Array(16)));
  }

  // These IDs deduplicate client operations; authorization secrets are server-generated.
  fallbackSequence += 1;
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${fallbackSequence.toString(36)}`;
}
