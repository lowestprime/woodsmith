import Image from "next/image";
import { PurchaseRequestForm } from "@/components/forms";
import { PageIntro, Shell } from "@/components/site-chrome";
import { pieces } from "@/lib/content";
import { toMediaUrl } from "@/lib/format";

const inventory = pieces.filter((piece) => piece.status === "inventory");

export default function ShopPage() {
  return (
    <section className="section-pad">
      <Shell>
        <PageIntro
          eyebrow="Shop"
          title="Current work and small-batch pieces"
          copy="Reservations stay personal even when the site is handling the intake. Buyers can flag interest, ask for shipping details, or pivot into a related commission from the same form."
        />
        <div className="shop-grid">
          {inventory.map((piece) => (
            <article className="shop-card" key={piece.slug}>
              <div className="shop-card-media image-frame">
                <Image alt={piece.name} fill sizes="(max-width: 980px) 100vw, 50vw" src={toMediaUrl(piece.images[0])} />
              </div>
              <div className="shop-card-body">
                <p className="eyebrow">{piece.category}</p>
                <h2>{piece.name}</h2>
                <p>{piece.summary}</p>
                <p className="detail-kicker">{piece.leadTime}</p>
                <PurchaseRequestForm piece={piece} className="inline-form" />
              </div>
            </article>
          ))}
        </div>
      </Shell>
    </section>
  );
}
