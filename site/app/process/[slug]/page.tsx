import { marked } from "marked";
import { notFound } from "next/navigation";
import { MediaLightbox } from "@/components/lightbox";
import { PageSection, Shell } from "@/components/site-chrome";
import { getPost } from "@/lib/db";
import { formatDate, sanitizeHtml, toMediaUrl } from "@/lib/format";

export default async function ProcessPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    notFound();
  }

  return (
    <Shell>
      <PageSection className="journal-entry" editHref={`/studio?panel=process&post=${encodeURIComponent(post.slug)}#post-${post.slug}`}>
        <p className="eyebrow">{post.publishedAt ? formatDate(post.publishedAt) : "Draft"}</p>
        <h1>{post.title}</h1>
        <p className="lede">{post.excerpt}</p>
        {post.coverMediaPath ? <MediaLightbox className="journal-cover" items={[{ src: toMediaUrl(post.coverMediaPath), alt: post.title }]} title={post.title} /> : null}
        {post.sourceUrl ? <p className="source-note">Source: <a href={post.sourceUrl} rel="noreferrer" target="_blank">{post.sourceUrl}</a></p> : null}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(post.body) as string) }} />
      </PageSection>
    </Shell>
  );
}
