import { marked } from "marked";
import { notFound } from "next/navigation";
import { PageSection, Shell } from "@/components/site-chrome";
import { getPage } from "@/lib/db";
import { sanitizeHtml } from "@/lib/format";

const RESERVED = new Set(["portfolio", "shop", "journal", "process", "commissions", "requests", "studio", "about", "account", "search", "media"]);

export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED.has(slug)) {
    notFound();
  }

  const page = getPage(slug);
  if (!page || page.status !== "published") {
    notFound();
  }

  return (
    <Shell>
      <PageSection className="journal-entry" editHref={`/studio?panel=pages&page=${encodeURIComponent(page.slug)}#page-${page.slug}`}>
        <p className="eyebrow">{page.navLabel}</p>
        <h1>{page.title}</h1>
        <p className="lede">{page.intro}</p>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(page.body) as string) }} />
      </PageSection>
    </Shell>
  );
}
