import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listProjectsForEmail } from "@/lib/db";
import { PageIntro, PageSection, ProjectOverviewCard, Shell } from "@/components/site-chrome";

export default async function AccountProjectsPage({ searchParams }: { searchParams: Promise<{ checkout?: string; order?: string }> }) {
  const { checkout, order } = await searchParams;
  const user = await getCurrentUser();
  const projects = user ? listProjectsForEmail(user.email) : [];

  return (
    <Shell>
      <PageSection editHref="/studio?panel=projects">
        <PageIntro eyebrow="Account" title="Projects & orders" copy="Follow your orders and custom builds, from the first brief through delivery." />
        {checkout === "success" ? <p className="notice-panel">Payment was received for order {order ?? ""}. Order and shipping updates will appear here and by email as delivery milestones change.</p> : null}
        {checkout === "cancelled" ? <p className="notice-panel danger">Checkout was cancelled before payment capture. Your cart remains available if you want to try again.</p> : null}
        {user ? (
          <div className="studio-panel">
            <h2>Linked projects</h2>
            <div className="project-listing">
              {projects.length > 0 ? projects.map((project) => <ProjectOverviewCard key={project.reference} project={project} />) : <p className="muted-copy">No projects are currently linked to this account.</p>}
            </div>
            <p className="muted-copy"><Link href="/account/profile">Update your profile</Link> and contact details.</p>
          </div>
        ) : (
          <div className="studio-panel">
            <h2>Continue with your account</h2>
            <p>Create an account or log in with the same email you used for the order or commission if you want future projects grouped under one profile.</p>
            <div className="button-row">
              <Link className="button-primary" href="/account/signup">Create account</Link>
              <Link className="button-secondary" href="/account/login">Log in</Link>
            </div>
            <p className="muted-copy"><Link href="/commissions/status">Use the project status lookup</Link> if you only need a reference update.</p>
          </div>
        )}
      </PageSection>
    </Shell>
  );
}
