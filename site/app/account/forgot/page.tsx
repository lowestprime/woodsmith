import { ForgotPasswordForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Account" title="Reset password" copy="A reset link is emailed through the studio notification system when SMTP is configured." />
        {sent ? <p className="notice-panel">If the email exists in the system, a reset link has been queued.</p> : null}
        <ForgotPasswordForm />
      </PageSection>
    </Shell>
  );
}
