import { getCurrentUser } from "@/lib/auth";
import { searchSite } from "@/lib/search";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { VisualSearchAssist } from "@/components/visual-search";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const user = await getCurrentUser();
  const { results, embeddingEnabled } = q ? await searchSite(q, user?.role === "admin") : { results: [], embeddingEnabled: false };

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Search" title="Search the site" copy="Search pieces, shop/process notes, pages, and, when signed into the dashboard, private media tags, clusters, and project records." />
        <form action="/search" className="request-form compact-form">
          <VisualSearchAssist initialQuery={q} isAdmin={user?.role === "admin"} />
          <p className="muted-copy">{embeddingEnabled ? "Embedding ranking is active for this query." : "Keyword, metadata, and browser-derived visual tags are active. Embedding ranking activates when configured."}</p>
          <button className="button-primary" type="submit">Search</button>
        </form>
        <div className="search-results">
          {results.map((result) => (
            <article className="studio-panel" key={`${result.type}-${result.id}`}>
              <p className="eyebrow">{result.type}{result.private ? " · private" : ""}</p>
              <h2><a href={result.href}>{result.title}</a></h2>
              <p>{result.summary}</p>
            </article>
          ))}
        </div>
      </PageSection>
    </Shell>
  );
}
