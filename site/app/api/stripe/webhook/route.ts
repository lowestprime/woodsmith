import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyStripeEvent } from "@/lib/payments";
import { applyCheckoutEvent, applyInvoiceEvent } from "@/lib/commerce-store";
import { withDatabaseTransaction } from "@/lib/db";
export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 1_048_576)
    return new NextResponse(null, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 1_048_576)
    return new NextResponse(null, { status: 413 });
  let event;
  try {
    event = verifyStripeEvent(body, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const result = withDatabaseTransaction((db) =>
      (event.type.startsWith("invoice.")
        ? applyInvoiceEvent
        : applyCheckoutEvent)(
        db,
        event as Parameters<typeof applyCheckoutEvent>[1],
        createHash("sha256").update(body).digest("hex"),
      ),
    );
    revalidatePath("/studio");
    revalidatePath("/shop");
    revalidatePath("/portfolio");
    revalidatePath("/account/projects");
    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json(
      { error: "Reconciliation pending; retry required" },
      { status: 500 },
    );
  }
}
