import Link from "next/link";
import { PageIntro, Shell } from "@/components/site-chrome";
import { journalPosts } from "@/lib/content";
import { formatDate } from "@/lib/format";

export default function JournalPage() {
  return (
    <section className="section-pad">
      <Shell>
        <PageIntro
          eyebrow="Journal"
          title="Notes on proportion, cabinetry, and the smaller decisions that make a room feel settled"
          copy="Each post lives beside the portfolio and the commission tools so writing, images, and buyer conversations stay in the same self-hosted system."
        />
        <div className="journal-listing">
          {journalPosts.map((post) => (
            <article className="journal-entry" key={post.slug}>
              <div className="journal-meta">
                <span>{formatDate(post.date)}</span>
                <span>{post.readTime}</span>
              </div>
              <h2><Link href={`/journal/${post.slug}`}>{post.title}</Link></h2>
              <p>{post.excerpt}</p>
            </article>
          ))}
        </div>
      </Shell>
    </section>
  );
}
