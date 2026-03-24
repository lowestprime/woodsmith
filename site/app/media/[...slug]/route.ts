import { createReadStream } from "node:fs";
import { NextResponse } from "next/server";
import { detectMediaKind, resolveMediaPath } from "@/lib/media";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

export async function GET(_: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const relativePath = slug.join("/");
  const absolutePath = resolveMediaPath(relativePath);
  const extension = absolutePath.slice(absolutePath.lastIndexOf(".")).toLowerCase();
  const kind = detectMediaKind(relativePath);

  const stream = createReadStream(absolutePath);
  return new NextResponse(stream as never, {
    headers: {
      "Content-Type": MIME_TYPES[extension] || (kind === "video" ? "application/octet-stream" : "image/jpeg"),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
