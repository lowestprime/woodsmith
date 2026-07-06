import { createHash } from "node:crypto";
import { cosineSimilarity, createImageEmbeddings, createTextEmbeddings, describeImageContent, getAiServiceStatus, runLocalSidecarAction, type AiProviderName, type ImageAnalysisResult, type ImageEmbeddingResult } from "@/lib/ai-services";
import { type MediaRecord, type PieceRecord, getEmbeddingCache, saveEmbeddingCache, listEmbeddingsByKind, listMedia, markMediaAiAnalyzed, listMediaWithoutAiTags, patchMediaMetadata } from "@/lib/db";
import { resolveMediaPath } from "@/lib/media";
import { classifyMediaSuggestion, weightedMediaScore, type MediaScoreEvidence } from "@/lib/media-scoring";

export type CandidateEvidence = MediaScoreEvidence;

export type MediaMatchCandidate = {
  item: MediaRecord;
  score: number;
  finalScore: number;
  margin: number;
  confidence: "high" | "review" | "ambiguous" | "unsafe";
  ambiguity: number;
  evidence: CandidateEvidence;
  reasonCodes: string[];
};

export type MediaAutomationOptions = {
  provider?: AiProviderName | "local" | "hybrid";
  selectedPaths?: string[];
  limit?: number;
  includeReviewed?: boolean;
  dryRun?: boolean;
  pieces?: PieceRecord[];
};

const STOP_WORDS = new Set(["the", "and", "with", "piece", "wood", "from", "this", "that", "photo", "image"]);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokensFor(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/g).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function pieceText(piece: PieceRecord) {
  return [piece.title, piece.subtitle, piece.category, piece.summary, piece.story, piece.tags.join(", "), piece.materials.join(", ")].filter(Boolean).join(". ");
}

function lexicalScore(piece: PieceRecord, media: MediaRecord) {
  const pieceTokens = new Set([...tokensFor(piece.slug), ...tokensFor(piece.title), ...tokensFor(piece.category), ...piece.tags.flatMap(tokensFor), ...piece.materials.flatMap(tokensFor)]);
  const haystack = [media.relativePath, media.fileName, media.folder, media.altText, media.clusterKey, media.tags.join(" "), JSON.stringify(media.metadata)].join(" ").toLowerCase();
  let matched = 0;
  for (const token of pieceTokens) if (haystack.includes(token)) matched += token.length > 6 ? 1.25 : 1;
  return pieceTokens.size ? Math.min(1, matched / Math.max(3, pieceTokens.size * 0.55)) : 0;
}

function vlmCandidateConfidence(piece: PieceRecord, media: MediaRecord) {
  const candidates = Array.isArray(media.metadata.aiCandidatePieceSlugs) ? media.metadata.aiCandidatePieceSlugs : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    if (String(record.slug) === piece.slug) return Math.max(0, Math.min(1, Number(record.confidence) || 0));
  }
  return 0;
}

function rejected(piece: PieceRecord, media: MediaRecord) {
  return Array.isArray(media.metadata.aiRejectedPieceSlugs) && media.metadata.aiRejectedPieceSlugs.map(String).includes(piece.slug);
}

function unsafeMediaReason(media: MediaRecord) {
  const primary = String(media.metadata.aiPrimaryObject ?? "");
  const reason = String(media.metadata.aiUnsafeToAutoAssignReason ?? "");
  if (reason) return reason;
  if (primary && primary !== "furniture-piece") return `Classified as ${primary}.`;
  return "";
}

function activeVisualEmbeddings() {
  const status = getAiServiceStatus();
  const provider = status.activeEmbeddingProvider;
  const model = status.embeddingModel;
  const pieceMap = new Map<string, number[]>();
  const mediaMap = new Map<string, number[]>();
  for (const entry of listEmbeddingsByKind("piece-visual")) {
    if (entry.metadata.provider === provider && entry.metadata.model === model && typeof entry.metadata.slug === "string") pieceMap.set(entry.metadata.slug, entry.embedding);
  }
  for (const entry of listEmbeddingsByKind("media-visual")) {
    if (entry.metadata.provider === provider && entry.metadata.model === model && typeof entry.metadata.relativePath === "string") mediaMap.set(entry.metadata.relativePath, entry.embedding);
  }
  return { pieceMap, mediaMap, provider, model };
}

