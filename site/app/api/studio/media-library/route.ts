import {
  type NextRequest,
  NextResponse
} from "next/server";

import {
  getCurrentUser
} from "@/lib/auth";

import {
  loadMediaPage,
  type MediaPageRequest
} from "@/lib/media-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateNoStoreHeaders = {
  "Cache-Control":
    "private, no-store, max-age=0",
  Vary: "Cookie"
};

function optionalParam(
  searchParams: URLSearchParams,
  name: string
) {
  return searchParams.get(name)?.trim() || "";
}

export async function GET(
  request: NextRequest
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      {
        ok: false,
        message:
          "An administrator session is required."
      },
      {
        status: 401,
        headers: privateNoStoreHeaders
      }
    );
  }

  const searchParams =
    request.nextUrl.searchParams;
  const mediaRequest: MediaPageRequest = {
    page: Number(
      optionalParam(searchParams, "page") || 1
    ),
    pageSize: Number(
      optionalParam(searchParams, "pageSize") || 48
    ),
    ...(optionalParam(searchParams, "query")
      ? {
          query: optionalParam(
            searchParams,
            "query"
          )
        }
      : {}),
    ...(optionalParam(searchParams, "pieceSlug")
      ? {
          pieceSlug: optionalParam(
            searchParams,
            "pieceSlug"
          )
        }
      : {}),
    ...(optionalParam(searchParams, "assignment")
      ? {
          assignment: optionalParam(
            searchParams,
            "assignment"
          ) as MediaPageRequest["assignment"]
        }
      : {}),
    ...(optionalParam(searchParams, "assignmentSource")
      ? {
          assignmentSource: optionalParam(
            searchParams,
            "assignmentSource"
          ) as MediaPageRequest["assignmentSource"]
        }
      : {}),
    ...(optionalParam(searchParams, "sort")
      ? {
          sort: optionalParam(
            searchParams,
            "sort"
          ) as MediaPageRequest["sort"]
        }
      : {}),
    ...(optionalParam(searchParams, "kind")
      ? {
          kind: optionalParam(
            searchParams,
            "kind"
          ) as MediaPageRequest["kind"]
        }
      : {}),
    ...(optionalParam(searchParams, "aiFilter")
      ? {
          aiFilter: optionalParam(
            searchParams,
            "aiFilter"
          ) as MediaPageRequest["aiFilter"]
        }
      : {}),
    ...(optionalParam(
      searchParams,
      "publicAssignmentPieceSlug"
    )
      ? {
          publicAssignmentPieceSlug:
            optionalParam(
              searchParams,
              "publicAssignmentPieceSlug"
            )
        }
      : {})
  };

  return NextResponse.json(
    loadMediaPage(mediaRequest),
    {
      headers: privateNoStoreHeaders
    }
  );
}
