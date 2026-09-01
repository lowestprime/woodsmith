import {
  createTextEmbeddings,
  getAiServiceStatus
} from "@/lib/ai-services";
import {
  getEmbeddingCache,
  searchSite as lexicalSearchSite
} from "@/lib/db";
import {
  rerankLexicalResultsWithDependencies,
  type SemanticSearchDependencies,
  type SiteSearchResponse
} from "./search-rerank.ts";

export type {
  SemanticSearchDependencies,
  SemanticSearchStatus,
  SiteSearchResponse
} from "./search-rerank.ts";

const DEFAULT_SEMANTIC_TIMEOUT_MS = 2_000;

function semanticTimeoutMs() {
  const configured = Number(
    process.env.SEARCH_SEMANTIC_TIMEOUT_MS ??
      DEFAULT_SEMANTIC_TIMEOUT_MS
  );
  return Math.max(
    100,
    Math.min(
      2_500,
      Number.isFinite(configured)
        ? Math.round(configured)
        : DEFAULT_SEMANTIC_TIMEOUT_MS
    )
  );
}

const defaultDependencies: SemanticSearchDependencies = {
  embeddingEnabled: () =>
    getAiServiceStatus().embeddingSearch,
  visualSearchEnabled: () =>
    getAiServiceStatus().mediaAnalysis,
  candidateEmbedding: (key) => {
    const cached = getEmbeddingCache(key);
    return cached?.embedding?.length
      ? cached.embedding
      : null;
  },
  queryEmbedding: async (query) => {
    const embeddings = await createTextEmbeddings([
      query
    ]).catch(() => null);
    return embeddings?.[0]?.length
      ? embeddings[0]
      : null;
  },
  timeoutMs: semanticTimeoutMs()
};

export function searchSiteLexical(
  query: string,
  includePrivate = false
): SiteSearchResponse {
  const startedAt = performance.now();
  const results = lexicalSearchSite(
    query,
    includePrivate
  );
  return {
    results,
    lexicalMs: performance.now() - startedAt,
    semanticMs: null,
    semanticStatus: "disabled",
    embeddingEnabled: false,
    visualSearchEnabled:
      defaultDependencies.visualSearchEnabled()
  };
}

export async function rerankLexicalResults(
  query: string,
  lexical: SiteSearchResponse,
  dependencies: SemanticSearchDependencies =
    defaultDependencies
) {
  return rerankLexicalResultsWithDependencies(
    query,
    lexical,
    dependencies
  );
}

export async function searchSite(
  query: string,
  includePrivate = false
) {
  return rerankLexicalResults(
    query,
    searchSiteLexical(query, includePrivate)
  );
}

export async function visualSearchByImageTags(
  tags: string[],
  includePrivate = false
) {
  const { results } = await searchSite(
    tags.join(" "),
    includePrivate
  );
  return results;
}
