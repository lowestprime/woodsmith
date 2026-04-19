import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ContactRequestForm } from "@/components/forms";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getBandwidthSnapshot, getPage, getSiteSettings, listCommissionTypes } from "@/lib/db";

export const metadata: Metadata = {
  title: "Contact Beaman Woodworks",
  description: "Ask about a custom piece, a commission, or any woodworking question. Messages route directly to the woodshop.",
  openGraph: { title: "Contact | Beaman Woodworks", description: "Contact the Beaman Woodworks woodshop." }
};

export default async function ContactPage() {
  await connection();
  const page = getPage("commissions");
  const site = getSiteSettings();
  const bandwidth = getBandwidthSnapshot();

  return (
    <Shell>
      <PageSection editHref="/studio?panel=pages&page=commissions#page-commissions">
        <PageIntro
          eyebrow="Contact"
          title={page?.title ?? "Ask about a custom piece"}
          copy={page?.intro ?? "Use the intake form below to send a message directly to the woodshop. Every inquiry is read personally — replies come from a real human, usually within a business day."}
        />
        {page?.body ? <p className="page-body-copy">{page.body}</p> : null}
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
