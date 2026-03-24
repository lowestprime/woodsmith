import Link from "next/link";
import { DividerBand, PageIntro, PageSection, PieceCard, PostCard, SectionHeading, Shell, StatusBand } from "@/components/site-chrome";
import { getPage, getSiteSettings, listPieces, listPosts } from "@/lib/db";

export default function HomePage() {
  const site = getSiteSettings();
  const home = getPage("home");
  const featuredSlugs = new Set<string>([...site.homepageFeaturedPieceSlugs]);
  const pieces = listPieces().filter((piece) => featuredSlugs.has(piece.slug)).sort((left, right) => left.featuredRank - right.featuredRank);
  const latestPosts = listPosts().slice(0, 3);
  const hero = site.homeSections.find((section) => section.key === "hero") as Record<string, unknown> | undefined;
  const services = site.homeSections.find((section) => section.key === "services") as Record<string, unknown> | undefined;

  return (
    <>
      <Shell>
        <PageSection className="hero-section">
          <PageIntro
            eyebrow={String(hero?.eyebrow ?? home?.title ?? site.brandName)}
            title={String(hero?.title ?? site.brandTagline)}
            copy={String(hero?.copy ?? home?.intro ?? "")}
          />
          <div className="hero-actions">
            <Link className="button-primary" href={String((hero?.primaryCta as { href?: string } | undefined)?.href ?? "/portfolio")}>{String((hero?.primaryCta as { label?: string } | undefined)?.label ?? "View portfolio")}</Link>
            <Link className="button-secondary" href={String((hero?.secondaryCta as { href?: string } | undefined)?.href ?? "/commissions")}>{String((hero?.secondaryCta as { label?: string } | undefined)?.label ?? "Start a commission")}</Link>
          </div>
        </PageSection>
      </Shell>

      <DividerBand />

      <Shell>
        <PageSection>
          <SectionHeading
            eyebrow="Featured work"
            title="Current collection and proven build patterns"
            copy="Verified media stays paired to each public piece page. Inventory items can be reserved directly, and commission pieces route buyers into the visualizer and project brief workflow."
          />
          <div className="piece-grid">{pieces.map((piece) => <PieceCard key={piece.slug} piece={piece} />)}</div>
        </PageSection>

        <StatusBand />

        <PageSection>
          <SectionHeading
            eyebrow="Studio services"
            title={String(services?.title ?? "From available work to room-specific commissions")}
            copy={String(services?.copy ?? "The public site handles portfolio, shop, blog, and commission intake while the studio dashboard manages content, media, project stages, inventory, invoices, and shipping workflows.")}
          />
          <div className="service-grid">
            <article className="service-card"><h3>Portfolio</h3><p>Past work, verified imagery, materials, and dimensional notes.</p></article>
            <article className="service-card"><h3>Shop</h3><p>Available pieces, cart, coupon handling, tax estimate, and checkout infrastructure.</p></article>
            <article className="service-card"><h3>Commissions</h3><p>To-scale visualizer, live estimate, buyer uploads, and project tracking.</p></article>
            <article className="service-card"><h3>Studio CMS</h3><p>Browser-based editing for pages, pieces, posts, media, settings, and queue status.</p></article>
          </div>
        </PageSection>

        <PageSection>
          <SectionHeading
            eyebrow="Journal"
            title="Process notes and curated references"
            copy="Journal posts live beside the work itself, and external highlights remain editable from the studio with markdown previews and linked source material."
          />
          <div className="journal-rail">{latestPosts.map((post) => <PostCard key={post.slug} post={post} />)}</div>
        </PageSection>
      </Shell>
    </>
  );
}

