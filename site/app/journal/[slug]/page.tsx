import { marked } from "marked";
import { notFound } from "next/navigation";
import { PageIntro, Shell } from "@/components/site-chrome";
import { getPost, journalPosts } from "@/lib/content";
import { formatDate } from "@/lib/format";

export function generateStaticParams() {
  return journalPosts.map((post) => ({ slug: post.slug }));
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  const html = await marked.parse(post.body);

  return (
    <section className="section-pad">
      <Shell className="article-shell">
        <PageIntro eyebrow={`${formatDate(post.date)} / ${post.readTime}`} title={post.title} copy={post.excerpt} />
        <article className="article-body" dangerouslySetInnerHTML={{ __html: html }} />
      </Shell>
    </section>
  );
}
