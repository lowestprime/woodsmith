import { PageIntro, PageSection, PostCard, Shell } from "@/components/site-chrome";
import { getPage, listPosts } from "@/lib/db";

export default function ProcessPage() {
  const page = getPage("process") || getPage("journal");
  const posts = listPosts();
  const highlights = posts.filter((post) => post.sourceUrl);
  const notes = posts.filter((post) => !post.sourceUrl);

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Process" title={page?.title ?? "Process"} copy={page?.intro ?? "Behind-the-scenes notes, material observations, and selected outside references."} />
        <div className="journal-listing">{notes.map((post) => <PostCard key={post.slug} post={post} />)}</div>
      </PageSection>
      {highlights.length > 0 ? (
        <PageSection>
          <PageIntro eyebrow="References" title="Outside material worth keeping close to the bench" copy="A smaller set of books, essays, and references that help frame the work." />
          <div className="journal-listing">{highlights.map((post) => <PostCard key={post.slug} post={post} />)}</div>
        </PageSection>
      ) : null}
    </Shell>
  );
}
