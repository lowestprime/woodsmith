import { NextResponse } from "next/server";
import { createPhotorealisticPreview, getAiServiceStatus, type PhotorealisticRenderInput } from "@/lib/ai-services";
import { persistGeneratedMedia } from "@/lib/media";
import { refreshMediaLibrary, saveMediaMetadata } from "@/lib/db";
import { toMediaUrl } from "@/lib/format";

export const runtime = "nodejs";

function numberField(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  const status = getAiServiceStatus();
  if (!status.publicRendering) {
    return NextResponse.json({
      error: "AI rendering is not enabled. Set OPENAI_API_KEY and ENABLE_PUBLIC_AI_RENDERING=true to activate photorealistic previews."
    }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as Partial<PhotorealisticRenderInput>;
  const input: PhotorealisticRenderInput = {
    pieceType: String(body.pieceType || "custom woodworking piece"),
    material: String(body.material || "White maple"),
    joinery: String(body.joinery || "Mortise and tenon"),
    width: numberField(body.width, 48),
    depth: numberField(body.depth, 24),
    height: numberField(body.height, 30),
    drawers: numberField(body.drawers, 0),
    shelves: numberField(body.shelves, 0),
    notes: String(body.notes || "")
  };

  try {
    const generated = await createPhotorealisticPreview(input);
    if (generated.b64Json) {
      const relativePath = persistGeneratedMedia(generated.b64Json, "ai-renderings", input.pieceType, ".png");
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

      return NextResponse.json({ relativePath, mediaUrl: toMediaUrl(relativePath), model: status.imageModel });
    }

    return NextResponse.json({ imageUrl: generated.url, model: status.imageModel });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI preview generation failed." }, { status: 502 });
  }
}
