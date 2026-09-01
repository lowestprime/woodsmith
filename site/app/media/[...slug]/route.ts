import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { commissionOwnerKey, userCanAccessProject } from "@/lib/commission-security";
import { commissionRenderAssetOwnedBy, getMediaAccessAssociations, getProject } from "@/lib/db";
import { detectMediaKind, resolveMediaPath } from "@/lib/media";
import { classifyMediaAccess, mediaAccessAllowed, mediaCacheHeaders, normalizeMediaRequestPath } from "@/lib/media-access";
import {
  mediaEntityTag,
  mediaIfRangeMatches,
  mediaLastModified,
  mediaRequestIsFresh,
  resolveMediaByteRange
} from "@/lib/media-http";

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
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      ...mediaCacheHeaders("denied"),
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const relativePath = normalizeMediaRequestPath(slug.join("/"));
  if (!relativePath) return notFound();

  const access = classifyMediaAccess(
    relativePath,
    getMediaAccessAssociations(relativePath)
  );

  if (access.kind !== "public-library") {
    if (access.kind === "invalid" || access.kind === "transient") return notFound();

    const user = await getCurrentUser();
    const admin = user?.role === "admin";
    let projectAuthorized = false;
    let previewOwner = false;

    if (access.kind === "private-project") {
      const project = getProject(access.projectReference);
      projectAuthorized = Boolean(project && await userCanAccessProject(project, user));
    } else if (access.kind === "private-preview" && !admin) {
      const ownerKey = await commissionOwnerKey(user?.email);
      previewOwner = commissionRenderAssetOwnedBy(relativePath, ownerKey);
    }

    if (!mediaAccessAllowed(access, { admin, projectAuthorized, previewOwner })) {
      return notFound();
    }
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
  const publicMedia = access.kind === "public-library";
  const responseHeaders = {
    "Content-Type": MIME_TYPES[extension] || (kind === "video" ? "application/octet-stream" : "image/jpeg"),
    "Accept-Ranges": "bytes",
    ...mediaCacheHeaders(publicMedia ? "public" : "private"),
    ...(publicMedia ? {
      ETag: mediaEntityTag(stat),
      "Last-Modified": mediaLastModified(stat)
    } : {}),
    "X-Content-Type-Options": "nosniff"
  };

  if (publicMedia && mediaRequestIsFresh(request.headers, stat)) {
    return new NextResponse(null, { status: 304, headers: responseHeaders });
  }

  const requestedRange = mediaIfRangeMatches(request.headers, stat)
    ? resolveMediaByteRange(request.headers.get("range"), stat.size)
    : { kind: "none" as const };

  if (requestedRange.kind === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...responseHeaders,
        "Content-Length": "0",
        "Content-Range": `bytes */${stat.size}`
      }
    });
  }

  if (requestedRange.kind === "range") {
    const { start, end, length } = requestedRange.range;
    const stream = Readable.toWeb(createReadStream(absolutePath, { start, end })) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...responseHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`
      }
    });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      ...responseHeaders,
      "Content-Length": String(stat.size)
    }
  });
}
