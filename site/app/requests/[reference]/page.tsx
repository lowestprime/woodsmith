import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectReplyForm } from "@/components/forms";
import { CommissionDraftCleanup } from "@/components/commission-draft-cleanup";
import { getCurrentUser } from "@/lib/auth";
import { lookupProjectStatusAction } from "@/lib/actions";
import { userCanAccessProject } from "@/lib/commission-security";
import { PageSection, Shell } from "@/components/site-chrome";
import { getProject, listProjectUpdates } from "@/lib/db";
import { formatDateTime, formatLeadTime, formatMoney, sanitizeHtml, toMediaUrl } from "@/lib/format";

export default async function RequestPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ created?: string; updated?: string; error?: string }> }) {
  const { reference } = await params;
  const flags = await searchParams;
  const project = getProject(reference);
  if (!project) {
    notFound();
  }

  const user = await getCurrentUser();
  const canView = await userCanAccessProject(project, user);

  if (!canView) {
    return (
      <Shell>
        <PageSection editHref={`/studio?panel=projects&project=${encodeURIComponent(project.reference)}#project-${project.reference}`}>
          <div className="request-summary-head">
            <div>
              <p className="eyebrow">Reference {project.reference}</p>
              <h1>Confirm buyer email</h1>
              <p className="lede">Enter the same email used during the custom work request or checkout to open this project tracker.</p>
            </div>
          </div>
          {flags.error ? <p className="notice-panel danger">Private access is missing or expired. Confirm the buyer email to renew access on this browser.</p> : null}
          <form action={lookupProjectStatusAction} className="request-form compact-form">
            <input name="reference" type="hidden" value={project.reference} />
            <label>
              <span>Email</span>
              <input name="email" required type="email" />
            </label>
            <button className="button-primary" type="submit">Open project</button>
          </form>
          <p className="muted-copy"><Link href={`/commissions/status?reference=${encodeURIComponent(project.reference)}`}>Use the project status lookup page instead</Link>.</p>
        </PageSection>
      </Shell>
    );
  }

  const updates = listProjectUpdates(project.reference, user?.role === "admin");
  const aiPreviewPath = typeof project.options.aiPreviewPath === "string" && project.options.aiPreviewPath ? project.options.aiPreviewPath : null;

  return (
    <Shell>
      {flags.created ? <CommissionDraftCleanup /> : null}
      <PageSection editHref={`/studio?panel=projects&project=${encodeURIComponent(project.reference)}#project-${project.reference}`}>
        <div className="request-summary-head">
          <div>
            <p className="eyebrow">Reference {project.reference}</p>
            <h1>{project.commissionTypeSlug || project.pieceSlug || "Custom project"}</h1>
            <p className="lede">{project.status} · {project.stage} · Estimated lead time {formatLeadTime(project.leadTimeDays)}</p>
          </div>
        </div>
        {flags.created ? <p className="notice-panel">Your project has been received. Save this reference for future updates.</p> : null}
        {flags.updated ? <p className="notice-panel">Your follow-up note has been added.</p> : null}
        <div className="request-grid">
          <div className="request-panel">
            <h2>Project brief</h2>
            <p>{project.brief}</p>
            {project.includeVisualization && project.visualizationSvg ? <div className="visualization-embed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.visualizationSvg) }} /> : null}
            {project.includeVisualization && aiPreviewPath ? <img alt={`${project.reference} generated custom work preview`} className="request-preview-image" src={toMediaUrl(aiPreviewPath)} /> : null}
            <dl className="detail-list">
              <div><dt>Buyer</dt><dd>{project.guestName}</dd></div>
              <div><dt>Email</dt><dd>{project.guestEmail}</dd></div>
              <div><dt>Materials</dt><dd>{project.materials.join(" / ") || "To be confirmed"}</dd></div>
              <div><dt>Budget</dt><dd>{formatMoney(project.budgetCents)}</dd></div>
              <div><dt>Estimated total</dt><dd>{formatMoney(project.estimatedTotalCents)}</dd></div>
              <div><dt>Lead time</dt><dd>{formatLeadTime(project.leadTimeDays)}</dd></div>
            </dl>
            {project.publicNotes ? <p className="notice-panel">{project.publicNotes}</p> : null}
          </div>
          <div className="request-panel">
            <h2>Timeline</h2>
            <ol className="update-list">
              {updates.map((update) => <li className={`update-item ${update.authorRole}`} key={update.id}><strong>{update.authorRole}</strong><span>{formatDateTime(update.createdAt)}</span><p>{update.body}</p></li>)}
            </ol>
          </div>
        </div>
        <ProjectReplyForm project={project} />
      </PageSection>
    </Shell>
  );
}
