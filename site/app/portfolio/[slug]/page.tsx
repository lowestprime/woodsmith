import { notFound } from "next/navigation";
import { CommissionRequestForm, PurchaseRequestForm } from "@/components/forms";
import { PageIntro, PieceGallery, Shell } from "@/components/site-chrome";
import { getPiece, pieces } from "@/lib/content";

export function generateStaticParams() {
  return pieces.map((piece) => ({ slug: piece.slug }));
}

export default async function PiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const piece = getPiece(slug);

  if (!piece) {
    notFound();
  }

  return (
    <section className="section-pad">
      <Shell>
        <PageIntro eyebrow={piece.category} title={piece.name} copy={piece.story} />
        <div className="piece-detail-layout">
          <div>
            <PieceGallery piece={piece} />
          </div>
          <aside className="piece-detail-panel">
            <p className="eyebrow">{piece.yearLabel}</p>
            <h2>{piece.availabilityLabel}</h2>
            <p className="lede">{piece.summary}</p>
            <p className="detail-kicker">Lead time: {piece.leadTime}</p>
            <ul className="note-list">
              {piece.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {piece.status === "inventory" ? (
              <PurchaseRequestForm piece={piece} />
            ) : (
              <CommissionRequestForm className="inline-form" pieceLabel={piece.name} pieceSlug={piece.slug} />
            )}
          </aside>
        </div>
      </Shell>
    </section>
  );
}
