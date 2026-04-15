"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <section className="page-section" style={{ textAlign: "center", padding: "6rem 2rem" }}>
      <p className="eyebrow">Error</p>
      <h1>Something went wrong</h1>
      <p className="lede" style={{ maxWidth: "38rem", margin: "0 auto var(--space-6)" }}>
        An unexpected error occurred. This has been logged. You can try again or return to the homepage.
      </p>
      <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center" }}>
        <button className="button-primary" onClick={reset} type="button">Try again</button>
        <Link className="button-secondary" href="/">Return home</Link>
      </div>
    </section>
  );
}
