import Link from "next/link";
import { SignupForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default function SignupPage() {
  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Account" title="Create a buyer account" copy="Buyer accounts keep project references, order history, and profile details together in one place." />
        <SignupForm />
        <p className="muted-copy">Already registered? <Link href="/account/login">Log in here.</Link></p>
      </PageSection>
    </Shell>
  );
}
