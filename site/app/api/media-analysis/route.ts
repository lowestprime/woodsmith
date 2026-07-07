import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAiProviderRuntimeStatus, getAiServiceStatus, runLocalSidecarAction, type AiProviderName } from "@/lib/ai-services";
import { getCurrentUser } from "@/lib/auth";
import { listEmbeddingsByKind, listMedia, listPieces, refreshMediaLibrary } from "@/lib/db";
import { autoAnalyzeUntaggedMedia, autoClusterByEmbedding, autoPieceToPhotoMatch, computeMediaEmbeddings, computePieceEmbeddings } from "@/lib/media-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["status", "scan", "analyze", "embed", "cluster", "match", "full", "cancel", "dry-run"]);
const PROVIDERS = new Set(["local", "local-sidecar", "ollama", "gemini", "openai", "hybrid", "disabled"]);

type MediaAnalysisRequest = {
  action?: string;
  provider?: AiProviderName | "local" | "hybrid";
  limit?: number;
  onlySelected?: boolean;
  selectedPaths?: string[];
  includeReviewed?: boolean;
  dryRun?: boolean;
};

function mediaTrainingSummary(media = listMedia({ includeUnreviewed: true })) {
  const accepted = media.filter((item) => item.reviewed && item.metadata.verifiedPieceSlug).length;
  const rejected = media.reduce((total, item) => total + (Array.isArray(item.metadata.aiRejectedPieceSlugs) ? item.metadata.aiRejectedPieceSlugs.length : 0), 0);
  const clusters = new Set(media.flatMap((item) => typeof item.metadata.aiClusterId === "string" && item.metadata.aiClusterId ? [item.metadata.aiClusterId] : []));
  return {
    indexed: media.length,
    reviewed: media.filter((item) => item.reviewed).length,
    acceptedTrainingExamples: accepted,
    rejectedTrainingExamples: rejected,
    analyzed: media.filter((item) => item.metadata.aiAnalyzed).length,
    embedded: media.filter((item) => item.metadata.aiEmbeddingHash).length,
    clusters: clusters.size,
    needsReview: media.filter((item) => !item.reviewed).length
  };
}

async function requireAdminResponse() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? null : NextResponse.json({ error: "Admin authentication is required for media analysis." }, { status: 401 });
}

function requestLimit(value: unknown, maximum: number) {
  const parsed = Number(value);
  return Math.max(1, Math.min(maximum, Number.isFinite(parsed) ? Math.round(parsed) : maximum));
}

function summarizeNext(results: Record<string, unknown>) {
  const embeddings = results.embeddings as { media?: { embedded?: number }; errors?: unknown[] } | undefined;
  const analysis = results.analysis as { analyzed?: number; errors?: unknown[] } | undefined;
  const clusters = results.clusters as { count?: number } | undefined;
  if (!embeddings?.media?.embedded) return "Embed unreviewed images to enable visual matching.";
  if (!analysis?.analyzed) return "Analyze selected or current-page images to add classification evidence.";
  if (!clusters?.count) return "Cluster embedded images, then review representatives.";
  return "Review ranked suggestions; assignment and publication still require manual confirmation.";
}

