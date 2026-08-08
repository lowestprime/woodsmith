import type {
  SearchResult
} from "./search-index.ts";

export const SEMANTIC_CANDIDATE_LIMIT = 24;

export type SemanticSearchStatus =
  | "disabled"
  | "no-candidates"
  | "applied"
  | "unavailable"
  | "timeout";

export type SiteSearchResponse = {
  results: SearchResult[];
  lexicalMs: number;
  semanticMs: number | null;
  semanticStatus: SemanticSearchStatus;
  embeddingEnabled: boolean;
  visualSearchEnabled: boolean;
};

export type SemanticSearchDependencies = {
  embeddingEnabled: () => boolean;
  visualSearchEnabled: () => boolean;
  candidateEmbedding: (
    key: string
  ) => number[] | null;
  queryEmbedding: (
    query: string
  ) => Promise<number[] | null>;
  timeoutMs: number;
};

type TimedResult<T> =
  | { timedOut: false; value: T | null }
  | { timedOut: true; value: null };

function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<TimedResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true, value: null });
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value: null });
      }
    );
  });
}

function cosineSimilarity(
  left: number[],
  right: number[]
) {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  return leftMagnitude && rightMagnitude
    ? dot /
        (Math.sqrt(leftMagnitude) *
          Math.sqrt(rightMagnitude))
    : 0;
}

export async function rerankLexicalResultsWithDependencies(
  query: string,
  lexical: SiteSearchResponse,
  dependencies: SemanticSearchDependencies
): Promise<SiteSearchResponse> {
  if (
    !query.trim() ||
    lexical.results.length === 0 ||
    !dependencies.embeddingEnabled()
  ) {
    return {
      ...lexical,
      semanticStatus: "disabled",
      visualSearchEnabled:
        dependencies.visualSearchEnabled()
    };
  }

  const top = lexical.results.slice(
    0,
    SEMANTIC_CANDIDATE_LIMIT
  );
  const precomputed = top.flatMap((result) => {
    const embedding =
      dependencies.candidateEmbedding(
        result.embeddingKey
      );
    return embedding?.length
      ? [{ result, embedding }]
      : [];
  });
  if (precomputed.length === 0) {
    return {
      ...lexical,
      semanticStatus: "no-candidates",
      visualSearchEnabled:
        dependencies.visualSearchEnabled()
    };
  }

  const startedAt = performance.now();
  const queryResult = await settleWithin(
    dependencies.queryEmbedding(query),
    Math.max(
      100,
      Math.min(2_500, dependencies.timeoutMs)
    )
  );
  const semanticMs = performance.now() - startedAt;
  if (queryResult.timedOut) {
    return {
      ...lexical,
      semanticMs,
      semanticStatus: "timeout",
      visualSearchEnabled:
        dependencies.visualSearchEnabled()
    };
  }
  const queryEmbedding = queryResult.value;
  if (!queryEmbedding?.length) {
    return {
      ...lexical,
      semanticMs,
      semanticStatus: "unavailable",
      visualSearchEnabled:
        dependencies.visualSearchEnabled()
    };
  }

  const byKey = new Map(
    precomputed
      .filter(
        (candidate) =>
          candidate.embedding.length ===
          queryEmbedding.length
      )
      .map((candidate) => [
        candidate.result.embeddingKey,
        candidate.embedding
      ])
  );
  if (byKey.size === 0) {
    return {
      ...lexical,
      semanticMs,
      semanticStatus: "unavailable",
      visualSearchEnabled:
        dependencies.visualSearchEnabled()
    };
  }

  const rerankedTop = top
    .map((result) => {
      const embedding = byKey.get(
        result.embeddingKey
      );
      if (!embedding) return result;
      const similarity = Math.max(
        0,
        cosineSimilarity(
          queryEmbedding,
          embedding
        )
      );
      return {
        ...result,
        score: Math.round(
          result.score * 0.7 +
            similarity * 100 * 0.3
        )
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title)
    );

  return {
    ...lexical,
    results: [
      ...rerankedTop,
      ...lexical.results.slice(
        SEMANTIC_CANDIDATE_LIMIT
      )
    ],
    semanticMs,
    semanticStatus: "applied",
    embeddingEnabled: true,
    visualSearchEnabled:
      dependencies.visualSearchEnabled()
  };
}
