import { cache, type ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderSearch } from "@/components/header-search";
import { HeaderShell } from "@/components/header-shell";
import { avatarGradientStyle } from "@/lib/avatar";
import { getDisplayMediaPaths, getPiecePortfolioCategory, hasVerifiedMedia } from "@/lib/catalog";
import { formatDate, formatLeadTime, resolveAssetUrl, toMediaUrl } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getBandwidthSnapshot, getMedia, getSiteSettings, listCartItems, listPages, type PieceRecord, type PostRecord, type ProjectRecord } from "@/lib/db";
import { logoutAction } from "@/lib/actions";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shell ${className}`.trim()}>{children}</div>;
}

export function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-emblem" viewBox="0 0 84 84">
      <rect height="72" rx="22" width="72" x="6" y="6" />
      <path d="M22 26h22l-8 16 8 16H22V26Z" />
      <path d="M62 58H40l8-16-8-16h22v32Z" />
      <path d="M42 18v48M18 42h48" />
      <circle cx="42" cy="42" r="3.5" />
    </svg>
  );
}

const getViewer = cache(async () => getCurrentUser());

function AccountBadge({ label, avatarPath, loggedIn, seed }: { label: string; avatarPath?: string | null; loggedIn: boolean; seed?: string }) {
  if (avatarPath) {
    return <img alt={label} className="account-badge-avatar" src={resolveAssetUrl(avatarPath)} />;
  }

  if (!loggedIn) {
    return (
      <span className="account-badge account-badge-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="3.4" />
          <path d="M5.75 18.25c1.5-3 3.63-4.5 6.25-4.5s4.75 1.5 6.25 4.5" />
        </svg>
      </span>
    );
  }

  return <span className="account-badge account-badge-gradient" aria-hidden="true" style={avatarGradientStyle(seed ?? label)}>{label}</span>;
}

function EditGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 16.8V20h3.2L18.7 8.5l-3.2-3.2L4 16.8Z" />
      <path d="m14.9 5.9 3.2 3.2" />
    </svg>
  );
}

export function CategoryIcon({ category }: { category: string }) {
  const key = getPiecePortfolioCategory({ category } as Pick<PieceRecord, "category">);

  if (key === "all") {
    return <span className="category-icon all-icon" aria-hidden="true"><i /><i /><i /></span>;
  }

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

const RESERVED_NAV_SLUGS = new Set([
  "home",
  "portfolio",
  "shop",
  "journal",
  "process",
  "commissions",
  "requests",
  "studio",
  "about",
  "account",
  "search",
  "media",
  "contact"
]);

export async function SiteHeader() {
  const site = getSiteSettings();
  const user = await getViewer();
  const seedHrefs = new Set(site.navigation.map((entry) => String(entry.href)));
  const dynamicPages = listPages(false)
    .filter((page) => !RESERVED_NAV_SLUGS.has(page.slug) && !seedHrefs.has(`/${page.slug}`))
    .map((page) => ({ href: `/${page.slug}` as const, label: page.navLabel || page.title }));
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
    <HeaderShell>
      <Shell className="header-inner">
        <Link className="brand-lockup" href="/">
          <BrandMark />
          <span>
            <span className="brand-mark">{site.brandName}</span>
            <span className="brand-subtitle">{site.brandTagline}</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="site-nav">
          {site.navigation.filter((item) => String(item.href) !== "/search").map((item) => (
            <Link className="nav-link-pill" href={item.href} key={item.href}>{item.label}</Link>
          ))}
          {dynamicPages.map((item) => (
            <Link className="nav-link-pill" href={item.href} key={item.href}>{item.label}</Link>
          ))}
          <HeaderSearch />
        </nav>
        <div className="header-actions">
          <Link aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`} className="nav-link-pill cart-link" href="/shop/cart">
            <span aria-hidden="true">Cart</span>
            <strong>{cartCount}</strong>
          </Link>
          <Link aria-label={user ? `${user.displayName} account` : "Account"} className="account-link" href={accountHref} title={user ? `${user.displayName}${user.role === "admin" ? " · woodshop dashboard" : ""}` : "Account"}>
            <AccountBadge avatarPath={user?.avatarPath} label={accountLabel} loggedIn={Boolean(user)} seed={user?.email ?? user?.displayName ?? accountLabel} />
          </Link>
          {user ? <form action={logoutAction}><button aria-label="Log out" className="header-icon-button" type="submit" title="Log out"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></button></form> : null}
          <ThemeToggle />
        </div>
      </Shell>
    </HeaderShell>
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
  const media = firstImage ? getMedia(firstImage) : null;
  return (
    <article className="piece-card">
      <Link className="piece-card-link" href={`/portfolio/${piece.slug}`}>
        {firstImage ? <img alt={media?.altText || piece.title} className={`piece-card-image cleanup-${String(media?.metadata.cleanupMode ?? "original")}`} loading="lazy" src={toMediaUrl(firstImage)} style={{ objectPosition: `${media?.focalX ?? 50}% ${media?.focalY ?? 50}%`, transform: `scale(${media?.zoom ?? 1})` }} /> : <div className="piece-card-placeholder">Media under review</div>}
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

export async function PageSection({
  children,
  className = "",
  id,
  editHref,
  editLabel = "Edit section"
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  editHref?: string;
  editLabel?: string;
}) {
  const viewer = editHref ? await getViewer() : null;

  return (
    <section className={`page-section ${className}${editHref ? " section-has-edit" : ""}`.trim()} id={id}>
      {viewer?.role === "admin" && editHref ? (
        <Link aria-label={editLabel} className="section-edit-link" href={editHref} title={editLabel}>
          <EditGlyph />
          <span>Edit</span>
        </Link>
      ) : null}
      {children}
    </section>
  );
}
