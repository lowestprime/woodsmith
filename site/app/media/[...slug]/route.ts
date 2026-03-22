import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4"
};

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const mediaRoot = path.resolve(process.cwd(), "..", "pics");
  const filePath = path.resolve(mediaRoot, ...slug);
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(mediaRoot) || !MIME_TYPES[extension]) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await readFile(filePath);

    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": MIME_TYPES[extension],
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
