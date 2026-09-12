import Link from "next/link";
import { listWebsiteInquiries } from "@/lib/db";
import { INQUIRY_INTENT_LABELS } from "@/lib/website-inquiry";

// Rendered only inside the Studio route, after requireAdmin().
export function StudioInquiries({ view, page, id }: { view: string; page: string; id: string }) {
  const records = listWebsiteInquiries({ disposition: view, page: Number(page), id });
  const href = (disposition: string, nextPage = 1) => `/studio?panel=inquiries&view=${disposition}&inquiryPage=${nextPage}`;
  return <section className="studio-panel inquiry-review">
    <h2>Website inquiries</h2>
    <p>General and piece inquiries stay outside Projects. Quarantine receives no project, upload processing, or customer email. Review messages here; forwarding and release rules are not configured in this view.</p>
    <nav className="share-links" aria-label="Inquiry disposition">
      <Link aria-current={!id && records.disposition === "legitimate" ? "page" : undefined} href={href("legitimate")}>Inquiries</Link>
      <Link aria-current={!id && records.disposition === "quarantine" ? "page" : undefined} href={href("quarantine")}>Quarantine</Link>
    </nav>
    <p role="status">{records.total} {id ? "matching" : records.disposition} {records.total === 1 ? "inquiry" : "inquiries"}</p>
    {records.items.map(record => <article className="notice-panel" key={record.id}>
      <h3>{record.inquiry.customerName}</h3>
      <p>{record.inquiry.customerEmail} · <time dateTime={record.createdAt}>{record.createdAt}</time></p>
      <dl>
        <dt>Reference</dt><dd>{record.id}</dd>
        <dt>Intent / topic</dt><dd>{INQUIRY_INTENT_LABELS[record.inquiry.intent]} / {record.inquiry.topic}</dd>
        <dt>Source</dt><dd>{record.inquiry.sourceSurface} · {record.inquiry.sourceRoute}</dd>
        <dt>Piece</dt><dd>{record.inquiry.piece ? `${record.inquiry.piece.title} (${record.inquiry.piece.slug}) · ${record.inquiry.piece.availability}` : "No linked piece"}</dd>
        <dt>Customer reference</dt><dd>{record.inquiry.reference || "None"}</dd>
        <dt>Classification</dt><dd>{record.classification.disposition} · classifier {record.classification.version} · {record.classification.signals.join(", ") || "No combined solicitation signals"}</dd>
      </dl>
      <p className="inquiry-message">{record.inquiry.message}</p>
      {record.projectReference ? <Link href={`/studio?panel=projects&project=${encodeURIComponent(record.projectReference)}`}>Open commission {record.projectReference}</Link> : <p>No Project created</p>}
      {record.inquiry.channel === "commission" ? <details><summary>Planner context</summary><pre className="inquiry-message">{JSON.stringify(record.inquiry.plannerContext, null, 2)}</pre></details> : null}
    </article>)}
    {!records.items.length ? <p>No inquiries in this view.</p> : null}
    <nav className="share-links" aria-label="Inquiry pages">
      {records.page > 1 ? <Link href={href(records.disposition, records.page - 1)}>Previous page</Link> : null}
      {records.page * 20 < records.total ? <Link href={href(records.disposition, records.page + 1)}>Next page</Link> : null}
    </nav>
  </section>;
}
