export type MediaScoreEvidence = {
  visualSimilarity: number;
  vlmConfidence: number;
  lexicalScore: number;
  clusterPropagation: number;
  folderDateContext: number;
  manualPrior: number;
  negativeReviewSignal: number;
};

export const MEDIA_SCORE_WEIGHTS = {
  visualSimilarity: 0.30,
  vlmConfidence: 0.16,
  lexicalScore: 0.12,
  clusterPropagation: 0.16,
  folderDateContext: 0.14,
  manualPrior: 0.12
} as const;

export const MEDIA_SCORE_NEGATIVE_REVIEW_WEIGHT = 0.42;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function weightedMediaScore(evidence: MediaScoreEvidence) {
  const positive = (Object.keys(MEDIA_SCORE_WEIGHTS) as Array<keyof typeof MEDIA_SCORE_WEIGHTS>).reduce(
    (total, key) => total + clamp01(evidence[key]) * MEDIA_SCORE_WEIGHTS[key],
    0
  );
  return clamp01(positive - clamp01(evidence.negativeReviewSignal) * MEDIA_SCORE_NEGATIVE_REVIEW_WEIGHT);
}

export function classifyMediaSuggestion(score: number, margin: number, minimum: number, high: number, ambiguityDelta: number, unsafeReason = "") {
  if (unsafeReason) return "unsafe" as const;
  if (score < minimum || margin < ambiguityDelta) return "ambiguous" as const;
  if (score >= high && margin >= ambiguityDelta * 1.5) return "high" as const;
  return "review" as const;
}
