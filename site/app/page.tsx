import Image from "next/image";
import Link from "next/link";
import { CommissionRequestForm } from "@/components/forms";
import { DividerBand, FeatureStack, JournalRail, PieceCard, SectionHeading, Shell } from "@/components/site-chrome";
import { pieces, studioValues } from "@/lib/content";
import { toMediaUrl } from "@/lib/format";

const featuredPieces = [pieces[0], pieces[4], pieces[2]];
const reservePieces = pieces.filter((piece) => piece.status === "inventory").slice(0, 3);

export default function HomePage() {
  return (
    <>
      <section className="hero-section">
        <Shell className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Japanese minimalism / vintage restraint / modern utility</p>
            <h1>Furniture, cabinetry, and quiet commissioned work from one self-hosted studio.</h1>
            <p className="lede">
              Built to showcase finished pieces, publish field notes, reserve current work, and carry custom commissions from first brief to delivery updates without leaving the same site.
            </p>
            <div className="hero-actions">
              <Link className="button-primary" href="/portfolio">View Portfolio</Link>
              <Link className="button-secondary" href="/commissions">Start a Commission</Link>
            </div>
            <div className="value-list">
              {studioValues.map((value) => (
                <p key={value}>{value}</p>
              ))}
            </div>
          </div>

          <div className="hero-montage">
            <div className="hero-montage-main">
              <Image alt="Hallway bench" fill priority sizes="(max-width: 900px) 100vw, 40vw" src={toMediaUrl(featuredPieces[0].images[0])} />
            </div>
            <div className="hero-montage-stack">
              <div>
                <Image alt="Pastry table" fill priority sizes="(max-width: 900px) 50vw, 20vw" src={toMediaUrl(featuredPieces[1].images[0])} />
              </div>
              <div>
                <Image alt="Scientist's desk" fill priority sizes="(max-width: 900px) 50vw, 20vw" src={toMediaUrl(featuredPieces[2].images[0])} />
              </div>
            </div>
          </div>
        </Shell>
      </section>

      <Shell>
        <DividerBand />
      </Shell>

      <section className="section-pad">
        <Shell>
          <SectionHeading
            eyebrow="Signature work"
            title="Portfolio pieces anchored in use, proportion, and room presence"
            copy="The studio language moves between cabinetry, work tables, low seating, and smaller objects. Each piece page carries images, context, and the correct next step: reserve, adapt, or commission."
          />
          <FeatureStack pieces={featuredPieces} />
        </Shell>
      </section>

      <section className="section-pad warm-panel">
        <Shell>
          <SectionHeading
            eyebrow="Available now"
            title="Reserve existing work without losing the nuance of a direct conversation"
            copy="Current inventory stays inquiry-based so shipping, finish, and placement decisions can still be handled carefully."
          />
          <div className="piece-grid">
            {reservePieces.map((piece) => (
              <PieceCard key={piece.slug} piece={piece} />
            ))}
          </div>
        </Shell>
      </section>

      <section className="section-pad commission-panel">
        <Shell className="split-section">
          <div>
            <SectionHeading
              eyebrow="Commission flow"
              title="Brief, quote, build notes, and delivery status all stay inside the same website"
              copy="Buyers can open a project, receive a reference number, revisit a live dossier, and post follow-up details as the piece develops."
            />
            <ol className="process-list">
              <li><span>01</span> Submit the brief with room notes, timing, and material preferences.</li>
              <li><span>02</span> Receive a reference page that becomes the shared project record.</li>
              <li><span>03</span> Use the studio dashboard to post public milestones or private build notes.</li>
            </ol>
          </div>
          <CommissionRequestForm className="elevated-form" />
        </Shell>
      </section>

      <section className="section-pad">
        <Shell>
          <SectionHeading
            eyebrow="Journal"
            title="Field notes from the bench"
            copy="A built-in journal keeps process writing alongside the work itself rather than scattered across a third-party platform."
          />
          <JournalRail />
        </Shell>
      </section>
    </>
  );
}
