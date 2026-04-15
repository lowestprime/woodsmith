import { createReadStream, existsSync, statSync } from "node:fs";
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

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string[] }> }) {
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

  const stream = createReadStream(absolutePath);
  stream.on("error", () => {
    stream.destroy();
  });

  return new NextResponse(stream as never, {
    headers: {
      "Content-Type": MIME_TYPES[extension] || (kind === "video" ? "application/octet-stream" : "image/jpeg"),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
