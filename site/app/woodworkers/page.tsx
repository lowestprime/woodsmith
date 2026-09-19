import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AvatarBadge } from "@/components/avatar-badge";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { listPublicWoodworkers } from "@/lib/db";
export const metadata: Metadata = {
  title: "Woodworkers",
  description: "Meet the independent woodshops and explore their work.",
};
export default async function WoodworkersPage() {
  await connection();
  const workers = listPublicWoodworkers();
  if (!workers.length) notFound();
  return (
    <Shell>
      <PageSection>
        <PageIntro
          eyebrow="Woodworkers"
          title="Meet the woodshops"
          copy="Explore each woodworker’s furniture, materials and process."
        />
        <div className="profile-grid">
          {workers.map((worker) => (
            <article className="studio-panel" key={worker.id}>
              <AvatarBadge
                avatarPath={worker.avatar_path}
                label={worker.business_name.slice(0, 2)}
                seed={worker.id}
                variant="editor"
              />
              <h2>
                <Link href={`/woodworkers/${worker.slug}`}>
                  {worker.business_name}
                </Link>
              </h2>
              <p>{worker.bio}</p>
              <Link
                className="button-secondary"
                href={`/woodworkers/${worker.slug}`}
              >
                Visit woodshop
              </Link>
            </article>
          ))}
        </div>
      </PageSection>
    </Shell>
  );
}