function clusterPrior(piece: PieceRecord, media: MediaRecord, mediaByCluster: Map<string, MediaRecord[]>) {
  const clusterId = typeof media.metadata.aiClusterId === "string" ? media.metadata.aiClusterId : "";
  if (!clusterId) return 0;
  const verified = (mediaByCluster.get(clusterId) ?? []).find((item) => item.reviewed && item.pieceSlug === piece.slug && item.metadata.verifiedPieceSlug === piece.slug);
  return verified ? 1 : 0;
}

function folderDatePrior(piece: PieceRecord, media: MediaRecord, mediaByFolder: Map<string, MediaRecord[]>) {
  const folderMembers = mediaByFolder.get(media.folder) ?? [];
  if (folderMembers.some((item) => item.reviewed && item.pieceSlug === piece.slug)) return 1;
  const folderTokens = new Set(tokensFor(media.folder));
  const pieceTokens = [...tokensFor(piece.slug), ...tokensFor(piece.title)];
  return pieceTokens.some((token) => folderTokens.has(token)) ? 0.7 : 0;
}

function manualPrior(piece: PieceRecord, media: MediaRecord) {
  if (media.metadata.verifiedPieceSlug === piece.slug && media.reviewed) return 1;
  if (media.pieceSlug === piece.slug) return media.reviewed ? 0.9 : 0.55;
  return 0;
}

function scoreCandidate(piece: PieceRecord, media: MediaRecord, maps: ReturnType<typeof activeVisualEmbeddings>, mediaByCluster: Map<string, MediaRecord[]>, mediaByFolder: Map<string, MediaRecord[]>) {
  if (rejected(piece, media)) return { finalScore: 0, evidence: { visualSimilarity: 0, vlmConfidence: 0, lexicalScore: 0, clusterPropagation: 0, folderDateContext: 0, manualPrior: 0 }, reasonCodes: ["rejected-by-reviewer"] };
  const pieceEmbedding = maps.pieceMap.get(piece.slug);
  const mediaEmbedding = maps.mediaMap.get(media.relativePath);
  const visualSimilarity = pieceEmbedding?.length && mediaEmbedding?.length ? Math.max(0, cosineSimilarity(pieceEmbedding, mediaEmbedding)) : 0;
  const evidence: CandidateEvidence = {
    visualSimilarity,
    vlmConfidence: vlmCandidateConfidence(piece, media),
    lexicalScore: lexicalScore(piece, media),
    clusterPropagation: clusterPrior(piece, media, mediaByCluster),
    folderDateContext: folderDatePrior(piece, media, mediaByFolder),
    manualPrior: manualPrior(piece, media)
  };
  const finalScore = weightedMediaScore(evidence);
  const reasonCodes = Object.entries(evidence).filter(([, value]) => value > 0).map(([key]) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
  return { finalScore, evidence, reasonCodes };
}

export function buildMediaVerificationQueue(pieces: PieceRecord[], media: MediaRecord[]) {
  const status = getAiServiceStatus();
  const maps = activeVisualEmbeddings();
  const assignedByPiece = new Map<string, MediaRecord[]>();
  const mediaByCluster = new Map<string, MediaRecord[]>();
  const mediaByFolder = new Map<string, MediaRecord[]>();
  for (const item of media) {
    if (item.pieceSlug) assignedByPiece.set(item.pieceSlug, [...(assignedByPiece.get(item.pieceSlug) ?? []), item]);
    const clusterId = typeof item.metadata.aiClusterId === "string" ? item.metadata.aiClusterId : "";
    if (clusterId) mediaByCluster.set(clusterId, [...(mediaByCluster.get(clusterId) ?? []), item]);
    mediaByFolder.set(item.folder, [...(mediaByFolder.get(item.folder) ?? []), item]);
  }
  const suggestionsByPiece = new Map<string, MediaMatchCandidate[]>();
  for (const item of media.filter((entry) => entry.kind === "image" && !entry.pieceSlug)) {
    const ranked = pieces.map((piece) => ({ piece, ...scoreCandidate(piece, item, maps, mediaByCluster, mediaByFolder) })).sort((left, right) => right.finalScore - left.finalScore || left.piece.slug.localeCompare(right.piece.slug));
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best) continue;
    const margin = best.finalScore - (runnerUp?.finalScore ?? 0);
    const unsafe = unsafeMediaReason(item);
    const ambiguity = Math.max(Number(item.metadata.aiAmbiguity ?? 0), 1 - Math.min(1, Math.max(0, margin) / Math.max(status.ambiguityDelta, 0.01)));
    const confidence = classifyMediaSuggestion(best.finalScore, margin, status.confidenceMin, status.confidenceHigh, status.ambiguityDelta, unsafe);
    if (confidence === "ambiguous" || confidence === "unsafe") continue;
    const candidate: MediaMatchCandidate = { item, score: Math.round(best.finalScore * 100), finalScore: best.finalScore, margin, confidence, ambiguity, evidence: best.evidence, reasonCodes: [...best.reasonCodes, confidence === "high" ? "high-confidence" : "manual-review-required"] };
    suggestionsByPiece.set(best.piece.slug, [...(suggestionsByPiece.get(best.piece.slug) ?? []), candidate]);
  }
  return pieces.map((piece) => {
    const assigned = assignedByPiece.get(piece.slug) ?? [];
    const suggestions = (suggestionsByPiece.get(piece.slug) ?? []).slice().sort((left, right) => right.finalScore - left.finalScore || left.item.relativePath.localeCompare(right.item.relativePath));
    return { piece, assigned, suggestions, needsReview: piece.metadata.verifiedMedia === false || Boolean(piece.metadata.mediaReviewRequired) || assigned.length === 0 };
  }).filter((entry) => entry.needsReview || entry.suggestions.length > 0).sort((left, right) => Number(right.needsReview) - Number(left.needsReview) || left.piece.title.localeCompare(right.piece.title));
}

