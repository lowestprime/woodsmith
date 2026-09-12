import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CategoryIcon } from "@/components/category-icon";
import { PageIntro, PageSection, PieceCard, Shell } from "@/components/site-chrome";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getPiecePortfolioCategory, getPortfolioCategories } from "@/lib/catalog";
import { getPage, getSiteSettings, listPieces } from "@/lib/db";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Browse hardwood benches, tables, cabinets, stools, and one-off pieces made by Beaman Woodworks.",
  openGraph: { title: "Portfolio | Beaman Woodworks", description: "Handcrafted hardwood furniture portfolio." }
};

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await connection();
  const { category } = await searchParams;
  const page = getPage("portfolio");
  const categories = getPortfolioCategories(getSiteSettings().pieceCategories);
  const allPieces = listPieces();
  const allCategory = { key: "all", label: "All pieces", icon: "all" as const, iconName: "all" as const, iconType: "builtin" as const, customIconSvg: null, aliases: [], sortOrder: -1, visible: true };
  const allPortfolioCategories = [allCategory, ...categories];
  const selectedCategory = allPortfolioCategories.some((item) => item.key === category) ? String(category) : "all";
  const counts = new Map<string, number>(allPortfolioCategories.map((item) => [item.key, item.key === "all" ? allPieces.length : 0]));
  for (const piece of allPieces) {
    const key = getPiecePortfolioCategory(piece, categories);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const portfolioCategories = allPortfolioCategories.filter((item) => item.key === "all" || (counts.get(item.key) ?? 0) > 0 || item.key === selectedCategory);
  const pieces = allPieces.filter((piece) => selectedCategory === "all" || getPiecePortfolioCategory(piece, categories) === selectedCategory);
  const selectedLabel = allPortfolioCategories.find((item) => item.key === selectedCategory)?.label ?? "All pieces";

  return (
    <>
      <Shell>
        <PageSection editHref="/studio?panel=pieces">
          <PageIntro
            eyebrow="Portfolio"
            title={page?.title ?? "Portfolio"}
            copy={page?.intro ?? "Tables, benches, cabinetry, stools, and one-off pieces from the Beaman woodshop."}
            targets={{
              title: { resource: "page", id: "portfolio", field: "title" },
              copy: { resource: "page", id: "portfolio", field: "intro" }
            }}
          />
          {page?.body ? <p className="page-body-copy" {...inlineEditAttrs({ resource: "page", id: "portfolio", field: "body" })}>{page.body}</p> : null}
          <nav className="portfolio-filter-row" aria-label="Piece categories">
            {portfolioCategories.map((item) => {
              const active = item.key === selectedCategory;
              const href = item.key === "all" ? "/portfolio" : `/portfolio?category=${encodeURIComponent(item.key)}`;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`portfolio-filter-pill ${active ? "is-active" : ""}`.trim()}
                  href={href}
                  key={item.key}
                >
                  <span className="portfolio-filter-mark" aria-hidden="true"><CategoryIcon category={item} /></span>
                  <span>{item.label}</span>
                  <strong>{counts.get(item.key) ?? 0}</strong>
                </Link>
              );
            })}
          </nav>
          <p className="portfolio-result-summary" aria-live="polite">{pieces.length} piece{pieces.length === 1 ? "" : "s"}{selectedCategory === "all" ? "" : ` in ${selectedLabel}`}</p>
          <h2 className="visually-hidden">Portfolio pieces</h2>
          {pieces.length > 0 ? <div aria-label="Portfolio pieces" className="piece-grid portfolio-grid" data-media-collection="portfolio-pieces" data-media-collection-variant="editorial-grid" role="region">{pieces.map((piece, index) => <PieceCard categories={categories} key={piece.slug} order={index} piece={piece} />)}</div> : <div className="public-empty-state"><h2>No pieces in this category yet</h2><p>Browse the full portfolio or contact the woodshop about a related build.</p><div className="hero-actions"><Link className="button-secondary" href="/portfolio">View all pieces</Link><Link className="button-primary" href="/contact">Contact the woodshop</Link></div></div>}
        </PageSection>
      </Shell>
    </>
  );
}
