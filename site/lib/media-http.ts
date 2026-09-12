export type MediaFileVersion = { size: number; mtimeMs: number; ctimeMs?: number };

export type MediaByteRange = {
  start: number;
  end: number;
  length: number;
};

export type MediaByteRangeResult =
  | { kind: "none" }
  | { kind: "range"; range: MediaByteRange }
  | { kind: "unsatisfiable" };

export function mediaEntityTag(file: MediaFileVersion) {
  const changed = file.ctimeMs === undefined ? "" : `-${Math.max(0, file.ctimeMs).toString(16)}`;
  return `"${Math.max(0, file.size).toString(16)}-${Math.max(0, file.mtimeMs).toString(16)}${changed}"`;
}

export function mediaLastModified(file: MediaFileVersion) {
  return new Date(Math.max(file.mtimeMs, file.ctimeMs ?? 0)).toUTCString();
}

export function mediaRequestIsFresh(headers: Headers, file: MediaFileVersion) {
  const etag = mediaEntityTag(file);
  const match = headers.get("if-none-match");
  if (match) {
    return match.split(",").map((entry) => entry.trim()).some((entry) => entry === "*" || entry === etag || entry === `W/${etag}`);
  }
  const modifiedSince = headers.get("if-modified-since");
  if (!modifiedSince) return false;
  const parsed = Date.parse(modifiedSince);
  if (!Number.isFinite(parsed)) return false;
  return Math.floor(Math.max(file.mtimeMs, file.ctimeMs ?? 0) / 1000) * 1000 <= parsed;
}

export function mediaIfRangeMatches(headers: Headers, file: MediaFileVersion) {
  const value = headers.get("if-range")?.trim();
  if (!value) return true;

  if (value.startsWith('"')) return value === mediaEntityTag(file);
  if (value.startsWith("W/")) return false;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return Math.floor(Math.max(file.mtimeMs, file.ctimeMs ?? 0) / 1000) * 1000 <= parsed;
}

export function resolveMediaByteRange(value: string | null, size: number): MediaByteRangeResult {
  if (!value) return { kind: "none" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return { kind: "none" };
  if (!Number.isSafeInteger(size) || size <= 0) return { kind: "unsatisfiable" };

  const [, startText, endText] = match;
  if (!startText && !endText) return { kind: "none" };

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "unsatisfiable" };
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    if (!Number.isSafeInteger(start) || start >= size) {
      return { kind: "unsatisfiable" };
    }

    end = endText ? Number(endText) : size - 1;
    if (!Number.isSafeInteger(end) || end < start) {
      return { kind: "unsatisfiable" };
    }
    end = Math.min(end, size - 1);
  }

  return {
    kind: "range",
    range: { start, end, length: end - start + 1 }
  };
}
