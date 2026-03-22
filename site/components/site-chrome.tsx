import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { journalPosts, pieceNames, type JournalPost, type Piece } from "@/lib/content";
import { formatDate, toMediaUrl } from "@/lib/format";
import type { RequestRecord, RequestUpdateRecord } from "@/lib/db";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shell ${className}`.trim()}>{children}</div>;
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Shell className="header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark">Woodsmith</span>
          <span className="brand-subtitle">portfolio, journal, shop, commissions</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/portfolio">Portfolio</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/journal">Journal</Link>
          <Link href="/commissions">Commissions</Link>
          <Link href="/studio/login">Studio</Link>
        </nav>
      </Shell>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Shell className="footer-grid">
        <div>
          <p className="footer-title">Woodsmith</p>
          <p className="footer-copy">
            Self-hosted on your own hardware so the portfolio, inquiry history, and journal stay under your control.
          </p>
        </div>
        <div>
          <p className="footer-title">Piece Ledger</p>
          <p className="footer-copy footer-ledger">{pieceNames.join(" / ")}</p>
        </div>
        <div>
          <p className="footer-title">Flow</p>
          <p className="footer-copy">Inquiry, quote, build updates, and delivery planning all live in one place.</p>
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
  return (
    <div className="divider-band" aria-label="Signature piece list">
      {pieceNames.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}

export function PieceCard({ piece }: { piece: Piece }) {
  return (
    <article className="piece-card">
      <Link className="piece-card-link" href={`/portfolio/${piece.slug}`}>
        <div className="piece-card-media">
          <Image
            alt={piece.name}
            className="piece-image"
            fill
            sizes="(max-width: 900px) 100vw, 33vw"
            src={toMediaUrl(piece.images[0])}
          />
        </div>
        <div className="piece-card-body">
          <div className="piece-card-meta">
            <span>{piece.category}</span>
            <span className={`status-badge status-${piece.status}`}>{piece.availabilityLabel}</span>
          </div>
          <h3>{piece.name}</h3>
          <p>{piece.summary}</p>
        </div>
      </Link>
    </article>
  );
}

export function FeatureStack({ pieces }: { pieces: Piece[] }) {
  return (
    <div className="feature-stack">
      {pieces.map((piece, index) => (
        <Link className="feature-card" href={`/portfolio/${piece.slug}`} key={piece.slug}>
          <div className="feature-index">0{index + 1}</div>
          <div className="feature-copy">
            <p className="eyebrow">{piece.category}</p>
            <h3>{piece.name}</h3>
            <p>{piece.story}</p>
          </div>
          <div className="feature-media">
            <Image alt={piece.name} fill sizes="(max-width: 900px) 100vw, 28vw" src={toMediaUrl(piece.images[0])} />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function PieceGallery({ piece }: { piece: Piece }) {
  return (
    <div className="piece-gallery">
      {piece.images.map((image, index) => (
        <figure className="piece-gallery-item" key={`${piece.slug}-${image}`}>
          <div className="piece-gallery-frame">
            <Image
              alt={`${piece.name} view ${index + 1}`}
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              src={toMediaUrl(image)}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}

export function JournalCard({ post }: { post: JournalPost }) {
  return (
    <article className="journal-card">
      <div className="journal-meta">
        <span>{formatDate(post.date)}</span>
        <span>{post.readTime}</span>
      </div>
      <h3>
        <Link href={`/journal/${post.slug}`}>{post.title}</Link>
      </h3>
      <p>{post.excerpt}</p>
    </article>
  );
}

export function JournalRail() {
  return (
    <div className="journal-rail">
      {journalPosts.map((post) => (
        <JournalCard key={post.slug} post={post} />
      ))}
    </div>
  );
}

export function RequestSummary({ request, updates, privateView = false }: {
  request: RequestRecord;
  updates: RequestUpdateRecord[];
  privateView?: boolean;
}) {
  return (
    <section className="request-summary">
      <div className="request-summary-head">
        <div>
          <p className="eyebrow">Reference {request.reference}</p>
          <h1>{request.pieceLabel}</h1>
          <p className="lede">{request.kind === "commission" ? "Commission dossier" : "Reservation dossier"}</p>
        </div>
        <div className="request-status-card">
          <span className="status-pill">{request.status}</span>
          <p>{request.adminStage}</p>
        </div>
      </div>

      <div className="request-grid">
        <div className="request-panel">
          <h2>Project brief</h2>
          <dl className="detail-list">
            <div><dt>Client</dt><dd>{request.customerName}</dd></div>
            <div><dt>Email</dt><dd>{request.email}</dd></div>
            {request.phone ? <div><dt>Phone</dt><dd>{request.phone}</dd></div> : null}
            {request.city ? <div><dt>Location</dt><dd>{request.city}</dd></div> : null}
            {request.budget ? <div><dt>Budget</dt><dd>{request.budget}</dd></div> : null}
            {request.timeline ? <div><dt>Timeline</dt><dd>{request.timeline}</dd></div> : null}
            {request.materials ? <div><dt>Materials</dt><dd>{request.materials}</dd></div> : null}
            {request.dimensions ? <div><dt>Dimensions</dt><dd>{request.dimensions}</dd></div> : null}
          </dl>
          <div className="request-message-block">
            <h3>Original note</h3>
            <p>{request.message}</p>
          </div>
          {request.publicNotes ? (
            <div className="request-message-block accent-block">
              <h3>Studio note</h3>
              <p>{request.publicNotes}</p>
            </div>
          ) : null}
          {privateView && request.internalNotes ? (
            <div className="request-message-block muted-block">
              <h3>Internal note</h3>
              <p>{request.internalNotes}</p>
            </div>
          ) : null}
        </div>

        <div className="request-panel">
          <h2>Timeline</h2>
          <ol className="update-list">
            {updates.map((update) => (
              <li key={update.id} className={`update-item ${update.authorRole}`}>
                <div>
                  <p className="update-author">{update.authorRole === "studio" ? "Studio" : "Buyer"}</p>
                  <p className="update-date">{formatDate(update.createdAt)}</p>
                </div>
                <p>{update.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function DashboardTable({ requests }: { requests: RequestRecord[] }) {
  return (
    <div className="dashboard-table-wrap">
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Type</th>
            <th>Piece</th>
            <th>Client</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.reference}>
              <td>
                <Link href={`/studio/request/${request.reference}`}>{request.reference}</Link>
              </td>
              <td>{request.kind}</td>
              <td>{request.pieceLabel}</td>
              <td>{request.customerName}</td>
              <td>{request.status}</td>
              <td>{formatDate(request.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
