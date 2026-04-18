import Link from "next/link";
import { LoginForm, ResendVerificationForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; redirectTo?: string; notice?: string }> }) {
  const { error, email = "", redirectTo = "/account/profile", notice } = await searchParams;
  const errorMessage = error === "invalid"
    ? "The email and password did not match a current account."
    : error === "verify"
      ? "Verify the email address for this account before logging in."
      : error === "1"
        ? "The email and password did not match a current account."
        : error;

  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Log in" copy="Use your buyer or dashboard account to review projects, edit your profile, or access private tools." />
        {errorMessage ? <div className="notice-panel" role="alert"><p>{errorMessage}</p></div> : null}
        {notice ? (
          <div className="notice-panel">
            <p>
              {notice === "verify-sent"
                ? "A fresh verification email has been sent."
                : notice === "verified"
                  ? "Your email address is verified. You can log in now."
                  : "A fresh verification email was queued, but SMTP is not currently configured to send it automatically."}
            </p>
          </div>
        ) : null}
        <LoginForm email={email} redirectTo={redirectTo} />
        {error === "verify" ? <ResendVerificationForm email={email} /> : null}
        <p className="muted-copy"><Link href="/account/signup">Create an account</Link> · <Link href="/account/forgot">Forgot password</Link></p>
      </PageSection>
    </Shell>
  );
}
