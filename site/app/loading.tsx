export default function Loading() {
  return (
    <section className="page-section" style={{ textAlign: "center", padding: "8rem 2rem" }}>
      <div className="loading-pulse" aria-label="Loading page content" role="status">
        <div style={{ width: "6rem", height: "0.75rem", background: "var(--line)", borderRadius: "var(--radius-pill)", margin: "0 auto var(--space-4)" }} />
        <div style={{ width: "18rem", height: "1.5rem", background: "var(--line)", borderRadius: "var(--radius-pill)", margin: "0 auto var(--space-4)" }} />
        <div style={{ width: "24rem", height: "0.875rem", background: "var(--line)", borderRadius: "var(--radius-pill)", margin: "0 auto var(--space-8)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "var(--space-6)", maxWidth: "64rem", margin: "0 auto" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ aspectRatio: "4/3", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </div>
    </section>
  );
}
