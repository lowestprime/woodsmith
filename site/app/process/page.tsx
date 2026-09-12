import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageIntro, PageSection, PostCard, SectionHeading, Shell } from "@/components/site-chrome";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getPage, listPosts } from "@/lib/db";

export const metadata: Metadata = {
  title: "Process",
  description: "Behind-the-scenes process notes, build logs, and references from the Beaman Woodworks workshop.",
  openGraph: { title: "Process | Beaman Woodworks", description: "Workshop process notes and build logs." }
};

export default async function ProcessPage() {
  await connection();
  const page = getPage("process") || getPage("journal");
  const posts = listPosts();
  const highlights = posts.filter((post) => post.sourceUrl);
  const notes = posts.filter((post) => !post.sourceUrl);

  return (
    <Shell>
      <PageSection editHref="/studio?panel=process">
        <PageIntro eyebrow="Process" title={page?.title ?? "Process"} copy={page?.intro ?? "Behind-the-scenes notes, material observations, and selected outside references."} targets={{ title: { resource: "page", id: "process", field: "title" }, copy: { resource: "page", id: "process", field: "intro" } }} />
        {page?.body ? <p className="page-body-copy" {...inlineEditAttrs({ resource: "page", id: "process", field: "body" })}>{page.body}</p> : null}
        <h2 className="visually-hidden">Process notes</h2>
        {notes.length > 0 ? <div className="journal-listing">{notes.map((post) => <PostCard key={post.slug} post={post} />)}</div> : <div className="public-empty-state"><h2>No bench notes have been published yet</h2><p>In the meantime, explore completed furniture and cabinetry.</p><Link className="button-secondary" href="/portfolio">View the portfolio</Link></div>}
      </PageSection>
      {highlights.length > 0 ? (
        <PageSection editHref="/studio?panel=process">
          <SectionHeading eyebrow="References" title="Reading from the woodshop" copy="Books, essays, and references connected to material, joinery, and long-term use." />
          <div className="journal-listing">{highlights.map((post) => <PostCard key={post.slug} post={post} />)}</div>
        </PageSection>
      ) : null}
    </Shell>
  );
}
