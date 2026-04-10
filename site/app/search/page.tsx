import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { searchSite } from "@/lib/search";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { VisualSearchAssist } from "@/components/visual-search";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const user = await getCurrentUser();
  const { results, embeddingEnabled, visualSearchEnabled } = q ? await searchSite(q, user?.role === "admin") : { results: [], embeddingEnabled: false, visualSearchEnabled: false };

  const statusParts = [];
  if (embeddingEnabled) statusParts.push("semantic embedding re-ranking");
  if (visualSearchEnabled) statusParts.push("AI visual analysis");
  if (statusParts.length === 0) statusParts.push("keyword and metadata matching");

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Search" title="Search the site" copy="Search pieces, shop and process notes, pages, and, when signed into the dashboard, private media tags, clusters, and project records." />
        <form action="/search" className="request-form compact-form">
          <VisualSearchAssist initialQuery={q} isAdmin={user?.role === "admin"} />
          {q ? <p className="muted-copy">Active: {statusParts.join(" + ")}. {results.length} result{results.length === 1 ? "" : "s"} found.</p> : null}
          <button className="button-primary" type="submit">Search</button>
        </form>
        <div className="search-results">
          {results.map((result) => (
            <article className="studio-panel" key={`${result.type}-${result.id}`}>
              <p className="eyebrow">{result.type}{result.private ? " · private" : ""}</p>
              <h2><Link href={result.href}>{result.title}</Link></h2>
              <p>{result.summary}</p>
            </article>
          ))}
        </div>
      </PageSection>
    </Shell>
  );
}
