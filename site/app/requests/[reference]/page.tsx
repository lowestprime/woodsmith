import { notFound } from "next/navigation";
import { BuyerUpdateForm } from "@/components/forms";
import { RequestSummary, Shell } from "@/components/site-chrome";
import { getRequestByReference, getRequestUpdates } from "@/lib/db";

export default async function RequestPage({
  params,
  searchParams
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ created?: string; updated?: string; error?: string }>;
}) {
  const { reference } = await params;
  const request = getRequestByReference(reference);

  if (!request) {
    notFound();
  }

  const updates = getRequestUpdates(reference, "public");
  const flags = await searchParams;

  return (
    <section className="section-pad">
      <Shell>
        {flags.created ? <p className="inline-message">Request received. This page is now the shared dossier for the project.</p> : null}
        {flags.updated ? <p className="inline-message">Buyer update posted to the timeline.</p> : null}
        {flags.error ? <p className="inline-message">The email did not match this reference. Use the original inquiry email and try again.</p> : null}
        <RequestSummary privateView={false} request={request} updates={updates} />
        <div className="top-gap narrow-panel">
          <h2>Add a buyer update</h2>
          <p className="lede">Use this to send room measurements, finish questions, or delivery details back to the studio.</p>
          <BuyerUpdateForm request={request} />
        </div>
      </Shell>
    </section>
  );
}
