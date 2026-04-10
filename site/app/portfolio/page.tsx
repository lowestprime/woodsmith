import Link from "next/link";
import { CategoryIcon, DividerBand, PageIntro, PageSection, PieceCard, Shell } from "@/components/site-chrome";
import { portfolioCategories, type PortfolioCategoryKey, getPiecePortfolioCategory } from "@/lib/catalog";
import { getPage, listPieces } from "@/lib/db";

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const page = getPage("portfolio");
  const selectedCategory = portfolioCategories.some((item) => item.key === category) ? (category as PortfolioCategoryKey) : "all";
  const allPieces = listPieces();
  const pieces = allPieces.filter((piece) => selectedCategory === "all" || getPiecePortfolioCategory(piece) === selectedCategory);
  const counts = new Map<PortfolioCategoryKey, number>(portfolioCategories.map((item) => [item.key, item.key === "all" ? allPieces.length : 0]));
  for (const piece of allPieces) {
    const key = getPiecePortfolioCategory(piece);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <>
      <Shell>
        <PageSection>
          <PageIntro eyebrow="Portfolio" title={page?.title ?? "Portfolio"} copy={page?.intro ?? "Past pieces grouped by type, with verified photography and practical build notes."} />
          <div className="portfolio-filter-row" role="tablist" aria-label="Piece categories">
            {portfolioCategories.map((item) => {
              const active = item.key === selectedCategory;
              const href = item.key === "all" ? "/portfolio" : `/portfolio?category=${encodeURIComponent(item.key)}`;
              return (
                <Link
                  aria-selected={active}
                  className={`portfolio-filter-pill ${active ? "is-active" : ""}`.trim()}
                  href={href}
                  key={item.key}
                  role="tab"
                >
                  <span className="portfolio-filter-mark" aria-hidden="true"><CategoryIcon category={item.key} /></span>
                  <span>{item.label}</span>
                  <strong>{counts.get(item.key) ?? 0}</strong>
                </Link>
              );
            })}
          </div>
          <div className="piece-grid portfolio-grid">{pieces.map((piece) => <PieceCard key={piece.slug} piece={piece} />)}</div>
        </PageSection>
      </Shell>
      <DividerBand />
    </>
  );
}
