import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteCommissionDraftForUser, getCommissionDraftForUser, listCommissionDraftsForUser, saveCommissionDraftForUser } from "@/lib/db";
import { assertTrustedMutationOrigin, UntrustedMutationOriginError } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "customer" && !user.emailVerified) return errorResponse("A verified account is required for server drafts.", 401);
  const id = new URL(request.url).searchParams.get("id")?.trim();
  const result = id ? getCommissionDraftForUser(id, user.email) : listCommissionDraftsForUser(user.email);
  if (id && !result) return errorResponse("Draft not found.", 404);
  return NextResponse.json({ ok: true, draft: id ? result : undefined, drafts: id ? undefined : result }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.role === "customer" && !user.emailVerified) return errorResponse("A verified account is required for server drafts.", 401);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return errorResponse("Draft payload is invalid.", 400);
    const draft = saveCommissionDraftForUser({
      id: typeof body.id === "string" ? body.id : null,
      userEmail: user.email,
      payload: body.payload as Record<string, unknown>,
      currentStep: Number(body.currentStep ?? 1),
      idempotencyKey: String(body.idempotencyKey ?? ""),
      expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null
    });
    return NextResponse.json({ ok: true, draft }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UntrustedMutationOriginError) return errorResponse(error.message, error.status);
    const message = error instanceof Error ? error.message : "Draft save failed.";
    return errorResponse(message, /another session/.test(message) ? 409 : 400);
  }
}

export async function DELETE(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
    const user = await getCurrentUser();
    if (!user) return errorResponse("Authentication is required.", 401);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id || !deleteCommissionDraftForUser(id, user.email)) return errorResponse("Draft not found.", 404);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UntrustedMutationOriginError) return errorResponse(error.message, error.status);
    return errorResponse(error instanceof Error ? error.message : "Draft deletion failed.", 400);
  }
}