export async function computePieceEmbeddings(pieces: PieceRecord[], options: MediaAutomationOptions = {}) {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch) return { embedded: 0, skipped: pieces.length, errors: [] as string[] };
  const provider = options.provider === "local" ? "local-sidecar" : !options.provider || options.provider === "hybrid" ? status.activeEmbeddingProvider : options.provider;
  const pending = pieces.filter((piece) => {
    const sourceText = pieceText(piece);
    const key = `piece-visual:${provider}:${status.embeddingModel}:1:${piece.slug}`;
    return getEmbeddingCache(key)?.sourceText !== sourceText;
  });
  const batch = pending.slice(0, options.limit ?? status.maxBatch);
  const texts = batch.map(pieceText);
  if (batch.length === 0) return { embedded: 0, skipped: pieces.length, errors: [] as string[] };
  const vectors = await createTextEmbeddings(texts, { provider }).catch(() => null);
  if (!vectors || vectors.length !== batch.length) return { embedded: 0, skipped: batch.length, errors: ["Embedding provider returned no compatible piece vectors."] };
  if (!options.dryRun) {
    for (let index = 0; index < batch.length; index += 1) {
      const piece = batch[index], embedding = vectors[index], sourceText = texts[index];
      if (!piece || !embedding || !sourceText) continue;
      const key = `piece-visual:${provider}:${status.embeddingModel}:1:${piece.slug}`;
      const cached = getEmbeddingCache(key);
      if (cached?.sourceText === sourceText) continue;
      saveEmbeddingCache({ key, kind: "piece-visual", embedding, sourceText, metadata: { slug: piece.slug, provider, model: status.embeddingModel, version: "1", sourceHash: hash(sourceText) } });
    }
  }
  return { embedded: batch.length, skipped: Math.max(0, pieces.length - batch.length), errors: [] as string[] };
}

