import Link from "next/link";
import { ProfileForm } from "@/components/forms";
import { PageIntro, PageSection, ProjectOverviewCard, Shell } from "@/components/site-chrome";
import { requireUser } from "@/lib/auth";
import { listProjectsForEmail } from "@/lib/db";
import { resendVerificationAction } from "@/lib/actions";

export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; reset?: string; verify?: string }>;
}) {
  const user = await requireUser();
  const projects = listProjectsForEmail(user.email);
  const { verify } = await searchParams;

  return (
    <Shell>
      <PageSection editHref={`/studio?panel=people&user=${encodeURIComponent(user.email)}#${`user-${user.email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`}`}>
        <PageIntro eyebrow="Account" title="Profile & projects" copy="Manage account details, keep project references close, and review order or custom work status from the same dashboard." />
        {verify === "sent" ? (
          <p className="notice-panel" role="status">
            A verification email is on its way to <strong>{user.email}</strong>. Click the link inside to confirm your address. If it does not arrive within a few minutes, check your spam folder or resend below.
          </p>
        ) : null}
        {verify === "already" ? (
          <p className="notice-panel" role="status">Your email is already verified.</p>
        ) : null}
        {!user.emailVerified ? (
          <div className="notice-panel" role="alert">
            <strong>Your email is not verified yet.</strong>
            <form action={resendVerificationAction} style={{ marginTop: "0.5rem" }}>
              <button className="button-secondary" type="submit">Resend verification email</button>
            </form>
          </div>
        ) : null}
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
