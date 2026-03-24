import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatDate, formatLeadTime, formatMoney, toMediaUrl } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getBandwidthSnapshot, getSiteSettings, listCartItems, type PageRecord, type PieceRecord, type PostRecord, type ProjectRecord } from "@/lib/db";
import { logoutAction } from "@/lib/actions";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shell ${className}`.trim()}>{children}</div>;
}

export async function SiteHeader() {
  const site = getSiteSettings();
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const cartToken = cookieStore.get("beaman-cart")?.value;
  const cartCount = cartToken ? listCartItems(cartToken, user?.email ?? null).reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <header className="site-header">
      <Shell className="header-inner">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">{site.brandName}</span>
          <span className="brand-subtitle">{site.brandTagline}</span>
        </Link>
        <nav aria-label="Primary" className="site-nav">
          {site.navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
          <Link href="/shop/cart">Cart {cartCount > 0 ? `(${cartCount})` : ""}</Link>
          {user ? (
            <>
              <Link href={user.role === "admin" ? "/studio" : "/account/profile"}>{user.role === "admin" ? "Studio" : "Account"}</Link>
              <form action={logoutAction}><button className="text-button" type="submit">Log Out</button></form>
            </>
          ) : (
            <Link href="/account/login">Account</Link>
          )}
        </nav>
        <ThemeToggle />
      </Shell>
    </header>
  );
}

export function SiteFooter() {
  const site = getSiteSettings();
  return (
    <footer className="site-footer">
      <Shell className="footer-grid">
        <div>
          <p className="footer-title">{site.brandName}</p>
          <p className="footer-copy">{site.siteAnnouncement}</p>
        </div>
        <div>
          <p className="footer-title">Studio contact</p>
          <p className="footer-copy">
            {site.builderName} · <a href={`mailto:${site.builderEmail}`}>{site.builderEmail}</a>
          </p>
          <p className="footer-copy footer-small">
            Site design and development: {site.developerName} · <a href={`mailto:${site.developerEmail}`}>{site.developerEmail}</a>
          </p>
        </div>
        <div>
          <p className="footer-title">Links</p>
          <div className="footer-links">
            {site.socialLinks.filter((item) => item.url).map((item) => (
              <a href={item.url} key={item.label} rel="noreferrer" target="_blank">{item.label}</a>
            ))}
            <a href={site.repoUrl} rel="noreferrer" target="_blank">GitHub repository</a>
            <Link href="/care-and-warranty">Care &amp; warranty</Link>
          </div>
        </div>
      </Shell>
    </footer>
  );
}

export function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{copy}</p>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

export function DividerBand() {
  const site = getSiteSettings();
  return (
    <div aria-label="Piece divider list" className="divider-band">
      {site.pieceDividerNames.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}

export function PieceCard({ piece }: { piece: PieceRecord }) {
  const firstImage = piece.mediaPaths[0];
  return (
    <article className="piece-card">
      <Link className="piece-card-link" href={`/portfolio/${piece.slug}`}>
        {firstImage ? <img alt={piece.title} className="piece-card-image" loading="lazy" src={toMediaUrl(firstImage)} /> : <div className="piece-card-placeholder">Media under review</div>}
        <div className="piece-card-body">
          <div className="piece-card-meta">
            <span>{piece.category}</span>
            <span>{piece.availabilityLabel}</span>
          </div>
          <h3>{piece.title}</h3>
          <p>{piece.summary}</p>
          <div className="piece-card-footer">
            <span>{piece.priceCents == null ? formatLeadTime(piece.leadTimeDays) : formatMoney(piece.priceCents)}</span>
            <span>{piece.status === "inventory" ? `${piece.inventoryCount} available` : formatLeadTime(piece.leadTimeDays)}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function PostCard({ post }: { post: PostRecord }) {
  return (
    <article className="journal-card">
      <div className="journal-meta">
        <span>{post.publishedAt ? formatDate(post.publishedAt) : "Draft"}</span>
        {post.sourceUrl ? <span>Web highlight</span> : null}
      </div>
      <h3><Link href={`/journal/${post.slug}`}>{post.title}</Link></h3>
      <p>{post.excerpt}</p>
    </article>
  );
}

export function StatusBand() {
  const bandwidth = getBandwidthSnapshot();
  return (
    <section className="status-band">
      <div>
        <p className="eyebrow">Current bandwidth</p>
        <h2>{bandwidth.bandwidthPercent}% capacity</h2>
        <p>Lead time running about {formatLeadTime(bandwidth.leadTimeDays)} with {bandwidth.activeProjects} active project{bandwidth.activeProjects === 1 ? "" : "s"} in the queue.</p>
      </div>
      <div className="status-bar-wrap">
        <div className="status-bar"><span style={{ width: `${bandwidth.bandwidthPercent}%` }} /></div>
        <div className="status-stats">
          <span>{bandwidth.activeProjects} in progress</span>
          <span>{bandwidth.shippedCount} shipped</span>
        </div>
      </div>
    </section>
  );
}

export function ShareLinks({ title, url }: { title: string; url: string }) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return (
    <div className="share-links">
      <a href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}>Email</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} rel="noreferrer" target="_blank">Facebook</a>
      <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} rel="noreferrer" target="_blank">X</a>
      <a href={`https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`} rel="noreferrer" target="_blank">Pinterest</a>
    </div>
  );
}

export function ProjectOverviewCard({ project }: { project: ProjectRecord }) {
  return (
    <article className="project-card">
      <div>
        <p className="eyebrow">{project.reference}</p>
        <h3>{project.pieceSlug || project.commissionTypeSlug || "Custom project"}</h3>
      </div>
      <div className="project-card-status">
        <span>{project.status}</span>
        <p>{project.stage}</p>
      </div>
    </article>
  );
}

export function PageGrid({ children }: { children: ReactNode }) {
  return <div className="page-grid">{children}</div>;
}

export function PageSection({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`page-section ${className}`.trim()}>{children}</section>;
}
