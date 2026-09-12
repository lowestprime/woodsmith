import Link from "next/link";
import { consumeVerificationTokenAction } from "@/lib/actions";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function VerifyAccountPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const result = token
    ? await consumeVerificationTokenAction(token)
    : { ok: false as const, email: "", displayName: "", message: "Open the complete verification link from your email." };

  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Email verification" copy="Confirm your email address to access your projects and account." />
        <div className={`notice-panel${result.ok ? "" : " error-panel"}`}>
          <p>{result.message}</p>
          {result.ok ? <p className="muted-copy">Verified account: {result.email}</p> : null}
        </div>
        <p className="muted-copy">
          {result.ok
            ? <Link href={`/account/login?email=${encodeURIComponent(result.email)}&notice=verified`}>Continue to login</Link>
            : <Link href="/account/signup">Return to account signup</Link>}
        </p>
      </PageSection>
    </Shell>
  );
}
