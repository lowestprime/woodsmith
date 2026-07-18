import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { MediaCollection } from "@/components/media-collection";
import { ContactRequestForm, ReviewForm } from "@/components/forms";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getDisplayMediaPaths, getFulfillmentOptions, getPieceProcessMediaLinks, pieceAcceptsReviews, pieceAllowsInquiry, pieceDisplaysReviews } from "@/lib/catalog";
import { PageSection, ShareLinks, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getMedia, getPiece, listCommissionTypes, listPieceMediaLinks, listReviews } from "@/lib/db";
import { formatDate, formatDimensions, formatLeadTime, toMediaUrl } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) return { title: "Piece not found" };
  const firstMedia = getDisplayMediaPaths(piece)[0];
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").replace(/\/$/, "");
  return {
    title: piece.title,
    description: piece.subtitle || piece.summary || `${piece.title} by Beaman Woodworks.`,
    openGraph: {
      title: `${piece.title} | Beaman Woodworks`,
      description: piece.summary || piece.subtitle || "",
      ...(firstMedia && siteUrl ? { images: [{ url: `${siteUrl}/media/${firstMedia}` }] } : {})
    }
  };
}

export default async function PiecePage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const piece = getPiece(slug);
  if (!piece) {
    notFound();
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const bandwidth = getBandwidthSnapshot();
  const showReviews = pieceDisplaysReviews(piece);
  const acceptReviews = pieceAcceptsReviews(piece);
  const allowInquiry = pieceAllowsInquiry(piece);
  const reviews = showReviews ? listReviews(piece.slug).filter((review) => review.status === "published") : [];
  const displayPaths = getDisplayMediaPaths(piece);
  const displayLinkByPath = new Map(listPieceMediaLinks(piece.slug, { publicOnly: true, roles: ["hero", "gallery", "detail", "context"] }).map((link) => [link.relativePath, link]));
  const mediaItems = displayPaths.map((path, index) => {
    const media = getMedia(path);
    const link = displayLinkByPath.get(path);
    return {
      id: link?.id ?? `piece:${piece.slug}:${path}`,
      src: toMediaUrl(path),
      alt: media?.altText || piece.title,
      kind: media?.kind === "video" ? "video" as const : "image" as const,
      focalX: media?.focalX,
      focalY: media?.focalY,
      zoom: media?.zoom,
      cleanupMode: typeof media?.metadata.cleanupMode === "string" ? media.metadata.cleanupMode : undefined,
      caption: link?.caption,
      title: link?.title,
      role: link?.role,
      order: link?.displayOrder ?? index
    };
  });
  const fulfillment = getFulfillmentOptions(piece);
  const processLinks = getPieceProcessMediaLinks(piece);
  const processMediaItems = processLinks.flatMap((link) => {
    const media = getMedia(link.relativePath);
    if (!media) return [];
    return [{
      id: link.id,
      src: toMediaUrl(link.relativePath),
      alt: link.altOverride || media.altText || link.caption || piece.title,
      kind: media.kind === "video" ? "video" as const : "image" as const,
      focalX: media.focalX,
      focalY: media.focalY,
      zoom: media.zoom,
      cleanupMode: typeof media.metadata.cleanupMode === "string" ? media.metadata.cleanupMode : undefined,
      caption: link.caption,
      title: link.title,
      stage: link.stage,
      occurredAt: link.occurredAt,
      role: link.role,
      order: link.displayOrder
    }];
  });

  return (
    <Shell>
      <PageSection className="piece-detail-grid" editHref={`/studio?panel=pieces&piece=${encodeURIComponent(piece.slug)}#piece-${piece.slug}`}>
        <div>
          <p className="eyebrow">{piece.category}</p>
          <h1 {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "title" })}>{piece.title}</h1>
          <p className="lede" {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "summary" })}>{piece.summary}</p>
          <div className="detail-stack">
            <p {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "story" })}>{piece.story}</p>
            <ul className="detail-bullets">{piece.details.map((detail, index) => <li key={`${detail}-${index}`} {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "details", index })}>{detail}</li>)}</ul>
          </div>
          <div className="meta-grid">
            <div><span>Status</span><strong {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "availabilityLabel" })}>{piece.availabilityLabel}</strong></div>
            <div><span>Dimensions</span><strong>{formatDimensions(piece.dimensions)}</strong></div>
            <div><span>Materials</span><strong className="inline-list">{piece.materials.map((material, index) => <span key={`${material}-${index}`} {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "materials", index })}>{material}</span>)}</strong></div>
            <div><span>Lead time</span><strong>{formatLeadTime(piece.leadTimeDays)}</strong></div>
            <div><span>Fulfillment</span><strong>{fulfillment.join(" / ")}</strong></div>
            <div><span>Updated</span><strong>{formatDate(piece.updatedAt)}</strong></div>
          </div>
          {piece.status === "inventory" ? (
            <div className="piece-reserve-panel">
              <div>
                <span>Availability</span>
                <strong>{piece.availabilityLabel}</strong>
                <small>{Math.max(0, piece.inventoryCount)} available</small>
              </div>
              <Link className="button-primary" href={`/shop#piece-${encodeURIComponent(piece.slug)}`}>View shop details</Link>
            </div>
          ) : null}
          <ShareLinks title={piece.title} url={`${siteUrl}/portfolio/${piece.slug}`} />
        </div>
        <div>
          {mediaItems.length > 0 ? (
            <MediaCollection collectionId={`${piece.slug}:gallery`} items={mediaItems} preloadFirst title={piece.title} variant="detail-stage" />
          ) : (
            <div className="piece-card-placeholder tall-placeholder">Archival media is being verified for this piece before additional images are shown publicly.</div>
          )}
        </div>
      </PageSection>

      {processLinks.length > 0 ? <PageSection className="piece-process-section" editHref={`/studio?panel=pieces&piece=${encodeURIComponent(piece.slug)}#piece-${piece.slug}`}>
        <div className="section-heading"><p className="eyebrow">Build record</p><h2>{piece.processSectionTitle || "Build record"}</h2>{piece.processSectionIntro ? <p>{piece.processSectionIntro}</p> : null}</div>
        {processMediaItems.length > 0 ? <MediaCollection collectionId={`${piece.slug}:build-record`} items={processMediaItems} title={`${piece.title} build record`} variant="process-sequence" /> : null}
      </PageSection> : null}

      {allowInquiry ? <PageSection className="split-section commissions-layout" editHref={`/studio?panel=custom&piece=${encodeURIComponent(piece.slug)}`}>
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
      </PageSection> : null}

      {showReviews ? <PageSection editHref={`/studio?panel=reviews&piece=${encodeURIComponent(piece.slug)}`}>
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
        {acceptReviews ? <ReviewForm piece={piece} /> : null}
      </PageSection> : null}
    </Shell>
  );
}
