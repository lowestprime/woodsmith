import Link from "next/link";
import { ContactRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPage, listCommissionTypes } from "@/lib/db";

export default function CommissionsPage() {
  const page = getPage("commissions");
  const bandwidth = getBandwidthSnapshot();

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Custom work" title={page?.title ?? "Custom Work Contact"} copy={page?.intro ?? "Custom work now starts with a direct contact request instead of a fixed public template."} />
        <p className="muted-copy">Already have a reference? <Link href="/commissions/status">Look up your project status here.</Link></p>
        <ContactRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
          commissionTypes={listCommissionTypes()}
          queueCount={bandwidth.activeProjects}
        />
      </PageSection>
    </Shell>
  );
}
