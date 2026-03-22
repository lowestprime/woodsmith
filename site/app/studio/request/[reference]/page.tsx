import { notFound } from "next/navigation";
import { StudioRequestForm } from "@/components/forms";
import { RequestSummary, Shell } from "@/components/site-chrome";
import { requireStudioSession } from "@/lib/auth";
import { getRequestByReference, getRequestUpdates } from "@/lib/db";

export default async function StudioRequestPage({
  params,
  searchParams
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireStudioSession();

  const { reference } = await params;
  const request = getRequestByReference(reference);

  if (!request) {
    notFound();
  }

  const updates = getRequestUpdates(reference, "all");
  const flags = await searchParams;

  return (
    <section className="section-pad">
      <Shell>
        {flags.saved ? <p className="inline-message">Request saved.</p> : null}
        <RequestSummary privateView request={request} updates={updates} />
        <div className="top-gap narrow-panel wide-panel">
          <h2>Studio controls</h2>
          <p className="lede">Update the public-facing status, keep internal notes, and append timeline messages from one form.</p>
          <StudioRequestForm request={request} />
        </div>
      </Shell>
    </section>
  );
}
