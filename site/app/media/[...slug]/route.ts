import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { detectMediaKind, resolveMediaPath } from "@/lib/media";
import { mediaEntityTag, mediaLastModified, mediaRequestIsFresh } from "@/lib/media-http";

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

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const relativePath = slug.join("/");
  if (!relativePath || relativePath.includes("..")) {
    return notFound();
  }

  let absolutePath: string;
  try {
    absolutePath = resolveMediaPath(relativePath);
  } catch {
    return notFound();
  }

  if (!existsSync(absolutePath)) {
    return notFound();
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absolutePath);
  } catch {
    return notFound();
  }

  if (!stat.isFile()) {
    return notFound();
  }

  const extension = absolutePath.slice(absolutePath.lastIndexOf(".")).toLowerCase();
  const kind = detectMediaKind(relativePath);
  const responseHeaders = {
    "Content-Type": MIME_TYPES[extension] || (kind === "video" ? "application/octet-stream" : "image/jpeg"),
    "Content-Length": String(stat.size),
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, max-age=0, must-revalidate",
    ETag: mediaEntityTag(stat),
    "Last-Modified": mediaLastModified(stat),
    "X-Content-Type-Options": "nosniff"
  };

  if (mediaRequestIsFresh(request.headers, stat)) {
    return new NextResponse(null, { status: 304, headers: responseHeaders });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: responseHeaders
  });
}
