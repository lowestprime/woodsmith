import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { addToCartAction } from "@/lib/actions";
import { getDisplayMediaPaths, getFulfillmentOptions, getFulfillmentSummary, getPiecePublicPriceDisplay, pieceAllowsInquiry, pieceCanEnterCart, pieceShippingEnabled } from "@/lib/catalog";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getPage, listPieces } from "@/lib/db";
import { formatLeadTime, formatMoney, toMediaUrl } from "@/lib/format";

export const metadata: Metadata = {
  title: "Shop",
  description: "Shop available handcrafted hardwood furniture and pieces from Beaman Woodworks. Reserve, review pricing, and check out securely.",
  openGraph: { title: "Shop | Beaman Woodworks", description: "Available handcrafted hardwood pieces." }
};

export default async function ShopPage() {
  await connection();
  const page = getPage("shop");
  const pieces = listPieces().filter((piece) => piece.status === "inventory");

  return (
    <Shell>
      <PageSection editHref="/studio?panel=pieces">
        <PageIntro
          eyebrow="Shop"
          title={page?.title ?? "Shop"}
          copy={page?.intro ?? "Available work, asking prices, pickup, delivery, and shipping options from the woodshop."}
          targets={{
            title: { resource: "page", id: "shop", field: "title" },
            copy: { resource: "page", id: "shop", field: "intro" }
          }}
        />
        {page?.body ? <p className="page-body-copy" {...inlineEditAttrs({ resource: "page", id: "shop", field: "body" })}>{page.body}</p> : null}
        <p className="fulfillment-note">Most pieces default to in-person pickup near the woodshop or local drop-off review. Shipping appears only when explicitly enabled for a piece.</p>
        <div className="shop-grid">
          {pieces.map((piece) => {
            const firstImage = getDisplayMediaPaths(piece)[0];
            const fulfillment = getFulfillmentOptions(piece);
            const shippingEnabled = pieceShippingEnabled(piece);
            const canAddToCart = pieceCanEnterCart(piece);
            const priceDisplay = getPiecePublicPriceDisplay(piece);
            const priceLabel = priceDisplay.kind === "fixed"
              ? formatMoney(priceDisplay.cents)
              : priceDisplay.kind === "label"
                ? priceDisplay.label
                : "Not publicly listed";
            const canAsk = pieceAllowsInquiry(piece);

            return (
              <article className="shop-card" id={`piece-${piece.slug}`} key={piece.slug}>
                {firstImage ? <Image alt={piece.title} className="shop-card-image" height={900} quality={88} sizes="(max-width: 720px) calc(100vw - 1rem), (max-width: 1500px) 50vw, 33vw" src={toMediaUrl(firstImage)} width={1200} /> : <div className="piece-card-placeholder">Media under review</div>}
                <div className="shop-card-body">
                  <div className="piece-card-meta"><span>{piece.category}</span><span>{piece.inventoryCount} available</span></div>
                  <h2 {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "title" })}><Link href={`/portfolio/${piece.slug}`}>{piece.title}</Link></h2>
                  <p {...inlineEditAttrs({ resource: "piece", id: piece.slug, field: "summary" })}>{piece.summary}</p>
                  <dl className="shop-detail-list">
                    <div><dt>Asking price</dt><dd>{priceLabel}</dd></div>
                    <div><dt>Lead time</dt><dd>{formatLeadTime(piece.leadTimeDays)}</dd></div>
                    <div><dt>Fulfillment</dt><dd>{fulfillment.join(" / ")}</dd></div>
                    <div><dt>Shipping</dt><dd>{shippingEnabled ? "Enabled for this piece" : "Disabled by default"}</dd></div>
                    <div><dt>Tax</dt><dd>Calculated at checkout or on invoice</dd></div>
                  </dl>
                  <p className="muted-copy">{getFulfillmentSummary(piece)}</p>
                  <div className="shop-card-price-row">
                    <span className="muted-copy">Exact pickup/drop-off details stay private until buyer eligibility and consent are confirmed.</span>
                    {canAddToCart ? <form action={addToCartAction}>
                      <input name="pieceSlug" type="hidden" value={piece.slug} />
                      <input name="quantity" type="hidden" value="1" />
                      <button className="button-primary" type="submit">Add to cart</button>
                    </form> : canAsk ? <Link className="button-primary" href={`/contact?piece=${encodeURIComponent(piece.slug)}`}>Ask about this piece</Link> : <span className="muted-copy">Not accepting inquiries</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </PageSection>
    </Shell>
  );
}
