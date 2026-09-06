import { readSync } from "node:fs";

type JpegStructure =
  | { status: "available"; reason: null; width: number; height: number; primaryBytes: number }
  | { status: "unavailable"; reason: "invalid-jpeg-signature" | "malformed-jpeg" | "truncated-jpeg" };

// JPEG markers describe the primary codestream. EXIF thumbnails and appended
// gain maps/motion video can contain their own markers; neither is a footer.
// This checks structural completeness, not entropy decoding or photo identity.
export function inspectJpegStructure(descriptor: number, size: number): JpegStructure {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  let bufferStart = -1;
  let bufferLength = 0;
  function byte() {
    if (offset >= size) return -1;
    if (offset < bufferStart || offset >= bufferStart + bufferLength) {
      bufferStart = offset;
      bufferLength = readSync(descriptor, buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (!bufferLength) return -1;
    }
    return buffer[offset++ - bufferStart];
  }
  function word() {
    const high = byte();
    const low = byte();
    return high < 0 || low < 0 ? -1 : (high << 8) | low;
  }
  const fail = (reason: "invalid-jpeg-signature" | "malformed-jpeg" | "truncated-jpeg"): JpegStructure => ({ status: "unavailable", reason });
  if (word() !== 0xffd8) return fail("invalid-jpeg-signature");
  let width = 0;
  let height = 0;
  let frame = false;
  let scans = 0;
  let entropy = false;
  let entropyBytes = 0;

  while (offset < size) {
    let prefix = byte();
    if (entropy) {
      while (prefix >= 0 && prefix !== 0xff) {
        entropyBytes += 1;
        // Skip to the next marker within the current buffer in native code.
        const found = buffer.indexOf(0xff, offset - bufferStart);
        const end = found >= 0 && found < bufferLength ? bufferStart + found : bufferStart + bufferLength;
        entropyBytes += end - offset;
        offset = end;
        prefix = byte();
      }
    }
    if (prefix < 0) return fail("truncated-jpeg");
    if (prefix !== 0xff) return fail("malformed-jpeg");
    let marker = byte();
    while (marker === 0xff) marker = byte();
    if (marker < 0) return fail("truncated-jpeg");
    if (entropy && marker === 0x00) {
      entropyBytes += 1;
      continue;
    }
    if (entropy && ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01)) continue;
    const wasEntropy = entropy;
    entropy = false;
    if (marker === 0xd9) {
      return frame && scans > 0 && width > 0 && height > 0 && entropyBytes > 0
        ? { status: "available", reason: null, width, height, primaryBytes: offset }
        : fail("malformed-jpeg");
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return fail("malformed-jpeg");
    if (marker === 0x01) continue;
    const length = word();
    if (length < 0) return fail("truncated-jpeg");
    if (length < 2) return fail("malformed-jpeg");
    const segmentEnd = offset + length - 2;
    if (segmentEnd > size) return fail("truncated-jpeg");
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 8) return fail("malformed-jpeg");
      const precision = byte();
      height = word();
      width = word();
      const components = byte();
      if (![8, 12, 16].includes(precision) || width <= 0 || components <= 0 || length !== 8 + 3 * components) return fail("malformed-jpeg");
      frame = true;
    } else if (marker === 0xda) {
      if (!frame || length < 6) return fail("malformed-jpeg");
      const components = byte();
      if (components <= 0 || components > 4 || length !== 6 + 2 * components) return fail("malformed-jpeg");
      scans += 1;
      entropy = true;
    } else if (marker === 0xdc) {
      if (!frame || !wasEntropy || height !== 0 || length !== 4) return fail("malformed-jpeg");
      height = word();
      if (height <= 0) return fail("malformed-jpeg");
      entropy = true;
    }
    offset = segmentEnd;
  }
  return fail("truncated-jpeg");
}
