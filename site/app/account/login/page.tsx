import Link from "next/link";
import { LoginForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; redirectTo?: string }> }) {
  const { error, email = "", redirectTo = "/account/profile" } = await searchParams;
  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Log in" copy="Use your buyer or dashboard account to review projects, edit your profile, or access private tools." />
        {error ? <div className="notice-panel" role="alert"><p>{error === "1" ? "The email and password did not match a current account." : error}</p></div> : null}
        <LoginForm email={email} redirectTo={redirectTo} />
        <p className="muted-copy"><Link href="/account/signup">Create an account</Link> · <Link href="/account/forgot">Forgot password</Link></p>
      </PageSection>
    </Shell>
  );
}
