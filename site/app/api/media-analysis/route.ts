import { NextResponse } from "next/server";
import { getAiServiceStatus } from "@/lib/ai-services";
import { getCurrentUser } from "@/lib/auth";
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
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin authentication is required for media analysis." }, { status: 401 });
  }

  const status = getAiServiceStatus();
  const body = await request.json().catch(() => ({})) as { action?: string };
  const action = body.action ?? "full";
  if (!["full", "analyze", "embed", "cluster", "match"].includes(action)) {
    return NextResponse.json({ error: "Unsupported media-analysis action." }, { status: 400 });
  }

  const pieces = listPieces(true);
  const results: Record<string, unknown> = { action, timestamp: new Date().toISOString() };
  const locallyRefreshed = action === "full" || action === "cluster" || action === "match";
  const media = locallyRefreshed ? refreshMediaLibrary() : listMedia({ includeUnreviewed: true });
  if (locallyRefreshed) results.localIndex = { refreshed: media.length, method: "folder-filename-date-metadata" };

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
      const mediaEmbedded = await computeMediaEmbeddings(media).catch(() => 0);
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
