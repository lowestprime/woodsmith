import { PageIntro, Shell } from "@/components/site-chrome";
import { usingDefaultStudioPassword } from "@/lib/auth";
import { StudioLoginForm } from "@/components/forms";

export default async function StudioLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <section className="section-pad">
      <Shell className="narrow-panel">
        <PageIntro
          eyebrow="Studio"
          title="Private dashboard login"
          copy="Use the studio password to review inquiries, post project notes, and keep each commission dossier current."
        />
        {usingDefaultStudioPassword() ? (
          <p className="inline-message warning-message">
            `STUDIO_PASSWORD` is not set, so the local fallback password is active. Change it before public deployment.
          </p>
        ) : null}
        {error ? <p className="inline-message">The studio password was incorrect.</p> : null}
        <StudioLoginForm />
      </Shell>
    </section>
  );
}
