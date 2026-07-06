export type MediaScoreEvidence = {
  visualSimilarity: number;
  vlmConfidence: number;
  lexicalScore: number;
  clusterPropagation: number;
  folderDateContext: number;
  manualPrior: number;
};

export const MEDIA_SCORE_WEIGHTS = {
  visualSimilarity: 0.40,
  vlmConfidence: 0.20,
  lexicalScore: 0.15,
  clusterPropagation: 0.10,
  folderDateContext: 0.10,
  manualPrior: 0.05
} as const;

export function weightedMediaScore(evidence: MediaScoreEvidence) {
  return (Object.keys(MEDIA_SCORE_WEIGHTS) as Array<keyof MediaScoreEvidence>).reduce((total, key) => total + Math.max(0, Math.min(1, evidence[key])) * MEDIA_SCORE_WEIGHTS[key], 0);
}

export function classifyMediaSuggestion(score: number, margin: number, minimum: number, high: number, ambiguityDelta: number, unsafeReason = "") {
  if (unsafeReason) return "unsafe" as const;
  if (score < minimum || margin < ambiguityDelta) return "ambiguous" as const;
  if (score >= high && margin >= ambiguityDelta * 1.5) return "high" as const;
  return "review" as const;
}
