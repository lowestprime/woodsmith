import type { MediaRecord, PieceRecord } from "@/lib/db";

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

  return score;
}

export function buildMediaVerificationQueue(pieces: PieceRecord[], media: MediaRecord[]) {
  return pieces
    .map((piece) => {
      const assigned = media.filter((item) => item.pieceSlug === piece.slug);
      const suggestions = media
        .filter((item) => item.kind === "image" && (!item.pieceSlug || item.pieceSlug === piece.slug))
        .map((item) => ({ item, score: scoreCandidate(piece, item) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || left.item.relativePath.localeCompare(right.item.relativePath))
        .slice(0, 6);

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
