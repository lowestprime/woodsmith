import { marked } from "marked";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { MediaLightbox } from "@/components/lightbox";
import { PageSection, Shell } from "@/components/site-chrome";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getPost } from "@/lib/db";
import { formatDate, sanitizeHtml, toMediaUrl } from "@/lib/format";

export default async function ProcessPostPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    notFound();
  }

  return (
    <Shell>
      <PageSection className="journal-entry" editHref={`/studio?panel=process&post=${encodeURIComponent(post.slug)}#post-${post.slug}`}>
        <p className="eyebrow">{post.publishedAt ? formatDate(post.publishedAt) : "Draft"}</p>
        <h1 {...inlineEditAttrs({ resource: "post", id: post.slug, field: "title" })}>{post.title}</h1>
        <p className="lede" {...inlineEditAttrs({ resource: "post", id: post.slug, field: "excerpt" })}>{post.excerpt}</p>
        {post.coverMediaPath ? <MediaLightbox className="journal-cover" items={[{ src: toMediaUrl(post.coverMediaPath), alt: post.title }]} title={post.title} /> : null}
        {post.sourceUrl ? <p className="source-note">Source: <a href={post.sourceUrl} rel="noreferrer" target="_blank" {...inlineEditAttrs({ resource: "post", id: post.slug, field: "sourceLabel", urlField: "sourceUrl" })}>{post.sourceLabel || post.sourceUrl}</a></p> : null}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(post.body) as string) }} />
      </PageSection>
    </Shell>
  );
}