export async function computeMediaEmbeddings(media: MediaRecord[], options: MediaAutomationOptions = {}) {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch) return { embedded: 0, skipped: media.length, errors: [] as Array<{ path: string; message: string }> };
  const selected = new Set(options.selectedPaths ?? []);
  const requestedProvider = options.provider === "local" ? "local-sidecar" : options.provider === "hybrid" || !options.provider ? status.activeEmbeddingProvider : options.provider;
  const candidates = media.filter((item) => item.kind === "image"
    && (selected.size === 0 || selected.has(item.relativePath))
    && (options.includeReviewed || !item.reviewed)
    && (selected.size > 0 || !item.metadata.aiEmbeddingHash || item.metadata.aiEmbeddingProvider !== requestedProvider || item.metadata.aiEmbeddingModel !== status.embeddingModel)
  ).slice(0, options.limit ?? status.maxBatch);
  const results: ImageEmbeddingResult[] = await createImageEmbeddings(candidates.map((item) => ({ absolutePath: resolveMediaPath(item.relativePath), relativePath: item.relativePath })), { provider: options.provider }).catch((error) => candidates.map((item): ImageEmbeddingResult => ({ path: item.relativePath, provider: "disabled", model: status.embeddingModel, version: "1", error: error instanceof Error ? error.message : "Embedding failed." })));
  let embedded = 0;
  const errors: Array<{ path: string; message: string }> = [];
  for (const result of results) {
    if (!result.embedding?.length) { errors.push({ path: result.path, message: result.error || "No embedding returned." }); continue; }
    embedded += 1;
    if (options.dryRun) continue;
    const key = `media-visual:${result.provider}:${result.model}:${result.version}:${result.path}`;
    saveEmbeddingCache({ key, kind: "media-visual", embedding: result.embedding, sourceText: result.path, metadata: { relativePath: result.path, provider: result.provider, model: result.model, version: result.version, hash: result.hash } });
    patchMediaMetadata(result.path, { aiEmbeddingProvider: result.provider, aiEmbeddingModel: result.model, aiEmbeddingVersion: result.version, aiEmbeddingHash: result.hash || "", aiEmbeddingComputedAt: result.computedAt || new Date().toISOString(), aiNeedsHumanReview: true });
  }
  return { embedded, skipped: Math.max(0, candidates.length - embedded), errors };
}

function analysisMetadata(analysis: ImageAnalysisResult) {
  return {
    aiAnalyzed: true,
    aiSchemaVersion: analysis.schemaVersion,
    aiProvider: analysis.provider,
    aiModel: analysis.model,
    aiAnalyzedAt: analysis.analyzedAt,
    aiPrimaryObject: analysis.primaryObject,
    aiDescription: analysis.description,
    aiAltTextDraft: analysis.altTextDraft,
    aiTags: analysis.searchTags,
    aiFurnitureClass: analysis.furnitureClass,
    aiSpecificSubtype: analysis.specificSubtype,
    aiPhotoContext: analysis.photoContext,
    aiConstructionStage: analysis.constructionStage,
    aiWoodSpecies: analysis.woodSpecies,
    aiVisibleFeatures: analysis.visibleFeatures,
    aiFinishDescription: analysis.finishDescription,
    aiJoinery: analysis.joinery,
    aiHardware: analysis.hardware,
    aiShapeAndProportionNotes: analysis.shapeAndProportionNotes,
    aiCandidatePieceSlugs: analysis.candidatePieceSlugs,
    aiConfidence: analysis.confidence,
    aiAmbiguity: analysis.ambiguity,
    aiUncertainty: analysis.uncertainty,
    aiUnsafeToAutoAssignReason: analysis.unsafeToAutoAssignReason,
    aiBoundingBoxes: analysis.boundingBoxes ?? [],
    aiEmbeddingKeys: analysis.embeddingKeys ?? [],
    aiNeedsHumanReview: true,
    aiReviewReason: analysis.unsafeToAutoAssignReason || "AI analysis requires manual verification."
  };
}

export async function autoAnalyzeUntaggedMedia(options: MediaAutomationOptions = {}) {
  const status = getAiServiceStatus();
  if (!status.mediaAnalysis) return { analyzed: 0, skipped: 0, errors: [{ message: "Media analysis is disabled." }] };
  const selected = new Set(options.selectedPaths ?? []);
  const source = selected.size > 0
    ? listMedia({ includeUnreviewed: true }).filter((item) => selected.has(item.relativePath) && item.kind === "image" && (options.includeReviewed || !item.reviewed))
    : listMediaWithoutAiTags().filter((item) => options.includeReviewed || !item.reviewed);
  const candidates = source.slice(0, options.limit ?? status.maxBatch);
  const pieces = options.pieces ?? [];
  const errors: Array<{ path?: string; message: string }> = [];
  let analyzed = 0;
  for (const entry of candidates) {
    const relativePath = entry.relativePath;
    try {
      const analysis = await describeImageContent(resolveMediaPath(relativePath), relativePath, { provider: options.provider, candidatePieces: pieces.map((piece) => ({ slug: piece.slug, title: piece.title, description: pieceText(piece) })) });
      if (!analysis) { errors.push({ path: relativePath, message: "No analysis provider returned a result." }); continue; }
      analyzed += 1;
      if (!options.dryRun) markMediaAiAnalyzed(relativePath, analysisMetadata(analysis));
    } catch (error) {
      errors.push({ path: relativePath, message: error instanceof Error ? error.message : "Analysis failed." });
    }
  }
  return { analyzed, skipped: Math.max(0, candidates.length - analyzed), errors };
}

