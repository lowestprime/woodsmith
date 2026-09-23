"use client";
import { useActionState, useState } from "react";
import { startCheckoutAction } from "@/lib/actions";

export function CheckoutForm({
  checkoutKey,
  email: initialEmail,
}: {
  checkoutKey: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, {
    error: "",
  });
  const [email, setEmail] = useState(initialEmail),
    [coupon, setCoupon] = useState(""),
    [consent, setConsent] = useState(false);
  return (
    <form action={action} className="request-form compact-form">
      <h3>Pay online</h3>
      <p className="muted-copy">
        For local fulfillment by agreement. Final tax and any eligible discount
        appear in Stripe before payment. Shipping requires a separate reviewed
        quote.
      </p>
      <input name="checkoutKey" type="hidden" value={checkoutKey} />
      <label>
        <span>Payment email</span>
        <input
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        <span>Payment coupon code</span>
        <input
          name="couponCode"
          onChange={(event) => setCoupon(event.target.value)}
          value={coupon}
        />
      </label>
      <label className="checkbox-row">
        <input
          checked={consent}
          name="fulfillmentConsent"
          onChange={(event) => setConsent(event.target.checked)}
          required
          type="checkbox"
          value="1"
        />
        <span>I will agree pickup or local delivery with the woodshop.</span>
      </label>
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? "Opening secure payment…" : "Continue to secure payment"}
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
