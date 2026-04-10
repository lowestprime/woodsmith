import { notFound } from "next/navigation";
import { MediaLightbox } from "@/components/lightbox";
import { ContactRequestForm, ReviewForm } from "@/components/forms";
import { getDisplayMediaPaths, getFulfillmentOptions } from "@/lib/catalog";
import { PageSection, ShareLinks, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPiece, listCommissionTypes, listReviews } from "@/lib/db";
import { formatDate, formatDimensions, formatLeadTime, toMediaUrl } from "@/lib/format";

export default async function PiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) {
    notFound();
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const bandwidth = getBandwidthSnapshot();
  const reviews = listReviews(piece.slug).filter((review) => review.status === "published");
  const mediaItems = getDisplayMediaPaths(piece).map((path) => ({ src: toMediaUrl(path), alt: piece.title }));
  const fulfillment = getFulfillmentOptions(piece);

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
            <div><span>Dimensions</span><strong>{formatDimensions(piece.dimensions)}</strong></div>
            <div><span>Materials</span><strong>{piece.materials.join(" / ")}</strong></div>
            <div><span>Lead time</span><strong>{formatLeadTime(piece.leadTimeDays)}</strong></div>
            <div><span>Fulfillment</span><strong>{fulfillment.join(" / ")}</strong></div>
            <div><span>Updated</span><strong>{formatDate(piece.updatedAt)}</strong></div>
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
          <h2>{piece.status === "inventory" ? "Ask about this piece" : "Use this piece as the starting point for custom work"}</h2>
          <p>{piece.status === "inventory" ? "Use this contact form if you want to reserve the current build, confirm delivery options, or ask for a related variation. Checkout details stay in the shop." : "Custom work begins with a direct note about the room, intended use, timing, and material preferences. The private project workflow takes over after the initial review."}</p>
        </div>
        <ContactRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
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
