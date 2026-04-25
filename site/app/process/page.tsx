import type { Metadata } from "next";
import { connection } from "next/server";
import { PageIntro, PageSection, PostCard, Shell } from "@/components/site-chrome";
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
        <PageIntro eyebrow="Process" title={page?.title ?? "Process"} copy={page?.intro ?? "Behind-the-scenes notes, material observations, and selected outside references."} />
        {page?.body ? <p className="page-body-copy">{page.body}</p> : null}
        <div className="journal-listing">{notes.map((post) => <PostCard key={post.slug} post={post} />)}</div>
      </PageSection>
      {highlights.length > 0 ? (
        <PageSection editHref="/studio?panel=process">
          <PageIntro eyebrow="References" title="Outside material worth keeping close to the bench" copy="A smaller set of books, essays, and references that help frame the work." />
          <div className="journal-listing">{highlights.map((post) => <PostCard key={post.slug} post={post} />)}</div>
        </PageSection>
      ) : null}
    </Shell>
  );
}
