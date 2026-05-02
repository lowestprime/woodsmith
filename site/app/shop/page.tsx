import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { addToCartAction } from "@/lib/actions";
import { getDisplayMediaPaths, getFulfillmentOptions, getFulfillmentSummary, pieceShippingEnabled } from "@/lib/catalog";
import { PageIntro, PageSection, PostCard, Shell } from "@/components/site-chrome";
import { getPage, listPieces, listPosts } from "@/lib/db";
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
  const posts = listPosts();

  return (
    <Shell>
      <PageSection editHref="/studio?panel=pieces">
        <PageIntro eyebrow="Shop" title={page?.title ?? "Shop"} copy={page?.intro ?? "Available work, asking prices, local pickup/drop-off review, and behind-the-scenes notes from the woodshop."} />
        {page?.body ? <p className="page-body-copy">{page.body}</p> : null}
        <p className="fulfillment-note">Most pieces default to in-person pickup near the woodshop or local drop-off review. Shipping appears only when explicitly enabled for a piece.</p>
        <div className="shop-grid">
          {pieces.map((piece) => {
            const firstImage = getDisplayMediaPaths(piece)[0];
            const fulfillment = getFulfillmentOptions(piece);
            const shippingEnabled = pieceShippingEnabled(piece);

            return (
              <article className="shop-card" key={piece.slug}>
                {firstImage ? <img alt={piece.title} className="shop-card-image" loading="lazy" src={toMediaUrl(firstImage)} /> : <div className="piece-card-placeholder">Media under review</div>}
                <div className="shop-card-body">
                  <div className="piece-card-meta"><span>{piece.category}</span><span>{piece.inventoryCount} available</span></div>
                  <h2><Link href={`/portfolio/${piece.slug}`}>{piece.title}</Link></h2>
                  <p>{piece.summary}</p>
                  <dl className="shop-detail-list">
                    <div><dt>Asking price</dt><dd>{piece.priceCents == null ? "Available by request" : formatMoney(piece.priceCents)}</dd></div>
                    <div><dt>Lead time</dt><dd>{formatLeadTime(piece.leadTimeDays)}</dd></div>
                    <div><dt>Fulfillment</dt><dd>{fulfillment.join(" / ")}</dd></div>
                    <div><dt>Shipping</dt><dd>{shippingEnabled ? "Enabled for this piece" : "Disabled by default"}</dd></div>
                    <div><dt>Tax</dt><dd>Calculated at checkout or on invoice</dd></div>
                  </dl>
                  <p className="muted-copy">{getFulfillmentSummary(piece)}</p>
                  <div className="shop-card-price-row">
                    <span className="muted-copy">Exact pickup/drop-off details stay private until buyer eligibility and consent are confirmed.</span>
                    <form action={addToCartAction}>
                      <input name="pieceSlug" type="hidden" value={piece.slug} />
                      <input name="quantity" type="hidden" value="1" />
                      <button className="button-primary" type="submit">Reserve piece</button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </PageSection>

      <PageSection editHref="/studio?panel=process" id="process">
        <PageIntro eyebrow="Process" title="Behind the scenes" copy="Selected notes from the woodshop, including build decisions, materials, and a few outside references worth keeping close to the bench." />
        <div className="journal-listing">{posts.map((post) => <PostCard key={post.slug} post={post} />)}</div>
      </PageSection>
    </Shell>
  );
}
