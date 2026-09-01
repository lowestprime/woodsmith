import { NextResponse } from "next/server";
import { createPhotorealisticPreview, getAiServiceStatus, type PhotorealisticRenderInput } from "@/lib/ai-services";
import { persistGeneratedMedia } from "@/lib/media";
import { consumeCommissionRenderQuota, refreshMediaLibrary, registerCommissionRenderAsset, saveMediaMetadata } from "@/lib/db";
import { toMediaUrl } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { commissionOwnerKey } from "@/lib/commission-security";
import { normalizeVisualizerState } from "@/lib/estimator";
import { assertTrustedMutationOrigin, UntrustedMutationOriginError } from "@/lib/request-security";

export const runtime = "nodejs";

function numberField(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof UntrustedMutationOriginError ? error.message : "Preview request was rejected." }, { status: 403 });
  }
  const status = getAiServiceStatus();
  if (!status.publicRendering) {
    return NextResponse.json({
      error: "AI rendering is not enabled. Set OPENAI_API_KEY and ENABLE_PUBLIC_AI_RENDERING=true to activate photorealistic previews."
    }, { status: 503 });
  }

  const user = await getCurrentUser();
  const ownerKey = await commissionOwnerKey(user?.email);
  const quota = consumeCommissionRenderQuota(ownerKey, user ? 8 : 3);
  if (!quota.allowed) {
    return NextResponse.json({ error: "The preview limit for this 24-hour window has been reached.", retryAfterSeconds: quota.retryAfterSeconds }, {
      status: 429,
      headers: { "retry-after": String(quota.retryAfterSeconds) }
    });
  }

  const body = await request.json().catch(() => ({})) as Partial<PhotorealisticRenderInput>;
  const normalized = normalizeVisualizerState({
    kind: String(body.pieceType || "other-custom-work").slice(0, 120),
    material: String(body.material || "White maple").slice(0, 120),
    joinery: String(body.joinery || "Mortise and tenon").slice(0, 120),
    width: numberField(body.width, 48),
    depth: numberField(body.depth, 24),
    height: numberField(body.height, 30),
    drawers: numberField(body.drawers, 0),
    shelves: numberField(body.shelves, 0),
    notes: String(body.notes || "").slice(0, 2000),
    includeVisualization: true
  });
  const input: PhotorealisticRenderInput = {
    pieceType: normalized.kind,
    material: normalized.material,
    joinery: normalized.joinery,
    width: normalized.width,
    depth: normalized.depth,
    height: normalized.height,
    drawers: normalized.drawers,
    shelves: normalized.shelves,
    notes: normalized.notes
  };

  try {
    const generated = await createPhotorealisticPreview(input);
    if (generated.b64Json) {
      const relativePath = persistGeneratedMedia(generated.b64Json, "ai-renderings", input.pieceType, ".png");
      registerCommissionRenderAsset(relativePath, ownerKey);
      refreshMediaLibrary();
      saveMediaMetadata({
        relativePath,
        altText: `${input.pieceType} AI preview`,
        focalX: 50,
        focalY: 50,
        zoom: 1,
        reviewed: false,
        tags: ["ai-preview", "custom-work", input.material, input.joinery],
        metadata: {
          generated: true,
          generatedBy: status.imageModel,
          generatedAt: new Date().toISOString(),
          source: "custom-work-visualizer",
          input
        }
      });

      return NextResponse.json({ relativePath, mediaUrl: toMediaUrl(relativePath), model: status.imageModel, remaining: quota.remaining });
    }

    return NextResponse.json({ imageUrl: generated.url, model: status.imageModel, remaining: quota.remaining });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI preview generation failed." }, { status: 502 });
  }
}
