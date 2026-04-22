import type { Metadata } from "next";
import Link from "next/link";
import { ContactRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getSiteSettings, listCommissionTypes } from "@/lib/db";

export const metadata: Metadata = {
  title: "Contact Beaman Woodworks",
  description: "Ask about a custom piece, a commission, or any woodworking question. Messages route directly to the woodshop.",
  openGraph: { title: "Contact | Beaman Woodworks", description: "Contact the Beaman Woodworks woodshop." }
};

export default function ContactPage() {
  const site = getSiteSettings();
  const bandwidth = getBandwidthSnapshot();

  return (
    <Shell>
      <PageSection editHref="/studio?panel=settings">
        <PageIntro
          eyebrow="Contact"
          title="Ask about a custom piece"
          copy="Use the intake form below to send a message directly to the woodshop. Every inquiry is read personally — replies come from a real human, usually within a business day."
        />
        <p className="muted-copy">
          Prefer email? Reach us at <a href={`mailto:${site.builderEmail}`}>{site.builderEmail}</a>. You can also
          {" "}
          <Link href="/commissions">open the full custom-work form</Link>
          {" "}
          or
          {" "}
          <Link href="/commissions/status">check the status of an existing project</Link>.
        </p>
        <ContactRequestForm
          bandwidthLeadTimeDays={bandwidth.leadTimeDays}
          commissionTypes={listCommissionTypes()}
          queueCount={bandwidth.activeProjects}
        />
      </PageSection>
    </Shell>
  );
}
