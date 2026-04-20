import Link from "next/link";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { verifyEmailAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyEmailAction(token);

  return (
    <Shell>
      <PageSection>
        {result.ok ? (
          <>
            <PageIntro eyebrow="Account" title="Email verified" copy="Thanks for confirming your email address. Your buyer account is fully active." />
            <p className="muted-copy">
              <Link className="button-primary" href="/account/profile">Go to profile</Link>
              <span style={{ display: "inline-block", width: "0.75rem" }} />
              <Link className="button-secondary" href="/shop">Shop current work</Link>
            </p>
          </>
        ) : (
          <>
            <PageIntro eyebrow="Account" title="Verification failed" copy={result.message} />
            <p className="notice-panel" role="alert">
              If you signed up recently, log in and request a new verification email from your profile. If you signed up a while ago the link may simply have expired.
            </p>
            <p className="muted-copy">
              <Link className="button-primary" href="/account/login">Log in</Link>
              <span style={{ display: "inline-block", width: "0.75rem" }} />
              <Link className="button-secondary" href="/account/signup">Create account</Link>
            </p>
          </>
        )}
      </PageSection>
    </Shell>
  );
}
