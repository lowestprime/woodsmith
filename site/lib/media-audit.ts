import { cosineSimilarity, createTextEmbeddings, getAiServiceStatus, describeImageContent, type ImageAnalysisResult } from "@/lib/ai-services";
import { type MediaRecord, type PieceRecord, getEmbeddingCache, saveEmbeddingCache, listEmbeddingsByKind, markMediaAiAnalyzed, mergeMediaTags, listMediaWithoutAiTags } from "@/lib/db";
import { resolveMediaPath } from "@/lib/media";

function tokensFor(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/g)
    .filter((token) => token.length > 2 && !["the", "and", "with", "piece", "wood"].includes(token));
}

function scoreCandidate(piece: PieceRecord, media: MediaRecord) {
  const pieceTokens = new Set([
    ...tokensFor(piece.slug),
    ...tokensFor(piece.title),
    ...tokensFor(piece.category),
    ...piece.tags.flatMap(tokensFor),
    ...piece.materials.flatMap(tokensFor)
  ]);
  const haystack = [
    media.relativePath,
    media.fileName,
    media.folder,
    media.altText,
    media.clusterKey,
    media.tags.join(" "),
    JSON.stringify(media.metadata)
  ].join(" ").toLowerCase();

  let score = 0;
  for (const token of pieceTokens) {
    if (haystack.includes(token)) {
      score += token.length > 6 ? 8 : 5;
    }
  }

  if (media.pieceSlug === piece.slug) {
    score += 80;
  }

  if (media.metadata.verifiedPieceSlug === piece.slug) {
    score += 120;
  }

  const aiTags = Array.isArray(media.metadata.aiTags) ? media.metadata.aiTags.map(String) : [];
  const aiDescription = typeof media.metadata.aiDescription === "string" ? media.metadata.aiDescription : "";
  if (aiTags.length > 0 || aiDescription) {
    const aiHaystack = [...aiTags, aiDescription].join(" ").toLowerCase();
    for (const token of pieceTokens) {
      if (aiHaystack.includes(token)) {
        score += token.length > 6 ? 12 : 8;
      }
    }
  }

  return score;
}

function embeddingScore(piece: PieceRecord, media: MediaRecord): number {
  const pieceKey = `piece:${piece.slug}`;
  const mediaKey = `media:${media.relativePath}`;
  const pieceEntry = getEmbeddingCache(pieceKey);
  const mediaEntry = getEmbeddingCache(mediaKey);

  if (!pieceEntry?.embedding?.length || !mediaEntry?.embedding?.length) {
    return 0;
  }

  return Math.round(Math.max(0, cosineSimilarity(pieceEntry.embedding, mediaEntry.embedding)) * 80);
}

export function buildMediaVerificationQueue(pieces: PieceRecord[], media: MediaRecord[]) {
  return pieces
    .map((piece) => {
      const assigned = media.filter((item) => item.pieceSlug === piece.slug);
      const suggestions = media
        .filter((item) => item.kind === "image" && (!item.pieceSlug || item.pieceSlug === piece.slug))
        .map((item) => {
          const heuristicScore = scoreCandidate(piece, item);
          const aiScore = embeddingScore(piece, item);
          return { item, score: heuristicScore + aiScore };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || left.item.relativePath.localeCompare(right.item.relativePath))
        .slice(0, 8);

      return {
        piece,
        assigned,
        suggestions,
        needsReview: piece.metadata.verifiedMedia === false || Boolean(piece.metadata.mediaReviewRequired) || assigned.length === 0
      };
    })
    .filter((entry) => entry.needsReview || entry.suggestions.length > 0)
    .sort((left, right) => Number(right.needsReview) - Number(left.needsReview) || left.piece.title.localeCompare(right.piece.title));
}

export async function computePieceEmbeddings(pieces: PieceRecord[]): Promise<number> {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch) return 0;

  const uncached = pieces.filter((piece) => !getEmbeddingCache(`piece:${piece.slug}`));
  if (uncached.length === 0) return 0;

  const texts = uncached.map((piece) =>
    [piece.title, piece.subtitle, piece.category, piece.summary, piece.story, piece.tags.join(", "), piece.materials.join(", ")].join(". ")
  );

  const embeddings = await createTextEmbeddings(texts).catch(() => null);
  if (!embeddings || embeddings.length !== uncached.length) return 0;

  for (let i = 0; i < uncached.length; i++) {
    const piece = uncached[i];
    const embedding = embeddings[i];
    if (piece && embedding) {
      saveEmbeddingCache({
        key: `piece:${piece.slug}`,
        kind: "piece",
        embedding,
        sourceText: texts[i] ?? "",
        metadata: { slug: piece.slug, category: piece.category }
      });
    }
  }

  return uncached.length;
}