async function execute(body: MediaAnalysisRequest) {
  const started = performance.now();
  const configured = getAiServiceStatus();
  const action = body.action ?? "status";
  const dryRun = Boolean(body.dryRun || action === "dry-run");
  const effectiveAction = action === "dry-run" ? "full" : action;
  const limit = requestLimit(body.limit, configured.maxBatch);
  const provider = body.provider;
  const runId = randomUUID();
  const warnings: string[] = [];
  const errors: Array<{ stage: string; message: string; path?: string }> = [];
  const skipped: Record<string, number> = {};
  const results: Record<string, unknown> = {
    action,
    effectiveAction,
    provider: provider || (effectiveAction === "analyze" ? configured.activeAnalysisProvider : configured.activeEmbeddingProvider),
    runId,
    dryRun,
    limit,
    timestamp: new Date().toISOString()
  };

  if (effectiveAction === "status") {
    const training = mediaTrainingSummary();
    results.configuration = configured;
    results.providers = await getAiProviderRuntimeStatus();
    results.cache = {
      available: true,
      pieceEmbeddings: listEmbeddingsByKind("piece-visual").length,
      mediaEmbeddings: listEmbeddingsByKind("media-visual").length,
      note: "Embedding and analysis records are persisted in the mounted SQLite data volume; sidecar model/cache files stay outside the media tree."
    };
    results.training = training;
    results.workflow = {
      label: configured.providers["local-sidecar"].enabled ? "Local classifier ready" : "Manual workflow ready",
      summary: configured.providers["local-sidecar"].enabled
        ? "Use Train selected, Improve page, or Continue library. Manual accept/reject labels are persisted and influence later ranking."
        : "The manual media desk remains available. Start the local sidecar to enable image embeddings and clustering.",
      training
    };
  } else if (effectiveAction === "cancel") {
    try {
      results.cancel = await runLocalSidecarAction("cancel", {});
    } catch {
      results.cancel = { cancelled: false, reason: "Runs are synchronous and no in-process background job is active." };
    }
  } else {
    let media = listMedia({ includeUnreviewed: true });
    const knownPaths = new Set(media.map((item) => item.relativePath));
    const requestedPaths = Array.isArray(body.selectedPaths) ? [...new Set(body.selectedPaths.map(String).filter((item) => knownPaths.has(item)))].slice(0, limit) : [];
    const selectedPaths = body.onlySelected || requestedPaths.length > 0 ? requestedPaths : undefined;
    const pieces = listPieces(true);
    const options = { provider, selectedPaths, limit, includeReviewed: Boolean(body.includeReviewed), dryRun, pieces };

    if (body.onlySelected && requestedPaths.length === 0) {
      warnings.push("No valid selected media paths were supplied; no library-wide fallback was run.");
      skipped.selection = 1;
      results.skipped = skipped;
      results.warnings = warnings;
      results.errors = errors;
      results.durationMs = Math.round(performance.now() - started);
      results.nextRecommendedAction = "Select one or more media cards, then run the selected action again.";
      return results;
    }

    if (["scan", "full"].includes(effectiveAction)) {
      if (!dryRun) {
        media = refreshMediaLibrary();
        results.localIndex = { refreshed: media.length, method: "mounted-filesystem-index", persisted: true };
      } else {
        results.localIndex = { indexed: media.length, method: "mounted-filesystem-index", persisted: false };
      }
      if (configured.providers["local-sidecar"].enabled) {
        try {
          results.sidecarScan = await runLocalSidecarAction("scan", { selectedPaths, limit, dryRun });
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "Local AI sidecar scan was unavailable.");
        }
      }
    }

    if (["analyze", "full"].includes(effectiveAction)) {
      const analysis = await autoAnalyzeUntaggedMedia(options);
      results.analysis = analysis;
      skipped.analysis = analysis.skipped;
      errors.push(...analysis.errors.map((entry) => ({ stage: "analysis", path: entry.path, message: entry.message })));
    }

    if (["embed", "full"].includes(effectiveAction)) {
      const [pieceResult, mediaResult] = await Promise.all([computePieceEmbeddings(pieces, options), computeMediaEmbeddings(media, options)]);
      results.embeddings = { pieces: pieceResult, media: mediaResult };
      skipped.pieceEmbeddings = pieceResult.skipped;
      skipped.mediaEmbeddings = mediaResult.skipped;
      errors.push(...pieceResult.errors.map((message) => ({ stage: "piece-embedding", message })));
      errors.push(...mediaResult.errors.map((entry) => ({ stage: "image-embedding", path: entry.path, message: entry.message })));
    }

    if (["cluster", "full"].includes(effectiveAction)) {
      try {
        results.clusters = await autoClusterByEmbedding(media, options);
      } catch (error) {
        errors.push({ stage: "clustering", message: error instanceof Error ? error.message : "Clustering failed." });
      }
    }

    if (["match", "full"].includes(effectiveAction)) {
      if (!dryRun && effectiveAction === "full") {
        media = listMedia({ includeUnreviewed: true });
      }
      const matches = await autoPieceToPhotoMatch(pieces, media, options);
      results.matches = { count: matches.length, candidates: matches.slice(0, 100) };
    }
    results.training = mediaTrainingSummary(listMedia({ includeUnreviewed: true }));
  }

  results.skipped = skipped;
  results.warnings = warnings;
  results.errors = errors;
  results.durationMs = Math.round(performance.now() - started);
  results.nextRecommendedAction = summarizeNext(results);
  return results;
}

export async function GET() {
  const unauthorized = await requireAdminResponse();
  if (unauthorized) return unauthorized;
  return NextResponse.json(await execute({ action: "status" }), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminResponse();
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as MediaAnalysisRequest;
  const action = body.action ?? "status";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unsupported media-analysis action." }, { status: 400 });
  if (body.provider && !PROVIDERS.has(body.provider)) return NextResponse.json({ error: "Unsupported media-analysis provider." }, { status: 400 });
  try {
    return NextResponse.json(await execute({ ...body, action }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ action, error: error instanceof Error ? error.message : "Media analysis failed.", durationMs: 0 }, { status: 500 });
  }
}
