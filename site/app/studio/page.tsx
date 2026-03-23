import { StudioToolbar } from "@/components/forms";
import { DashboardTable, PageIntro, Shell } from "@/components/site-chrome";
import { requireStudioSession } from "@/lib/auth";
import { getDashboardSummary, listRequests } from "@/lib/db";

export default async function StudioDashboardPage() {
  await requireStudioSession();

  const summary = getDashboardSummary();
  const requests = listRequests();

  return (
    <section className="section-pad">
      <Shell>
        <div className="dashboard-head">
          <PageIntro
            eyebrow="Studio dashboard"
            title="Buyer conversations and commission implementation"
            copy="Everything submitted through the site lands here: commissions, reservations, and the timeline notes that keep each project moving."
          />
          <StudioToolbar />
        </div>
        <div className="dashboard-stats">
          <article><span>{summary.total}</span><p>Total requests</p></article>
          <article><span>{summary.commissions}</span><p>Commission briefs</p></article>
          <article><span>{summary.purchases}</span><p>Shop inquiries</p></article>
          <article><span>{summary.open}</span><p>Open dossiers</p></article>
        </div>
        <DashboardTable requests={requests} />
      </Shell>
    </section>
  );
}
