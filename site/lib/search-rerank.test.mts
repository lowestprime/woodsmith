import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rerankLexicalResultsWithDependencies,
  type SemanticSearchDependencies,
  type SiteSearchResponse
} from "./search-rerank.ts";
import type { SearchResult } from "./search-index.ts";

function result(
  id: string,
  score: number
): SearchResult {
  return {
    id,
    type: "piece",
    title: id,
    href: `/portfolio/${id}`,
    summary: id,
    score,
    private: false,
    embeddingKey: `piece:${id}`
  };
}

function lexical(
  results: SearchResult[]
): SiteSearchResponse {
  return {
    results,
    lexicalMs: 2,
    semanticMs: null,
    semanticStatus: "disabled",
    embeddingEnabled: false,
    visualSearchEnabled: false
  };
}

function dependencies(
  overrides: Partial<SemanticSearchDependencies> = {}
): SemanticSearchDependencies {
  return {
    embeddingEnabled: () => true,
    visualSearchEnabled: () => false,
    candidateEmbedding: () => null,
    queryEmbedding: async () => [1, 0],
    timeoutMs: 100,
    ...overrides
  };
}

test("semantic rerank uses only bounded precomputed lexical candidates", async () => {
  const candidates = [
    result("lexical-first", 100),
    result("semantic-first", 99),
    ...Array.from(
      { length: 28 },
      (_, index) =>
        result(`tail-${index}`, 98 - index)
    )
  ];
  const requested: string[] = [];
  let queryCalls = 0;
  const response = await rerankLexicalResultsWithDependencies(
    "maple",
    lexical(candidates),
    dependencies({
      candidateEmbedding: (key) => {
        requested.push(key);
        if (key === "piece:lexical-first") {
          return [0, 1];
        }
        if (key === "piece:semantic-first") {
          return [1, 0];
        }
        return null;
      },
      queryEmbedding: async () => {
        queryCalls += 1;
        return [1, 0];
      }
    })
  );
  assert.equal(requested.length, 24);
  assert.equal(queryCalls, 1);
  assert.equal(response.semanticStatus, "applied");
  assert.equal(response.results[0]?.id, "semantic-first");
  assert.deepEqual(
    response.results.slice(24).map((item) => item.id),
    candidates.slice(24).map((item) => item.id)
  );
});

test("semantic enrichment never runs when disabled or no cached candidate exists", async () => {
  let queryCalls = 0;
  const disabled = await rerankLexicalResultsWithDependencies(
    "maple",
    lexical([result("one", 100)]),
    dependencies({
      embeddingEnabled: () => false,
      queryEmbedding: async () => {
        queryCalls += 1;
        return [1, 0];
      }
    })
  );
  assert.equal(disabled.semanticStatus, "disabled");
  const noCandidates = await rerankLexicalResultsWithDependencies(
    "maple",
    lexical([result("one", 100)]),
    dependencies({
      queryEmbedding: async () => {
        queryCalls += 1;
        return [1, 0];
      }
    })
  );
  assert.equal(noCandidates.semanticStatus, "no-candidates");
  assert.equal(queryCalls, 0);
});

test("sidecar failure and timeout return the unchanged lexical response", async () => {
  const source = lexical([result("one", 100)]);
  const unavailable = await rerankLexicalResultsWithDependencies(
    "maple",
    source,
    dependencies({
      candidateEmbedding: () => [1, 0],
      queryEmbedding: async () => {
        throw new Error("offline");
      }
    })
  );
  assert.equal(unavailable.semanticStatus, "unavailable");
  assert.deepEqual(unavailable.results, source.results);

  const startedAt = performance.now();
  const timeout = await rerankLexicalResultsWithDependencies(
    "maple",
    source,
    dependencies({
      candidateEmbedding: () => [1, 0],
      queryEmbedding: () =>
        new Promise<number[] | null>(() => undefined),
      timeoutMs: 100
    })
  );
  const elapsed = performance.now() - startedAt;
  assert.equal(timeout.semanticStatus, "timeout");
  assert.deepEqual(timeout.results, source.results);
  assert.ok(elapsed >= 90 && elapsed < 500);
});

test("search source contains no request-time corpus embedding path and input resynchronizes", () => {
  const searchSource = readFileSync(
    new URL("./search.ts", import.meta.url),
    "utf8"
  );
  const inputSource = readFileSync(
    new URL("../components/visual-search.tsx", import.meta.url),
    "utf8"
  );
  const pageSource = readFileSync(
    new URL("../app/search/page.tsx", import.meta.url),
    "utf8"
  );
  const adminSource = readFileSync(
    new URL("../components/studio/studio-search-index-admin.tsx", import.meta.url),
    "utf8"
  );
  const actionsSource = readFileSync(
    new URL("./actions.ts", import.meta.url),
    "utf8"
  );
  const layoutSource = readFileSync(
    new URL("../app/ui-repair.css", import.meta.url),
    "utf8"
  );
  const searchActionSource = actionsSource.slice(
    actionsSource.indexOf(
      "export async function checkSearchIndexIntegrityAction"
    ),
    actionsSource.indexOf(
      "export async function verifySmtpConfigurationAction"
    )
  );
  assert.doesNotMatch(searchSource, /buildCandidates/);
  assert.doesNotMatch(searchSource, /saveEmbeddingCache/);
  assert.doesNotMatch(
    searchSource,
    /createTextEmbeddings\(\s*(?:texts|candidates)/
  );
  assert.match(
    searchSource,
    /createTextEmbeddings\(\s*\[\s*query\s*\]/
  );
  assert.match(
    inputSource,
    /useEffect\(\(\)\s*=>\s*\{\s*setQuery\(initialQuery\)/s
  );
  assert.match(
    inputSource,
    /\},\s*\[initialQuery\]\s*\)/s
  );
  assert.match(
    pageSource,
    /Array\.isArray\(rawQuery\)/
  );
  assert.match(
    adminSource,
    /integrityStatus\s*!==\s*"out-of-sync"/
  );
  assert.match(adminSource, /useLayoutEffect\(\(\)\s*=>/);
  assert.match(adminSource, /window\.scrollTo\(/);
  assert.match(adminSource, /toISOString\(\)/);
  assert.doesNotMatch(
    searchActionSource,
    /revalidatePath\(/
  );
  assert.match(
    layoutSource,
    /\.search-index-card \.studio-save-state\s*\{[^}]*min-block-size:/s
  );
});
