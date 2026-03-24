import { notFound } from "next/navigation";
import { MediaLightbox } from "@/components/lightbox";
import { CommissionRequestForm, ReviewForm } from "@/components/forms";
import { PageSection, ShareLinks, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPiece, listCommissionTypes, listReviews } from "@/lib/db";
import { formatLeadTime, formatMoney, toMediaUrl } from "@/lib/format";

export default async function PiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) {
    notFound();
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const bandwidth = getBandwidthSnapshot();
  const reviews = listReviews(piece.slug).filter((review) => review.status === "published");
  const mediaItems = piece.mediaPaths.map((path) => ({ src: toMediaUrl(path), alt: piece.title }));

  return (
    <Shell>
      <PageSection className="piece-detail-grid">
        <div>
          <p className="eyebrow">{piece.category}</p>
          <h1>{piece.title}</h1>
          <p className="lede">{piece.summary}</p>
          <div className="detail-stack">
            <p>{piece.story}</p>
            <ul className="detail-bullets">{piece.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          </div>
          <div className="meta-grid">
            <div><span>Status</span><strong>{piece.availabilityLabel}</strong></div>
            <div><span>Price</span><strong>{piece.priceCents == null ? formatLeadTime(piece.leadTimeDays) : formatMoney(piece.priceCents)}</strong></div>
            <div><span>Materials</span><strong>{piece.materials.join(" / ")}</strong></div>
            <div><span>Lead time</span><strong>{formatLeadTime(piece.leadTimeDays)}</strong></div>
          </div>
          <ShareLinks title={piece.title} url={`${siteUrl}/portfolio/${piece.slug}`} />
        </div>
        <div>
          {mediaItems.length > 0 ? (
            <MediaLightbox items={mediaItems} title={piece.title} />
          ) : (
            <div className="piece-card-placeholder tall-placeholder">Archival media is being verified for this piece before additional images are shown publicly.</div>
          )}
        </div>
      </PageSection>

      <PageSection className="split-section commissions-layout">
        <div>
          <h2>{piece.status === "inventory" ? "Reserve or adapt this piece" : "Use this piece as the starting point for a commission"}</h2>
          <p>{piece.status === "inventory" ? "If the current build is still available, the cart and checkout flow can handle payment collection. If you need adjustments, the same page can become a custom project brief." : "The commission form below keeps the dimensions, material choices, and live estimate together with the visualizer so the studio can review one complete brief."}</p>
        </div>
        <CommissionRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
          bandwidthPercent={bandwidth.bandwidthPercent}
          commissionTypes={listCommissionTypes()}
          piece={piece}
          queueCount={bandwidth.activeProjects}
        />
      </PageSection>

      <PageSection>
        <h2>Reviews</h2>
        <div className="review-grid">
          {reviews.length > 0 ? reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <strong>{review.title}</strong>
              <span>{review.reviewerName} · {review.rating}/5</span>
              <p>{review.body}</p>
            </article>
          )) : <p className="muted-copy">No approved reviews are published for this piece yet.</p>}
        </div>
        <ReviewForm piece={piece} />
      </PageSection>
    </Shell>
  );
}