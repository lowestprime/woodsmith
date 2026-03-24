import { PageIntro, PageSection, PostCard, Shell } from "@/components/site-chrome";
import { getPage, listPosts } from "@/lib/db";

export default function JournalPage() {
  const page = getPage("journal");
  const posts = listPosts();
  const highlights = posts.filter((post) => post.sourceUrl);

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Journal" title={page?.title ?? "Shop Talk"} copy={page?.intro ?? "Process notes and curated references."} />
        <div className="journal-listing">{posts.map((post) => <PostCard key={post.slug} post={post} />)}</div>
      </PageSection>
      {highlights.length > 0 ? (
        <PageSection>
          <PageIntro eyebrow="Highlights from the Web" title="References worth keeping close to the bench" copy="External links can be published from the same markdown-driven journal editor used for studio writing and project notes." />
          <div className="journal-listing">{highlights.map((post) => <PostCard key={post.slug} post={post} />)}</div>
        </PageSection>
      ) : null}
    </Shell>
  );
}
