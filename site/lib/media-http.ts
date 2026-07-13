export type MediaFileVersion = { size: number; mtimeMs: number };

export function mediaEntityTag(file: MediaFileVersion) {
  return `"${Math.max(0, file.size).toString(16)}-${Math.max(0, Math.trunc(file.mtimeMs)).toString(16)}"`;
}

export function mediaLastModified(file: MediaFileVersion) {
  return new Date(file.mtimeMs).toUTCString();
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
  return Math.floor(file.mtimeMs / 1000) * 1000 <= parsed;
}
