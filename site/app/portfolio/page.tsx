import { DividerBand, PageIntro, PageSection, PieceCard, Shell } from "@/components/site-chrome";
import { getPage, listPieces } from "@/lib/db";

export default function PortfolioPage() {
  const page = getPage("portfolio");
  const pieces = listPieces();

  return (
    <>
      <Shell>
        <PageSection>
          <PageIntro eyebrow="Portfolio" title={page?.title ?? "Portfolio"} copy={page?.intro ?? "Past pieces and current build patterns."} />
          <div className="piece-grid portfolio-grid">{pieces.map((piece) => <PieceCard key={piece.slug} piece={piece} />)}</div>
        </PageSection>
      </Shell>
      <DividerBand />
    </>
  );
}
