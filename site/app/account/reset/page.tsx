import { ResetPasswordForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Choose a new password" copy="Use the reset link from your email to set a new password." />
        {error ? <p className="notice-panel danger">This reset link is invalid or has expired.</p> : null}
        {token ? <ResetPasswordForm token={token} /> : <p className="muted-copy">A valid reset token is required.</p>}
      </PageSection>
    </Shell>
  );
}
