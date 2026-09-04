import Link from "next/link";
import { ProfileForm } from "@/components/forms";
import { PageIntro, PageSection, ProjectOverviewCard, Shell } from "@/components/site-chrome";
import { VerificationResendPanel } from "@/components/verification-resend-panel";
import { requireUser } from "@/lib/auth";
import { listProjectsForEmail } from "@/lib/db";

export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; reset?: string; verify?: string; verificationError?: string }>;
}) {
  const user = await requireUser();
  const projects = listProjectsForEmail(user.email);
  const { verify, verificationError } = await searchParams;

  return (
    <Shell>
      <PageSection editHref={`/studio?panel=people&user=${encodeURIComponent(user.email)}#${`user-${user.email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`}`}>
        <PageIntro eyebrow="Account" title="Profile & projects" copy="Manage your contact details and review order or custom-work updates." />
        {verify === "already" ? (
          <p className="notice-panel" role="status">Your email is already verified.</p>
        ) : null}
        {verify === "sent" ? <p className="notice-panel" role="status">SMTP accepted the verification email. Check your inbox and spam folder for the activation link.</p> : null}
        {verify === "failed" ? <div className="notice-panel danger" role="alert"><strong>Verification email was not sent.</strong><p>{verificationError || "Please try again or contact the woodshop for help."}</p></div> : null}
        {!user.emailVerified ? <VerificationResendPanel email={user.email} /> : null}
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
