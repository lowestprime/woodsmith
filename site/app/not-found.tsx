import Link from "next/link";
import { PageSection, Shell } from "@/components/site-chrome";

export default function NotFound() {
  return (
    <Shell>
      <PageSection>
        <div style={{ textAlign: "center" }}>
          <p className="eyebrow">404</p>
          <h1>Page not found</h1>
          <p className="lede" style={{ maxWidth: "38rem", margin: "0 auto var(--space-6)" }}>
            The page you requested does not exist or has been moved. Browse the portfolio, shop for available pieces, or search for what you need.
          </p>
          <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="button-primary" href="/portfolio">Portfolio</Link>
            <Link className="button-secondary" href="/shop">Shop</Link>
            <Link className="button-secondary" href="/search">Search</Link>
          </div>
        </div>
      </PageSection>
    </Shell>
  );
}
