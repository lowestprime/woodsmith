import { LoginForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function StudioLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email = "" } = await searchParams;
  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Woodshop" title="Private dashboard login" copy="Use the woodshop account to manage content, media, inventory, orders, project stages, invoices, and settings from the browser." />
        {error ? <p className="notice-panel danger">The dashboard login was not accepted.</p> : null}
        <LoginForm email={email} redirectTo="/studio" studio />
      </PageSection>
    </Shell>
  );
}
