import Link from "next/link";
import { addToCartAction } from "@/lib/actions";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getPage, listPieces } from "@/lib/db";
import { formatLeadTime, formatMoney, toMediaUrl } from "@/lib/format";

export default function ShopPage() {
  const page = getPage("shop");
  const pieces = listPieces().filter((piece) => piece.status === "inventory");

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="The Piece Ledger" title={page?.title ?? "Shop"} copy={page?.intro ?? "Available work with cart, checkout, shipping, and invoice support."} />
        <div className="shop-grid">
          {pieces.map((piece) => (
            <article className="shop-card" key={piece.slug}>
              {piece.mediaPaths[0] ? <img alt={piece.title} className="shop-card-image" loading="lazy" src={toMediaUrl(piece.mediaPaths[0])} /> : <div className="piece-card-placeholder">Media under review</div>}
              <div className="shop-card-body">
                <div className="piece-card-meta"><span>{piece.category}</span><span>{piece.inventoryCount} available</span></div>
                <h2><Link href={`/portfolio/${piece.slug}`}>{piece.title}</Link></h2>
                <p>{piece.summary}</p>
                <div className="shop-card-price-row">
                  <strong>{piece.priceCents == null ? formatLeadTime(piece.leadTimeDays) : formatMoney(piece.priceCents)}</strong>
                  <form action={addToCartAction}>
                    <input name="pieceSlug" type="hidden" value={piece.slug} />
                    <input name="quantity" type="hidden" value="1" />
                    <button className="button-primary" type="submit">Add to cart</button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      </PageSection>
    </Shell>
  );
}
