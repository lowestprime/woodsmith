import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ContactRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { pieceAllowsInquiry } from "@/lib/catalog";
import { getBandwidthSnapshot, getPiece, getSiteSettings, listCommissionTypes } from "@/lib/db";

export const metadata: Metadata = {
  title: "Contact Beaman Woodworks",
  description: "Ask about a custom piece, a commission, or any woodworking question. Messages route directly to the woodshop.",
  openGraph: { title: "Contact | Beaman Woodworks", description: "Contact the Beaman Woodworks woodshop." }
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ piece?: string; error?: string }> }) {
  await connection();
  const { piece: pieceSlug = "", error = "" } = await searchParams;
  const site = getSiteSettings();
  const bandwidth = getBandwidthSnapshot();
  const requestedPiece = pieceSlug ? getPiece(pieceSlug) : null;
  const selectedPiece = requestedPiece && pieceAllowsInquiry(requestedPiece) ? requestedPiece : undefined;

  return (
    <Shell>
      <PageSection editHref="/studio?panel=settings">
        <PageIntro
          eyebrow="Contact"
          title="Contact the woodshop"
          copy="Ask about an available piece, a custom build, delivery, care, or repair. William reviews each inquiry directly."
        />
        <p className="muted-copy">
          Prefer email? Reach us at <a href={`mailto:${site.builderEmail}`}>{site.builderEmail}</a>. You can also
          {" "}
          <Link href="/commissions">plan a detailed custom piece</Link>
          {" "}
          or
          {" "}
          <Link href="/commissions/status">check the status of an existing project</Link>.
        </p>
        {error ? <p className="notice-panel" role="alert">{error}</p> : null}
        {pieceSlug && !selectedPiece ? <p className="notice-panel" role="alert">That piece is not currently accepting inquiries. You can still send a general custom-work request below.</p> : null}
        <ContactRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
          commissionTypes={listCommissionTypes()}
          piece={selectedPiece}
          queueCount={bandwidth.activeProjects}
        />
      </PageSection>
    </Shell>
  );
}
