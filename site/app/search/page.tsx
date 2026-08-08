import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import {
  rerankLexicalResults,
  searchSiteLexical,
  type SiteSearchResponse
} from "@/lib/search";
import {
  PageIntro,
  PageSection,
  Shell
} from "@/components/site-chrome";
import {
  VisualSearchAssist
} from "@/components/visual-search";

function SearchResults({
  query,
  response
}: {
  query: string;
  response: SiteSearchResponse;
}) {
  const semanticLabel =
    response.semanticStatus === "applied"
      ? " Precomputed semantic signals refined the first results."
      : response.semanticStatus === "timeout"
        ? " Semantic enrichment timed out; lexical results remain complete."
        : response.semanticStatus === "unavailable"
          ? " Semantic enrichment was unavailable; lexical results remain complete."
          : "";
  return (
    <div aria-live="polite" aria-busy="false">
      <p className="muted-copy search-result-status">
        FTS5 lexical search found {response.results.length} result{response.results.length === 1 ? "" : "s"} for “{query}” in {Math.max(0.1, response.lexicalMs).toFixed(1)} ms.{semanticLabel}
      </p>
      <div className="search-results">
        {response.results.map((result) => (
          <article
            className="studio-panel"
            key={`${result.type}-${result.id}`}
          >
            <p className="eyebrow">
              {result.type}
              {result.private ? " · private" : ""}
            </p>
            <h2>
              <Link href={result.href}>
                {result.title}
              </Link>
            </h2>
            <p>{result.summary}</p>
          </article>
        ))}
      </div>
      {response.results.length === 0 ? (
        <p className="notice-panel">
          No indexed content matched this search.
        </p>
      ) : null}
    </div>
  );
}

async function SemanticallyRerankedResults({
  query,
  lexical
}: {
  query: string;
  lexical: SiteSearchResponse;
}) {
  const response = await rerankLexicalResults(
    query,
    lexical
  );
  return (
    <SearchResults
      query={query}
      response={response}
    />
  );
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q: rawQuery = "" } = await searchParams;
  const query = (Array.isArray(rawQuery)
    ? rawQuery[0] ?? ""
    : rawQuery
  ).trim().slice(0, 240);
  const user = await getCurrentUser();
  const includePrivate = user?.role === "admin";
  const lexical = searchSiteLexical(
    query,
    includePrivate
  );

  return (
    <Shell>
      <PageSection editHref="/studio?panel=media">
        <PageIntro
          copy="Search pieces, shop and process notes, pages, and, when signed into the dashboard, private media metadata and project records."
          eyebrow="Search"
          title="Search the site"
        />
        <form
          action="/search"
          className="request-form compact-form"
          role="search"
        >
          <VisualSearchAssist
            initialQuery={query}
            isAdmin={includePrivate}
          />
          <button
            className="button-primary"
            type="submit"
          >
            Search
          </button>
        </form>
        {query ? (
          <Suspense
            fallback={
              <SearchResults
                query={query}
                response={lexical}
              />
            }
            key={query}
          >
            <SemanticallyRerankedResults
              lexical={lexical}
              query={query}
            />
          </Suspense>
        ) : (
          <p className="muted-copy">
            Enter at least one word or add a reference image.
          </p>
        )}
      </PageSection>
    </Shell>
  );
}
