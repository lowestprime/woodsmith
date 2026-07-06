import assert from "node:assert/strict";
import test from "node:test";
import { classifyMediaSuggestion, weightedMediaScore } from "./media-scoring.ts";

test("weighted media score gives visual evidence the configured 40 percent weight", () => {
  assert.equal(weightedMediaScore({ visualSimilarity: 1, vlmConfidence: 0, lexicalScore: 0, clusterPropagation: 0, folderDateContext: 0, manualPrior: 0 }), 0.4);
});

test("unsafe and narrow-margin suggestions never become high-confidence", () => {
  assert.equal(classifyMediaSuggestion(0.96, 0.3, 0.58, 0.82, 0.08, "detail-only"), "unsafe");
  assert.equal(classifyMediaSuggestion(0.96, 0.02, 0.58, 0.82, 0.08), "ambiguous");
});

test("high-confidence classification requires score and separation", () => {
  assert.equal(classifyMediaSuggestion(0.86, 0.14, 0.58, 0.82, 0.08), "high");
  assert.equal(classifyMediaSuggestion(0.72, 0.14, 0.58, 0.82, 0.08), "review");
});
