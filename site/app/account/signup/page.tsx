import Link from "next/link";
import { SignupForm } from "@/components/forms";
import { VerificationResendPanel } from "@/components/verification-resend-panel";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; verify?: string; email?: string }> }) {
  const { error, verify, email = "" } = await searchParams;

  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Create a buyer account" copy="Buyer accounts keep project references, order history, and profile details together in one place." />
        {error ? <div className="notice-panel" role="alert"><p>{error}</p></div> : null}
        {verify ? (
          <div className="notice-panel">
            <p>
              {verify === "sent"
                ? `A verification link was sent to ${email || "your email address"}. Open it before you log in.`
                : `The account was created for ${email || "that email"}, but the verification email could not be sent. Use the resend control below to try again.`}
            </p>
          </div>
        ) : null}
        <SignupForm />
        {verify ? <VerificationResendPanel email={email} /> : null}
        <p className="muted-copy">Already registered? <Link href="/account/login">Log in here.</Link></p>
      </PageSection>
    </Shell>
  );
}
