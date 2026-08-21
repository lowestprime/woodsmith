import {
  MEDIA_ASSIGNMENT_SOURCES,
  MEDIA_SORTS,
  countMedia,
  getMediaAccessAssociations,
  listMedia,
  listPieceMediaLinksForPath,
  type MediaAssignmentFilter,
  type MediaAssignmentSourceFilter,
  type MediaAiFilter,
  type MediaKindFilter,
  type MediaRecord,
  type MediaSort
} from "@/lib/db";

import {
  classifyMediaAccess
} from "@/lib/media-access";

export type MediaPageRequest = {
  page?: number;
  pageSize?: number;
  query?: string;
  pieceSlug?: string;
  assignment?: MediaAssignmentFilter;
  assignmentSource?: MediaAssignmentSourceFilter;
  sort?: MediaSort;
  kind?: MediaKindFilter;
  aiFilter?: MediaAiFilter;
  publicAssignmentPieceSlug?: string;
};

export type MediaPageResult = {
  ok: true;
  items: MediaRecord[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  pieceSlug: string;
  assignment: MediaAssignmentFilter;
  assignmentSource: MediaAssignmentSourceFilter;
  sort: MediaSort;
  kind: MediaKindFilter;
  aiFilter: MediaAiFilter;
};

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.round(Math.min(maximum, Math.max(minimum, parsed)))
    : fallback;
}

export function mediaRecordForPieceEditor(
  media: MediaRecord,
  pieceSlug?: string | null
): MediaRecord {
  const associations =
    getMediaAccessAssociations(
      media.relativePath
    );
  const privateAssociation =
    listPieceMediaLinksForPath(
      media.relativePath
    ).some(
      (link) =>
        link.role ===
          "private-project" ||
        (
          !link.public &&
          link.pieceSlug !==
            pieceSlug
        )
    );
  const access =
    classifyMediaAccess(
      media.relativePath,
      {
        ...associations,
        privateAssociation
      }
    );

  return {
    ...media,
    metadata: {
      ...media.metadata,
      mediaAccessKind:
        access.kind,
      mediaDirectPublicEligible:
        access.kind ===
        "public-library"
    }
  };
}

export function loadMediaPage(
  request: MediaPageRequest
): MediaPageResult {
  const pageSize = clampInteger(
    request.pageSize ?? 48,
    48,
    12,
    96
  );
  const query =
    request.query?.trim().slice(0, 160) ?? "";
  const pieceSlug =
    request.pieceSlug?.trim().slice(0, 160) ?? "";
  const assignment: MediaAssignmentFilter =
    ["unassigned", "assigned", "review"].includes(
      request.assignment ?? ""
    )
      ? request.assignment as MediaAssignmentFilter
      : "all";
  const assignmentSourceValues =
    ["none", ...MEDIA_ASSIGNMENT_SOURCES] as readonly string[];
  const assignmentSource: MediaAssignmentSourceFilter =
    assignmentSourceValues.includes(
      String(request.assignmentSource ?? "")
    )
      ? request.assignmentSource as MediaAssignmentSourceFilter
      : "all";
  const sort: MediaSort =
    MEDIA_SORTS.includes(
      request.sort as MediaSort
    )
      ? request.sort as MediaSort
      : "updated-desc";
  const kind: MediaKindFilter =
    ["image", "video"].includes(
      request.kind ?? ""
    )
      ? request.kind as MediaKindFilter
      : "all";
  const aiFilter: MediaAiFilter =
    [
      "high",
      "ambiguous",
      "details",
      "unanalyzed",
      "missing-alt",
      "representatives"
    ].includes(request.aiFilter ?? "")
      ? request.aiFilter as MediaAiFilter
      : "all";
  const options = {
    includeUnreviewed: true,
    ...(query ? { query } : {}),
    ...(pieceSlug ? { pieceSlug } : {}),
    assignment,
    assignmentSource,
    sort,
    kind,
    aiFilter
  } as const;
  const total = countMedia(options);
  const totalPages = Math.max(
    1,
    Math.ceil(total / pageSize)
  );
  const page = Math.min(
    totalPages,
    Math.max(
      1,
      clampInteger(
        request.page ?? 1,
        1,
        1,
        Number.MAX_SAFE_INTEGER
      )
    )
  );
  const publicAssignmentPieceSlug =
    request
      .publicAssignmentPieceSlug
      ?.trim()
      .slice(0, 160) ||
    null;
  const items = listMedia({
    ...options,
    limit: pageSize,
    offset: (page - 1) * pageSize
  }).map(
    (media) =>
      mediaRecordForPieceEditor(
        media,
        publicAssignmentPieceSlug
      )
  );

  return {
    ok: true,
    items,
    total,
    page,
    pageSize,
    query,
    pieceSlug,
    assignment,
    assignmentSource,
    sort,
    kind,
    aiFilter
  };
}