export async function computeMediaEmbeddings(media: MediaRecord[]): Promise<number> {
  const status = getAiServiceStatus();
  if (!status.embeddingSearch) return 0;

  const uncached = media.filter((item) => item.kind === "image" && !getEmbeddingCache(`media:${item.relativePath}`));
  if (uncached.length === 0) return 0;

  const batch = uncached.slice(0, 40);
  const texts = batch.map((item) => {
    const aiTags = Array.isArray(item.metadata.aiTags) ? item.metadata.aiTags.map(String) : [];
    const aiDescription = typeof item.metadata.aiDescription === "string" ? item.metadata.aiDescription : "";
    return [item.fileName, item.altText, item.folder, item.clusterKey, item.tags.join(", "), ...aiTags, aiDescription].filter(Boolean).join(". ");
  });

  const embeddings = await createTextEmbeddings(texts).catch(() => null);
  if (!embeddings || embeddings.length !== batch.length) return 0;

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const embedding = embeddings[i];
    if (item && embedding) {
      saveEmbeddingCache({
        key: `media:${item.relativePath}`,
        kind: "media",
        embedding,
        sourceText: texts[i] ?? "",
        metadata: { relativePath: item.relativePath, folder: item.folder }
      });
    }
  }

  return batch.length;
}

export async function autoAnalyzeUntaggedMedia(): Promise<{ analyzed: number; tagged: number }> {
  const status = getAiServiceStatus();
  if (!status.mediaAnalysis) return { analyzed: 0, tagged: 0 };

  const untagged = listMediaWithoutAiTags();
  let analyzed = 0;
  let tagged = 0;

  for (const media of untagged.slice(0, 10)) {
    try {
      const absolutePath = resolveMediaPath(media.relativePath);
      const analysis = await describeImageContent(absolutePath, media.relativePath);
      if (!analysis) continue;

      markMediaAiAnalyzed(media.relativePath, {
        aiTags: analysis.tags,
        aiPieceType: analysis.pieceType,
        aiWoodSpecies: analysis.woodSpecies,
        aiPhotoContext: analysis.photoContext,
        aiDescription: analysis.description
      });

      mergeMediaTags(media.relativePath, [
        ...analysis.tags,
        analysis.pieceType,
        ...analysis.woodSpecies,
        analysis.photoContext
      ].filter(Boolean));

      analyzed++;
      tagged += analysis.tags.length;
    } catch {
      continue;
    }
  }

  return { analyzed, tagged };
}

export async function autoClusterByEmbedding(media: MediaRecord[]): Promise<Map<string, string[]>> {
  const embeddings = listEmbeddingsByKind("media");
  const embeddingMap = new Map(embeddings.map((entry) => [entry.key.replace("media:", ""), entry.embedding]));
  const clusters = new Map<string, string[]>();

  const imageMedia = media.filter((item) => item.kind === "image" && embeddingMap.has(item.relativePath));
  const assigned = new Set<string>();

  for (const anchor of imageMedia) {
    if (assigned.has(anchor.relativePath)) continue;

    const anchorEmbedding = embeddingMap.get(anchor.relativePath);
    if (!anchorEmbedding?.length) continue;

    const clusterKey = anchor.clusterKey || anchor.relativePath;
    const clusterMembers = [anchor.relativePath];
    assigned.add(anchor.relativePath);

    for (const candidate of imageMedia) {
      if (assigned.has(candidate.relativePath)) continue;
      const candidateEmbedding = embeddingMap.get(candidate.relativePath);
      if (!candidateEmbedding?.length) continue;

      const similarity = cosineSimilarity(anchorEmbedding, candidateEmbedding);
      if (similarity > 0.82) {
        clusterMembers.push(candidate.relativePath);
        assigned.add(candidate.relativePath);
      }
    }

    if (clusterMembers.length > 1) {
      clusters.set(clusterKey, clusterMembers);
    }
  }

  return clusters;
}

export async function autoPieceToPhotoMatch(pieces: PieceRecord[], media: MediaRecord[]): Promise<Array<{ pieceSlug: string; mediaPath: string; confidence: number }>> {
  const pieceEmbeddings = listEmbeddingsByKind("piece");
  const mediaEmbeddings = listEmbeddingsByKind("media");
  const matches: Array<{ pieceSlug: string; mediaPath: string; confidence: number }> = [];

  const pieceMap = new Map(pieceEmbeddings.map((entry) => [entry.key.replace("piece:", ""), entry.embedding]));
  const mediaMap = new Map(mediaEmbeddings.map((entry) => [entry.key.replace("media:", ""), entry.embedding]));

  const unassignedMedia = media.filter((item) => item.kind === "image" && !item.pieceSlug && mediaMap.has(item.relativePath));

  for (const piece of pieces) {
    const pieceEmb = pieceMap.get(piece.slug);
    if (!pieceEmb?.length) continue;

    for (const item of unassignedMedia) {
      const mediaEmb = mediaMap.get(item.relativePath);
      if (!mediaEmb?.length) continue;

      const similarity = cosineSimilarity(pieceEmb, mediaEmb);
      const heuristicScore = scoreCandidate(piece, item);
      const combinedConfidence = Math.round((similarity * 60) + (Math.min(heuristicScore, 60)));

      if (combinedConfidence > 55) {
        matches.push({ pieceSlug: piece.slug, mediaPath: item.relativePath, confidence: combinedConfidence });
      }
    }
  }

  return matches
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50);
}
