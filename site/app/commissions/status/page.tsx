import Link from "next/link";
import { ProjectReplyForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getProject, listProjectUpdates } from "@/lib/db";
import { formatDateTime, formatLeadTime } from "@/lib/format";

export default async function CommissionStatusPage({ searchParams }: { searchParams: Promise<{ reference?: string; email?: string }> }) {
  const { reference = "", email = "" } = await searchParams;
  const project = reference ? getProject(reference) : null;
  const matches = project && email && project.guestEmail.toLowerCase() === email.toLowerCase();
  const updates = matches && project ? listProjectUpdates(project.reference) : [];

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Project status" title="Open an existing project" copy="Enter the project reference and the buyer email used during checkout or commission intake." />
        <form action="/commissions/status" className="request-form compact-form">
          <div className="field-grid two-up compact-grid">
            <label><span>Reference</span><input defaultValue={reference} name="reference" required type="text" /></label>
            <label><span>Email</span><input defaultValue={email} name="email" required type="email" /></label>
          </div>
          <button className="button-primary" type="submit">Open project</button>
        </form>
      </PageSection>

      {matches && project ? (
        <PageSection>
          <div className="request-summary-head">
            <div>
              <p className="eyebrow">{project.reference}</p>
              <h2>{project.commissionTypeSlug || project.pieceSlug || "Custom project"}</h2>
              <p className="lede">Status: {project.status} · Stage: {project.stage} · Estimated lead time {formatLeadTime(project.leadTimeDays)}</p>
            </div>
          </div>
          <div className="request-grid">
            <div className="request-panel">
              <h3>Project brief</h3>
              <p>{project.brief}</p>
              {project.publicNotes ? <p className="notice-panel">{project.publicNotes}</p> : null}
            </div>
            <div className="request-panel">
              <h3>Timeline</h3>
              <ol className="update-list">
                {updates.map((update) => <li className={`update-item ${update.authorRole}`} key={update.id}><strong>{update.authorRole}</strong><span>{formatDateTime(update.createdAt)}</span><p>{update.body}</p></li>)}
              </ol>
            </div>
          </div>
          <ProjectReplyForm project={project} />
          <p className="muted-copy"><Link href={`/requests/${project.reference}?email=${encodeURIComponent(email)}`}>Open the dedicated request page.</Link></p>
        </PageSection>
      ) : null}
    </Shell>
  );
}