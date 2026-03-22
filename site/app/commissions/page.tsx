import Link from "next/link";
import { CommissionRequestForm } from "@/components/forms";
import { PageIntro, PieceCard, Shell } from "@/components/site-chrome";
import { pieces } from "@/lib/content";

const commissionPieces = pieces.filter((piece) => piece.status === "commission");

export default function CommissionsPage() {
  return (
    <section className="section-pad">
      <Shell>
        <PageIntro
          eyebrow="Commissions"
          title="From first measurements to final delivery, the custom-work flow stays on your own website"
          copy="Start with the brief, keep the dossier on a reference page, and return whenever the buyer or the studio needs to add a note."
        />
        <div className="split-section commissions-layout">
          <div>
            <div className="process-tiles">
              <article>
                <h2>1. Scope the room</h2>
                <p>Use the intake form to capture dimensions, timing, budget, and the kind of life the piece has to support.</p>
              </article>
              <article>
                <h2>2. Issue a reference</h2>
                <p>Each inquiry becomes a shared request page that can hold public updates, stage changes, and delivery notes.</p>
              </article>
              <article>
                <h2>3. Build with context</h2>
                <p>The same system holds cabinetry, tables, benches, and small objects, so the process does not fragment when the project changes shape.</p>
              </article>
            </div>
            <p className="status-path-copy">
              Already have a reference? <Link href="/commissions/status">Look up your request status here.</Link>
            </p>
          </div>
          <CommissionRequestForm className="elevated-form" />
        </div>

        <div className="piece-grid top-gap">
          {commissionPieces.map((piece) => (
            <PieceCard key={piece.slug} piece={piece} />
          ))}
        </div>
      </Shell>
    </section>
  );
}
