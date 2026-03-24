import Link from "next/link";
import { CommissionRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPage, listCommissionTypes } from "@/lib/db";

export default function CommissionsPage() {
  const page = getPage("commissions");
  const bandwidth = getBandwidthSnapshot();

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Commissions" title={page?.title ?? "Commission Flow & Visualizer"} copy={page?.intro ?? "Configure a custom build, see a to-scale preview, and submit a commission brief."} />
        <p className="muted-copy">Already have a reference? <Link href="/commissions/status">Look up your project status here.</Link></p>
        <CommissionRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
          bandwidthPercent={bandwidth.bandwidthPercent}
          commissionTypes={listCommissionTypes()}
          queueCount={bandwidth.activeProjects}
        />
      </PageSection>
    </Shell>
  );
}
