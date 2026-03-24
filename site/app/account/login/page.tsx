import Link from "next/link";
import { LoginForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; redirectTo?: string }> }) {
  const { error, email = "", redirectTo = "/account/profile" } = await searchParams;
  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Account" title="Log in" copy="Use your buyer or studio account to review projects, edit your profile, or access the private dashboard." />
        {error ? <p className="notice-panel danger">The email and password did not match a current account.</p> : null}
        <LoginForm email={email} redirectTo={redirectTo} />
        <p className="muted-copy"><Link href="/account/signup">Create an account</Link> · <Link href="/account/forgot">Forgot password</Link></p>
      </PageSection>
    </Shell>
  );
}
