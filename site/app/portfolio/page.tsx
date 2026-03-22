import { PageIntro, PieceCard, Shell } from "@/components/site-chrome";
import { pieces } from "@/lib/content";

export default function PortfolioPage() {
  return (
    <section className="section-pad">
      <Shell>
        <PageIntro
          eyebrow="Portfolio"
          title="Past pieces, current work, and commission patterns"
          copy="This catalogue mixes finished work, recent studies, and adaptable patterns that can move into a buyer brief without losing their original character."
        />
        <div className="piece-grid portfolio-grid">
          {pieces.map((piece) => (
            <PieceCard key={piece.slug} piece={piece} />
          ))}
        </div>
      </Shell>
    </section>
  );
}
