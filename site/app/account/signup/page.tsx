import Link from "next/link";
import { SignupForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <Shell>
      <PageSection editHref="/studio?panel=people">
        <PageIntro eyebrow="Account" title="Create a buyer account" copy="Buyer accounts keep project references, order history, and profile details together in one place." />
        {error ? <div className="notice-panel" role="alert"><p>{error}</p></div> : null}
        <SignupForm />
        <p className="muted-copy">Already registered? <Link href="/account/login">Log in here.</Link></p>
      </PageSection>
    </Shell>
  );
}
