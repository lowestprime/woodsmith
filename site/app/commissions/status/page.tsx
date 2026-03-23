import Link from "next/link";
import { PageIntro, RequestSummary, Shell } from "@/components/site-chrome";
import { findRequestForLookup, getRequestUpdates } from "@/lib/db";

export default async function CommissionStatusPage({
  searchParams
}: {
  searchParams: Promise<{ reference?: string; email?: string }>;
}) {
  const { reference = "", email = "" } = await searchParams;
  const request = reference && email ? findRequestForLookup(reference, email) : null;
  const updates = request ? getRequestUpdates(request.reference, "public") : [];

  return (
    <section className="section-pad">
      <Shell>
        <PageIntro
          eyebrow="Status lookup"
          title="Open an existing commission or reservation"
          copy="Enter the reference and email used on the original request to reopen the shared project record."
        />
        <form action="/commissions/status" className="request-form compact-form">
          <div className="field-grid two-up">
            <label>
              <span>Reference</span>
              <input defaultValue={reference} name="reference" placeholder="WS-CM-..." required type="text" />
            </label>
            <label>
              <span>Email</span>
              <input defaultValue={email} name="email" placeholder="you@example.com" required type="email" />
            </label>
          </div>
          <button className="button-primary" type="submit">Open Request</button>
        </form>
        {request ? (
          <div className="top-gap">
            <RequestSummary privateView={false} request={request} updates={updates} />
            <p className="status-path-copy">
              Open the direct dossier: <Link href={`/requests/${request.reference}`}>/requests/{request.reference}</Link>
            </p>
          </div>
        ) : reference || email ? (
          <p className="inline-message top-gap">No request matched that reference and email pair.</p>
        ) : null}
      </Shell>
    </section>
  );
}
