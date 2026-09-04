import { lookupProjectStatusAction } from "@/lib/actions";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

export default async function CommissionStatusPage({ searchParams }: { searchParams: Promise<{ reference?: string; error?: string }> }) {
  const { reference = "", error = "" } = await searchParams;
  return (
    <Shell>
      <PageSection editHref="/studio?panel=projects">
        <PageIntro eyebrow="Project status" title="Open an existing project" copy="Enter the project reference and buyer email to securely view its latest updates." />
        {error ? <p className="notice-panel danger" role="alert">The reference and email did not match a project. Check both entries and try again.</p> : null}
        <form action={lookupProjectStatusAction} className="request-form compact-form">
          <div className="field-grid two-up compact-grid">
            <label><span>Reference</span><input autoCapitalize="characters" defaultValue={reference} name="reference" required type="text" /></label>
            <label><span>Buyer email</span><input name="email" required type="email" /></label>
          </div>
          <button className="button-primary" type="submit">Open project</button>
        </form>
        <p className="muted-copy">Access expires after 30 days on this browser. Repeat this lookup whenever access needs to be renewed.</p>
      </PageSection>
    </Shell>
  );
}
