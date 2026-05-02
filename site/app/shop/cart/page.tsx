import { cookies } from "next/headers";
import { removeCartItemAction, startCheckoutAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { getDisplayMediaPaths, getFulfillmentSummary } from "@/lib/catalog";
import { getPiece, getSiteSettings, listCartItems } from "@/lib/db";
import { calculateCheckoutTotals } from "@/lib/payments";
import { formatMoney, toMediaUrl } from "@/lib/format";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const cartToken = cookieStore.get("beaman-cart")?.value || "";
  const user = await getCurrentUser();
  const site = getSiteSettings();
  const cartItems = listCartItems(cartToken, user?.email ?? null);
  const lines = cartItems.flatMap((item) => {
    const piece = getPiece(item.pieceSlug);
    if (!piece || piece.priceCents == null) {
      return [];
    }
    return [{ item, piece }];
  });
  const totals = calculateCheckoutTotals({
    lines: lines.map(({ item, piece }) => ({ slug: piece.slug, title: piece.title, quantity: item.quantity, unitAmountCents: piece.priceCents!, description: piece.subtitle })),
    couponCodes: [...site.couponCodes],
    shippingBaseCents: 0,
    shippingPerItemCents: 0,
    taxRate: site.localTaxRate,
    couponCode: null
  });

  return (
    <Shell>
      <PageSection editHref="/studio?panel=orders">
        <PageIntro eyebrow="Cart" title="Your ledger" copy="Reserve pieces, confirm pickup or local drop-off eligibility, and request shipping only when the piece explicitly supports it." />
        {error ? <div className="notice-panel" role="alert"><p>{error}</p></div> : null}
        <div className="cart-layout">
          <div className="cart-items">
            {lines.length > 0 ? lines.map(({ item, piece }) => (
              <article className="cart-line" key={item.id}>
                {getDisplayMediaPaths(piece)[0] ? <img alt={piece.title} src={toMediaUrl(getDisplayMediaPaths(piece)[0])} /> : <div className="piece-card-placeholder">No image</div>}
                <div>
                  <h2>{piece.title}</h2>
                  <p>{piece.subtitle}</p>
                  <p className="muted-copy">{getFulfillmentSummary(piece)}</p>
                  <strong>{formatMoney(piece.priceCents)}</strong>
                </div>
                <div className="cart-line-actions">
                  <span>Qty {item.quantity}</span>
                  <form action={removeCartItemAction}>
                    <input name="id" type="hidden" value={item.id} />
                    <button className="button-secondary" type="submit">Remove</button>
                  </form>
                </div>
              </article>
            )) : <p className="muted-copy">Your cart is empty.</p>}
          </div>
          <div className="cart-summary studio-panel">
            <h2>Reserve and review</h2>
            <dl className="estimate-list">
              <div><dt>Subtotal</dt><dd>{formatMoney(totals.subtotalCents)}</dd></div>
              <div><dt>Fulfillment</dt><dd>Pickup/drop-off review</dd></div>
              <div><dt>Tax estimate</dt><dd>{formatMoney(totals.taxCents)}</dd></div>
              <div><dt>Total before final logistics</dt><dd>{formatMoney(totals.totalCents)}</dd></div>
            </dl>
            <p className="fulfillment-note">Address details are collected only to determine pickup/drop-off eligibility and buyer consent. The woodshop address remains private until a pickup or drop-off is approved.</p>
            <form action={startCheckoutAction} className="request-form compact-form">
              <label>
                <span>Email</span>
                <input defaultValue={user?.email ?? ""} name="email" required type="email" />
              </label>
              <label>
                <span>Coupon code</span>
                <input name="couponCode" type="text" />
              </label>
              <label>
                <span>Buyer name</span>
                <input name="shippingName" required type="text" />
              </label>
              <label>
                <span>Pickup/drop-off address or nearest cross-streets</span>
                <input name="shippingStreet1" required type="text" />
              </label>
              <div className="field-grid three-up compact-grid">
                <label><span>City</span><input name="shippingCity" required type="text" /></label>
                <label><span>State</span><input defaultValue="CA" name="shippingState" required type="text" /></label>
                <label><span>ZIP</span><input name="shippingZip" required type="text" /></label>
              </div>
              <label className="checkbox-row"><input name="pickupConsent" required type="checkbox" value="1" /><span>I understand fulfillment defaults to in-person pickup or local drop-off review unless shipping is explicitly enabled.</span></label>
              <button className="button-primary full-width" type="submit">Continue logistics review</button>
            </form>
          </div>
        </div>
      </PageSection>
    </Shell>
  );
}
