import Link from "next/link";
import { ProfileForm } from "@/components/forms";
import { PageIntro, PageSection, ProjectOverviewCard, Shell } from "@/components/site-chrome";
import { requireUser } from "@/lib/auth";
import { listProjectsForEmail } from "@/lib/db";

export default async function ProfilePage() {
  const user = await requireUser();
  const projects = listProjectsForEmail(user.email);

  return (
    <Shell>
      <PageSection editHref={`/studio?panel=people&user=${encodeURIComponent(user.email)}#${`user-${user.email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`}`}>
        <PageIntro eyebrow="Account" title="Profile & projects" copy="Manage account details, keep project references close, and review order or custom work status from the same dashboard." />
        <div className="account-layout">
          <ProfileForm user={user} />
          <div className="studio-panel">
            <h2>Your projects</h2>
            <div className="project-listing">
              {projects.length > 0 ? projects.map((project) => <ProjectOverviewCard key={project.reference} project={project} />) : <p className="muted-copy">No projects are currently linked to this account.</p>}
            </div>
            <p className="muted-copy"><Link href="/commissions">Start a new custom work request</Link> or <Link href="/shop">review available work</Link>.</p>
          </div>
        </div>
      </PageSection>
    </Shell>
  );
}
