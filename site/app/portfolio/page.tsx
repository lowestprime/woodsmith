import Link from "next/link";
import { DividerBand, PageIntro, PageSection, PieceCard, Shell } from "@/components/site-chrome";
import { portfolioCategories, type PortfolioCategoryKey, getPiecePortfolioCategory } from "@/lib/catalog";
import { getPage, listPieces } from "@/lib/db";

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const page = getPage("portfolio");
  const selectedCategory = portfolioCategories.some((item) => item.key === category) ? (category as PortfolioCategoryKey) : "all";
  const pieces = listPieces().filter((piece) => selectedCategory === "all" || getPiecePortfolioCategory(piece) === selectedCategory);

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
                  <span className="portfolio-filter-mark" aria-hidden="true">{item.label.slice(0, 1)}</span>
                  <span>{item.label}</span>
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
