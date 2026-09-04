import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { PageIntro, PageSection, PieceCard, SectionHeading, Shell } from "@/components/site-chrome";
import { inlineEditAttrs } from "@/components/inline-editable";
import { getMedia, getPage, getSiteSettings, listPieces } from "@/lib/db";
import { getPortfolioCategories } from "@/lib/catalog";
import { toMediaUrl } from "@/lib/format";

export const metadata: Metadata = {
  title: "Beaman Woodworks | Handcrafted Hardwood Furniture",
  description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork by Beaman Woodworks. Browse the portfolio, shop available pieces, or commission something original.",
  openGraph: { title: "Beaman Woodworks", description: "Handcrafted hardwood furniture, cabinetry, and custom woodwork." }
};

export default async function HomePage() {
  await connection();
  const site = getSiteSettings();
  const categories = getPortfolioCategories(site.pieceCategories);
  const home = getPage("home");
  const featuredSlugs = new Set<string>([...site.homepageFeaturedPieceSlugs]);
  const pieces = listPieces().filter((piece) => featuredSlugs.has(piece.slug)).sort((left, right) => left.featuredRank - right.featuredRank);
  const hero = site.homeSections.find((section) => section.key === "hero") as Record<string, unknown> | undefined;
  const services = site.homeSections.find((section) => section.key === "services") as Record<string, unknown> | undefined;
  const homeServices = [...site.homeServices].filter((service) => service.visible).sort((left, right) => left.order - right.order);
  const heroCopy = home?.intro || String(hero?.copy ?? "");
  const servicesCopy = home?.body || String(services?.copy ?? "Browse completed work, see what is available now, or begin a custom piece for a specific room and use.");
  const heroMediaPath = home?.heroMediaPath || "";
  const heroMedia = heroMediaPath ? getMedia(heroMediaPath) : null;

  return (
    <>
      <Shell>
        <PageSection className="hero-section home-hero-section" editHref="/studio?panel=pages&page=home#page-home">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <PageIntro
                eyebrow={String(hero?.eyebrow ?? home?.title ?? site.brandName)}
                title={String(hero?.title ?? site.brandTagline)}
                copy={heroCopy}
                targets={{
                  eyebrow: { resource: "homeSection", id: "hero", field: "eyebrow" },
                  title: { resource: "homeSection", id: "hero", field: "title" },
                  copy: { resource: "page", id: "home", field: "intro" }
                }}
              />
              <div className="hero-actions">
                <Link className="button-primary" href={String((hero?.primaryCta as { href?: string } | undefined)?.href ?? "/portfolio")} {...inlineEditAttrs({ resource: "homeSection", id: "hero", field: "primaryCta.label", urlField: "primaryCta.href" })}>{String((hero?.primaryCta as { label?: string } | undefined)?.label ?? "View portfolio")}</Link>
                <Link className="button-secondary" href={String((hero?.secondaryCta as { href?: string } | undefined)?.href ?? "/shop")} {...inlineEditAttrs({ resource: "homeSection", id: "hero", field: "secondaryCta.label", urlField: "secondaryCta.href" })}>{String((hero?.secondaryCta as { label?: string } | undefined)?.label ?? "Shop current work")}</Link>
              </div>
            </div>
            {heroMedia && heroMedia.metadata.mediaPreviewStatus !== "unavailable" ? (
              <figure className="home-hero-media" data-media-id={`page:home:${heroMediaPath}`} data-media-item="true">
                <Image
                  alt={heroMedia?.altText || "Featured furniture by Beaman Woodworks"}
                  className={`home-hero-image cleanup-${String(heroMedia?.metadata.cleanupMode ?? "original")}`}
                  fill
                  priority
                  quality={92}
                  sizes="(max-width: 840px) calc(100vw - 2rem), 52vw"
                  src={toMediaUrl(heroMediaPath)}
                  style={{ objectPosition: `${heroMedia?.focalX ?? 50}% ${heroMedia?.focalY ?? 50}%`, transform: `scale(${heroMedia?.zoom ?? 1})` }}
                />
              </figure>
            ) : null}
          </div>
        </PageSection>
      </Shell>


      <Shell>
        <PageSection editHref="/studio?panel=pieces">
          <SectionHeading
            eyebrow="Featured work"
            title="Selected furniture and cabinetry"
            copy="A concise selection of completed pieces, with materials, dimensions, and build notes."
          />
          <div aria-label="Featured work" className="piece-grid" data-media-collection="workshop-featured-pieces" data-media-collection-variant="editorial-grid" role="region">{pieces.map((piece, index) => <PieceCard categories={categories} key={piece.slug} order={index} piece={piece} />)}</div>
        </PageSection>

        <PageSection editHref="/studio?panel=pages&page=home#page-home">
          <SectionHeading
            eyebrow="Woodshop services"
            title={String(services?.title ?? "From available work to room-specific custom builds")}
            copy={servicesCopy}
            targets={{
              eyebrow: { resource: "homeSection", id: "services", field: "eyebrow" },
              title: { resource: "homeSection", id: "services", field: "title" },
              copy: { resource: "page", id: "home", field: "body" }
            }}
          />
          <div className="service-grid">
            {homeServices.map((service, index) => (
              <Link className="service-card service-card-link" href={service.href} key={service.id}>
                <span className="service-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3>{service.title}</h3>
                <p>{service.body}</p>
                <span className="service-card-cta">{service.linkLabel}<span aria-hidden="true">→</span></span>
              </Link>
            ))}
          </div>
        </PageSection>

        <PageSection editHref="/studio?panel=custom">
          <SectionHeading
            eyebrow="Commissioned builds"
            title="Start with the room, the use, and the dimensions"
            copy="A custom request begins with practical information. William reviews the brief, confirms current lead time, and follows up before any quote or build commitment is made."
          />
          <ol className="commission-path">
            <li><span>01</span><div><h3>Send the brief</h3><p>Describe the intended use, room, approximate size, material preferences, and timing.</p></div></li>
            <li><span>02</span><div><h3>Review the scope</h3><p>The woodshop confirms fit, current capacity, likely fulfillment method, and what still needs measuring.</p></div></li>
            <li><span>03</span><div><h3>Approve the project</h3><p>A detailed estimate and project reference are prepared before the build enters the active queue.</p></div></li>
          </ol>
          <div className="hero-actions">
            <Link className="button-primary" href="/contact">Ask about a custom piece</Link>
            <Link className="button-secondary" href="/commissions">Open the project planner</Link>
          </div>
        </PageSection>
      </Shell>
    </>
  );
}
