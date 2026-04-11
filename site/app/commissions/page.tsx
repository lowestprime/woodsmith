import type { Metadata } from "next";
import Link from "next/link";
import { ContactRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPage, listCommissionTypes } from "@/lib/db";

export const metadata: Metadata = {
  title: "Custom Work",
  description: "Commission a custom hardwood piece from Beaman Woodworks. Describe your vision, review a real-time estimate, and start your project.",
  openGraph: { title: "Custom Work | Beaman Woodworks", description: "Commission custom hardwood furniture." }
};

export default function CommissionsPage() {
  const page = getPage("commissions");
  const bandwidth = getBandwidthSnapshot();

  return (
    <Shell>
      <PageSection editHref="/studio?panel=custom">
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
