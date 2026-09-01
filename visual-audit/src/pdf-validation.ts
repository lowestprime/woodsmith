import fs, { type FileHandle } from "node:fs/promises";

const PDF_HEADER = Buffer.from("%PDF-", "ascii");
const PDF_EOF = Buffer.from("%%EOF", "ascii");
const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const DEFAULT_OVERLAP_BYTES = 64 * 1024;
const PDF_TAIL_BYTES = 64 * 1024;

export interface PdfStructureInspection {
  fileSize: number;
  validHeader: boolean;
  hasEof: boolean;
  pageCount: number;
  hasOutlines: boolean;
  maxDecodedChunkBytes: number;
}

interface PdfInspectionOptions {
  chunkBytes?: number;
  overlapBytes?: number;
}

async function readAt(handle: FileHandle, length: number, position: number) {
  const output = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(output, offset, length - offset, position + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return output.subarray(0, offset);
}

function countNewMatches(text: string, carryLength: number, pattern: RegExp) {
  let count = 0;
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const matchEnd = (match.index ?? 0) + match[0].length;
    if (matchEnd > carryLength) count += 1;
  }
  return count;
}

export async function inspectPdfStructure(
  file: string,
  options: PdfInspectionOptions = {}
): Promise<PdfStructureInspection> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const overlapBytes = options.overlapBytes ?? DEFAULT_OVERLAP_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error("PDF scan chunk size must be a positive safe integer.");
  if (!Number.isSafeInteger(overlapBytes) || overlapBytes < 32) throw new Error("PDF scan overlap must be at least 32 bytes.");

  const handle = await fs.open(file, "r");
  try {
    const { size: fileSize } = await handle.stat();
    const header = await readAt(handle, Math.min(PDF_HEADER.length, fileSize), 0);
    const tailLength = Math.min(PDF_TAIL_BYTES, fileSize);
    const tail = await readAt(handle, tailLength, Math.max(0, fileSize - tailLength));
    const readBuffer = Buffer.allocUnsafe(chunkBytes);
    let carry = Buffer.alloc(0);
    let position = 0;
    let pageCount = 0;
    let hasOutlines = false;
    let maxDecodedChunkBytes = 0;

    while (position < fileSize) {
      const requested = Math.min(chunkBytes, fileSize - position);
      const { bytesRead } = await handle.read(readBuffer, 0, requested, position);
      if (bytesRead === 0) break;

      const combined = Buffer.concat([carry, readBuffer.subarray(0, bytesRead)], carry.length + bytesRead);
      const text = combined.toString("latin1");
      maxDecodedChunkBytes = Math.max(maxDecodedChunkBytes, combined.length);
      pageCount += countNewMatches(text, carry.length, /\/Type\s*\/Page\b/g);
      if (!hasOutlines && /\/Outlines\b/.test(text)) hasOutlines = true;

      carry = Buffer.from(combined.subarray(Math.max(0, combined.length - overlapBytes)));
      position += bytesRead;
    }

    return {
      fileSize,
      validHeader: header.equals(PDF_HEADER),
      hasEof: tail.includes(PDF_EOF),
      pageCount,
      hasOutlines,
      maxDecodedChunkBytes
    };
  } finally {
    await handle.close();
  }
}
