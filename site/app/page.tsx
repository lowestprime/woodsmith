import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DividerBand, PageIntro, PageSection, PieceCard, PostCard, SectionHeading, Shell } from "@/components/site-chrome";
import { getPage, getSiteSettings, listPieces, listPosts } from "@/lib/db";

export const metadata: Metadata = {
  title: "Beaman Woodworks | Handcrafted Hardwood Furniture",
  description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork by Beaman Woodworks. Browse the portfolio, shop available pieces, or commission something original.",
  openGraph: { title: "Beaman Woodworks", description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork." }
};

export default async function HomePage() {
  await connection();
  const site = getSiteSettings();
  const home = getPage("home");
  const featuredSlugs = new Set<string>([...site.homepageFeaturedPieceSlugs]);
  const pieces = listPieces().filter((piece) => featuredSlugs.has(piece.slug)).sort((left, right) => left.featuredRank - right.featuredRank);
  const hero = site.homeSections.find((section) => section.key === "hero") as Record<string, unknown> | undefined;
  const services = site.homeSections.find((section) => section.key === "services") as Record<string, unknown> | undefined;
  const processNotes = listPosts().slice(0, 2);
  const heroCopy = home?.intro || String(hero?.copy ?? "");
  const servicesCopy = home?.body || String(services?.copy ?? "The public site handles portfolio, shop, process notes, and buyer communication while the private dashboard manages content, media, project stages, inventory, invoices, and shipping workflows.");

  return (
    <>
      <Shell>
        <PageSection className="hero-section" editHref="/studio?panel=pages&page=home#page-home">
          <PageIntro
            eyebrow={String(hero?.eyebrow ?? home?.title ?? site.brandName)}
            title={String(hero?.title ?? site.brandTagline)}
            copy={heroCopy}
          />
          <div className="hero-actions">
            <Link className="button-primary" href={String((hero?.primaryCta as { href?: string } | undefined)?.href ?? "/portfolio")}>{String((hero?.primaryCta as { label?: string } | undefined)?.label ?? "View portfolio")}</Link>
            <Link className="button-secondary" href={String((hero?.secondaryCta as { href?: string } | undefined)?.href ?? "/shop")}>{String((hero?.secondaryCta as { label?: string } | undefined)?.label ?? "Shop current work")}</Link>
          </div>
        </PageSection>
      </Shell>

      <DividerBand />

      <Shell>
        <PageSection editHref="/studio?panel=pieces">
          <SectionHeading
            eyebrow="Featured work"
            title="Current collection and established build patterns"
            copy="Public piece pages stay selective and accurate. Available work can be reserved from the shop, while custom work starts with a direct contact request."
          />
          <div className="piece-grid">{pieces.map((piece) => <PieceCard key={piece.slug} piece={piece} />)}</div>
        </PageSection>

        <PageSection editHref="/studio?panel=pages&page=home#page-home">
          <SectionHeading
            eyebrow="Woodshop services"
            title={String(services?.title ?? "From available work to room-specific custom builds")}
            copy={servicesCopy}
          />
          <div className="service-grid">
            <article className="service-card"><h3>Portfolio</h3><p>Finished work with verified photography, materials, and dimensional notes.</p></article>
            <article className="service-card"><h3>Shop</h3><p>Available pieces with asking prices, tax at checkout, and pickup, delivery, or shipping review.</p></article>
            <article className="service-card"><h3>Custom work</h3><p>Contact-first intake, lead-time guidance, and project tracking once a request is accepted.</p></article>
            <article className="service-card"><h3>Private dashboard</h3><p>Content, media, inventory, reviews, orders, and project updates managed from the browser.</p></article>
          </div>
        </PageSection>

        <PageSection editHref="/studio?panel=process">
          <SectionHeading
            eyebrow="Behind the scenes"
            title="Process notes and references that stay close to the work"
            copy="Recent process notes now sit beside the shop, so buyers can move from finished pieces to making details without leaving the site."
          />
          <div className="journal-rail">{processNotes.map((post) => <PostCard key={post.slug} post={post} />)}</div>
          <div className="hero-actions">
            <Link className="button-secondary" href="/shop#process">Read more process notes</Link>
            <Link className="button-primary" href="/contact">Ask about a custom piece</Link>
          </div>
        </PageSection>
      </Shell>
    </>
  );
}

