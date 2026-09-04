import { ForgotPasswordForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Reset password" copy="Enter your account email to request a password-reset link." />
        {sent ? <p className="notice-panel">If an account uses that email, a reset link will be sent.</p> : null}
        <ForgotPasswordForm />
      </PageSection>
    </Shell>
  );
}
