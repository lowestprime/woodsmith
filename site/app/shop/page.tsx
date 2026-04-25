import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { addToCartAction } from "@/lib/actions";
import { getDisplayMediaPaths, getFulfillmentOptions } from "@/lib/catalog";
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
        <PageIntro eyebrow="Shop" title={page?.title ?? "Shop"} copy={page?.intro ?? "Available work, asking prices, delivery options, and behind-the-scenes notes from the woodshop."} />
        {page?.body ? <p className="page-body-copy">{page.body}</p> : null}
        <div className="shop-grid">
          {pieces.map((piece) => {
            const firstImage = getDisplayMediaPaths(piece)[0];
            const fulfillment = getFulfillmentOptions(piece);

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
                    <div><dt>Delivery</dt><dd>{fulfillment.join(" / ")}</dd></div>
                    <div><dt>Tax</dt><dd>Calculated at checkout or on invoice</dd></div>
                  </dl>
                  <div className="shop-card-price-row">
                    <span className="muted-copy">Materials and delivery are reviewed before final payment.</span>
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
