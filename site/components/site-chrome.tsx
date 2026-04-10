import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDisplayMediaPaths, getPiecePortfolioCategory, hasVerifiedMedia } from "@/lib/catalog";
import { formatDate, formatLeadTime, toMediaUrl } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getBandwidthSnapshot, getSiteSettings, listCartItems, type PageRecord, type PieceRecord, type PostRecord, type ProjectRecord } from "@/lib/db";
import { logoutAction } from "@/lib/actions";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shell ${className}`.trim()}>{children}</div>;
}

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-emblem" viewBox="0 0 84 84">
      <rect height="70" rx="24" width="70" x="7" y="7" />
      <path d="M26 22v40m0-20h32m-12-20v40M22 26h36v32H22z" />
      <circle cx="60" cy="24" r="4" />
    </svg>
  );
}

function AccountBadge({ label }: { label: string }) {
  return <span className="account-badge" aria-hidden="true">{label}</span>;
}

function CategoryIcon({ category }: { category: string }) {
  const key = getPiecePortfolioCategory({ category } as Pick<PieceRecord, "category">);

  if (key === "tables") {
    return <span className="category-icon" aria-hidden="true"><i /><i /><i /></span>;
  }

  if (key === "benches") {
    return <span className="category-icon bench-icon" aria-hidden="true"><i /><i /><i /></span>;
  }

  if (key === "stepstools") {
    return <span className="category-icon stepstool-icon" aria-hidden="true"><i /><i /><i /></span>;
  }

  if (key === "cabinets") {
    return <span className="category-icon cabinet-icon" aria-hidden="true"><i /><i /><i /></span>;
  }

  return <span className="category-icon object-icon" aria-hidden="true"><i /><i /><i /></span>;
}

export async function SiteHeader() {
  const site = getSiteSettings();
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const cartToken = cookieStore.get("beaman-cart")?.value;
  const cartCount = cartToken ? listCartItems(cartToken, user?.email ?? null).reduce((sum, item) => sum + item.quantity, 0) : 0;
  const accountHref = user ? (user.role === "admin" ? "/studio" : "/account/profile") : "/account/login";
  const accountLabel = (user?.displayName ?? "")
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("") || "BW";

  return (
    <header className="site-header">
      <Shell className="header-inner">
        <Link className="brand-lockup" href="/">
          <BrandMark />
          <span>
            <span className="brand-mark">{site.brandName}</span>
            <span className="brand-subtitle">{site.brandTagline}</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="site-nav">
          {site.navigation.map((item) => (
            <Link className="nav-link-pill" href={item.href} key={item.href}>{item.label}</Link>
          ))}
          <Link aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`} className="nav-link-pill cart-link" href="/shop/cart">
            <span aria-hidden="true">Cart</span>
            <strong>{cartCount}</strong>
          </Link>
          <Link aria-label={user ? `${user.displayName} account` : "Account"} className="account-link" href={accountHref} title={user ? `${user.displayName}${user.role === "admin" ? " · woodshop dashboard" : ""}` : "Account"}>
            <AccountBadge label={accountLabel} />
          </Link>
          {user ? <form action={logoutAction}><button className="text-button nav-link-pill subtle-pill" type="submit">Log out</button></form> : null}
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
          <p className="footer-title">Woodshop contact</p>
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
  const firstImage = getDisplayMediaPaths(piece)[0];
  const verified = hasVerifiedMedia(piece);
  return (
    <article className="piece-card">
      <Link className="piece-card-link" href={`/portfolio/${piece.slug}`}>
        {firstImage ? <img alt={piece.title} className="piece-card-image" loading="lazy" src={toMediaUrl(firstImage)} /> : <div className="piece-card-placeholder">Media under review</div>}
        <div className="piece-card-body">
          <div className="piece-card-meta">
            <span className="category-meta"><CategoryIcon category={piece.category} />{piece.category}</span>
            <span>{verified ? "Verified photography" : "Photography in progress"}</span>
          </div>
          <h3>{piece.title}</h3>
          <p>{piece.summary}</p>
          <div className="piece-card-footer">
            <span>{piece.availabilityLabel}</span>
            <span>Updated {formatDate(piece.updatedAt)}</span>
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
        <span>{post.sourceUrl ? "Reference" : "Behind the scenes"}</span>
      </div>
      <h3><Link href={`/process/${post.slug}`}>{post.title}</Link></h3>
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
        <p>Lead time is running about {formatLeadTime(bandwidth.leadTimeDays)} with {bandwidth.activeProjects} active project{bandwidth.activeProjects === 1 ? "" : "s"} in the queue.</p>
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

export function PageSection({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section className={`page-section ${className}`.trim()} id={id}>{children}</section>;
}
