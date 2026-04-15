import { NextResponse } from "next/server";
import { getAiServiceStatus } from "@/lib/ai-services";
import { listMedia, listPieces, refreshMediaLibrary } from "@/lib/db";
import {
  autoAnalyzeUntaggedMedia,
  autoClusterByEmbedding,
  autoPieceToPhotoMatch,
  computeMediaEmbeddings,
  computePieceEmbeddings
} from "@/lib/media-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const status = getAiServiceStatus();
  const body = await request.json().catch(() => ({})) as { action?: string };
  const action = body.action ?? "full";

  if (!status.embeddingSearch && !status.mediaAnalysis) {
    return NextResponse.json({
      error: "AI media analysis requires at least one of ENABLE_EMBEDDING_SEARCH or ENABLE_AI_MEDIA_ANALYSIS to be enabled with a valid OPENAI_API_KEY."
    }, { status: 503 });
  }

  const pieces = listPieces(true);
  const media = listMedia({ includeUnreviewed: true });
  const results: Record<string, unknown> = { action, timestamp: new Date().toISOString() };

  if (action === "full" || action === "analyze") {
    if (status.mediaAnalysis) {
      const analysis = await autoAnalyzeUntaggedMedia().catch(() => ({ analyzed: 0, tagged: 0 }));
      results.analysis = analysis;
    } else {
      results.analysis = { skipped: true, reason: "ENABLE_AI_MEDIA_ANALYSIS is not enabled" };
    }
  }

  if (action === "full" || action === "embed") {
    if (status.embeddingSearch) {
      const piecesEmbedded = await computePieceEmbeddings(pieces).catch(() => 0);
      const refreshedMedia = refreshMediaLibrary();
      const mediaEmbedded = await computeMediaEmbeddings(refreshedMedia).catch(() => 0);
      results.embeddings = { piecesEmbedded, mediaEmbedded };
    } else {
      results.embeddings = { skipped: true, reason: "ENABLE_EMBEDDING_SEARCH is not enabled" };
    }
  }

  if (action === "full" || action === "cluster") {
    if (status.embeddingSearch) {
      const clusters = await autoClusterByEmbedding(media).catch(() => new Map());
      results.clusters = { count: clusters.size, groups: Object.fromEntries(clusters) };
    } else {
      results.clusters = { skipped: true, reason: "Embeddings required for clustering" };
    }
  }

  if (action === "full" || action === "match") {
    if (status.embeddingSearch) {
      const matches = await autoPieceToPhotoMatch(pieces, media).catch(() => []);
      results.matches = { count: matches.length, candidates: matches.slice(0, 20) };
    } else {
      results.matches = { skipped: true, reason: "Embeddings required for matching" };
    }
  }

  return NextResponse.json(results);
}