function stableClusterId(paths: string[], model: string) {
  return `bw-${hash(`${model}\n${paths.slice().sort().join("\n")}`).slice(0, 14)}`;
}

export async function autoClusterByEmbedding(media: MediaRecord[], options: MediaAutomationOptions = {}) {
  const status = getAiServiceStatus();
  const selected = new Set(options.selectedPaths ?? []);
  const scoped = media.filter((item) => item.kind === "image"
    && (selected.size === 0 || selected.has(item.relativePath))
    && (selected.size > 0 || (item.metadata.aiEmbeddingHash && !item.metadata.aiClusterId))
  ).slice(0, options.limit ?? status.maxBatch);
  let members: Array<{ clusterId: string; relativePath: string; representative: boolean; score: number; label?: string }> = [];
  if ((options.provider === "local" || options.provider === "local-sidecar" || (!options.provider && status.activeEmbeddingProvider === "local-sidecar"))) {
    try {
      const sidecar = await runLocalSidecarAction("cluster", { selectedPaths: scoped.map((item) => item.relativePath), limit: scoped.length, dryRun: options.dryRun });
      members = Array.isArray(sidecar.items) ? sidecar.items.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        return [{ clusterId: String(item.clusterId || ""), relativePath: String(item.relativePath || ""), representative: Boolean(item.representative), score: Number(item.score || 0), label: String(item.label || "") }];
      }).filter((item) => item.clusterId && item.relativePath) : [];
    } catch {
      members = [];
    }
  }
  if (members.length === 0) {
    const embeddings = activeVisualEmbeddings().mediaMap;
    const consumed = new Set<string>();
    for (const anchor of scoped.slice().sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
      if (consumed.has(anchor.relativePath)) continue;
      const anchorVector = embeddings.get(anchor.relativePath);
      if (!anchorVector) continue;
      const group = [{ item: anchor, score: 1 }];
      consumed.add(anchor.relativePath);
      for (const candidate of scoped) {
        if (consumed.has(candidate.relativePath)) continue;
        const candidateVector = embeddings.get(candidate.relativePath);
        if (!candidateVector) continue;
        const similarity = cosineSimilarity(anchorVector, candidateVector);
        if (similarity >= 0.84) { group.push({ item: candidate, score: similarity }); consumed.add(candidate.relativePath); }
      }
      if (group.length < 2) continue;
      const id = stableClusterId(group.map(({ item }) => item.relativePath), status.embeddingModel);
      const representative = group.slice().sort((left, right) => right.item.sizeBytes - left.item.sizeBytes || left.item.relativePath.localeCompare(right.item.relativePath))[0]?.item.relativePath;
      members.push(...group.map(({ item, score }) => ({ clusterId: id, relativePath: item.relativePath, representative: item.relativePath === representative, score, label: `Visual group ${id.slice(3, 9)}` })));
    }
  }
  if (!options.dryRun) for (const member of members) patchMediaMetadata(member.relativePath, { aiClusterId: member.clusterId, aiClusterRepresentative: member.representative, aiClusterScore: member.score, aiClusterLabel: member.label || member.clusterId, aiNeedsHumanReview: true, aiReviewReason: "Cluster membership requires manual verification before assignment." });
  return { count: new Set(members.map((item) => item.clusterId)).size, members: members.length, groups: members };
}

export async function autoPieceToPhotoMatch(pieces: PieceRecord[], media: MediaRecord[], options: MediaAutomationOptions = {}) {
  const selected = new Set(options.selectedPaths ?? []);
  const scoped = media.filter((item) => (selected.size === 0 || selected.has(item.relativePath)) && (options.includeReviewed || !item.reviewed));
  const queue = buildMediaVerificationQueue(pieces, scoped);
  return queue.flatMap((entry) => entry.suggestions.map((candidate) => ({ pieceSlug: entry.piece.slug, mediaPath: candidate.item.relativePath, confidence: candidate.score, finalScore: candidate.finalScore, margin: candidate.margin, ambiguity: candidate.ambiguity, evidence: candidate.evidence, reasonCodes: candidate.reasonCodes, label: candidate.confidence }))).sort((left, right) => right.finalScore - left.finalScore).slice(0, 100);
}
