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
  description: "Browse handcrafted hardwood benches, tables, cabinets, and more from Beaman Woodworks, with verified photography and build notes.",
  openGraph: { title: "Portfolio | Beaman Woodworks", description: "Handcrafted hardwood furniture portfolio." }
};

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await connection();
  const { category } = await searchParams;
  const page = getPage("portfolio");
  const categories = getPortfolioCategories(getSiteSettings().pieceCategories);
  const portfolioCategories = [{ key: "all", label: "All pieces", icon: "all" as const, iconName: "all" as const, iconType: "builtin" as const, customIconSvg: null, aliases: [], sortOrder: -1, visible: true }, ...categories];
  const selectedCategory = portfolioCategories.some((item) => item.key === category) ? String(category) : "all";
  const allPieces = listPieces();
  const pieces = allPieces.filter((piece) => selectedCategory === "all" || getPiecePortfolioCategory(piece, categories) === selectedCategory);
  const counts = new Map<string, number>(portfolioCategories.map((item) => [item.key, item.key === "all" ? allPieces.length : 0]));
  for (const piece of allPieces) {
    const key = getPiecePortfolioCategory(piece, categories);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <>
      <Shell>
        <PageSection editHref="/studio?panel=pieces">
          <PageIntro
            eyebrow="Portfolio"
            title={page?.title ?? "Portfolio"}
            copy={page?.intro ?? "Past pieces grouped by type, with verified photography and practical build notes."}
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
          <div className="piece-grid portfolio-grid">{pieces.map((piece) => <PieceCard categories={categories} key={piece.slug} piece={piece} />)}</div>
        </PageSection>
      </Shell>
    </>
  );
}
