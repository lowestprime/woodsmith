import { connection } from "next/server";
import { notFound } from "next/navigation";
import { MediaCollection, type MediaCollectionItem } from "@/components/media-collection";
import { PageSection, Shell } from "@/components/site-chrome";

export const dynamic = "force-dynamic";

const VIDEO_FIXTURE = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH4EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggHi7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAxV0GNTGF2ZjYyLjEyLjEwMUSJiEBEAAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYhrY6gUYAUm0pyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDgkLCBQLqBMJqBAlW5gQESVMNnQIBzc6BjwIBnyJpFo4dFTkNPREVSRIeNTGF2ZjYyLjEyLjEwMXNz2mPAi2PFiGtjqBRgBSbSZ8ilRaOHRU5DT0RFUkSHmExhdmM2Mi4yOC4xMDEgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDQwMDAwMDAwAB9DtnWy54EAo62BAACAgkmDQgAD8AL2ADgkHBhKAAAwcAAAfJBD4ODf/+z6D/+wBxzzbjtywAAcU7trkbuPs4EAt4r3gQHxggGr8IED";
const COLORS = ["#d9c6a5", "#f1eadb", "#2a2925", "#8d6e52", "#b69a72", "#efe2c7"];
const RATIOS = [[4, 3], [3, 4], [16, 9], [1, 3], [3, 1], [5, 4]] as const;

function svgFixture(index: number) {
  const [widthRatio, heightRatio] = RATIOS[index % RATIOS.length] ?? RATIOS[0];
  const width = widthRatio * 160;
  const height = heightRatio * 160;
  const label = `Fixture ${index + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${COLORS[index % COLORS.length]}"/><path d="M0 ${height * 0.72} L${width} ${height * 0.35} V${height} H0Z" fill="#11110f" opacity=".22"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#11110f" font-family="sans-serif" font-size="${Math.max(22, Math.min(width, height) / 10)}">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const FIXTURE_ITEMS: MediaCollectionItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: `media-fixture-${index + 1}`,
  src: index === 5 ? VIDEO_FIXTURE : svgFixture(index),
  alt: index === 5 ? "Short silent video media fixture" : `Media fixture ${index + 1}`,
  kind: index === 5 ? "video" : "image",
  caption: `Deterministic ${RATIOS[index % RATIOS.length]?.join(":")} collection fixture`,
  occurredAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
  order: index,
  role: index === 0 ? "hero" : "gallery",
  stage: `Stage ${index + 1}`
}));

const COUNTS = [1, 2, 3, 6, 12] as const;

export default async function MediaCollectionAuditPage() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.VISUAL_AUDIT_SNAPSHOT_LAB !== "true") notFound();

  return (
    <Shell>
      <PageSection>
        <p className="eyebrow">Snapshot lab</p>
        <h1>Media collection verification</h1>
        <p className="lede">Deterministic image, video, orientation, count, and interaction fixtures. This route is unavailable outside the isolated snapshot-lab application.</p>
      </PageSection>
      {COUNTS.map((count) => (
        <PageSection id={`media-fixture-detail-${count}`} key={count}>
          <h2>{count} item detail collection</h2>
          <MediaCollection collectionId={`fixture:detail:${count}`} items={FIXTURE_ITEMS.slice(0, count)} title={`${count} item detail fixture`} variant="detail-stage" />
        </PageSection>
      ))}
      <PageSection id="media-fixture-editorial">
        <h2>Editorial collection</h2>
        <MediaCollection collectionId="fixture:editorial:6" items={FIXTURE_ITEMS.slice(0, 6)} title="Editorial fixture" variant="editorial-grid" />
      </PageSection>
      <PageSection id="media-fixture-process">
        <h2>Process collection</h2>
        <MediaCollection collectionId="fixture:process:6" items={FIXTURE_ITEMS.slice(0, 6)} title="Process fixture" variant="process-sequence" />
      </PageSection>
      <PageSection id="media-fixture-picker">
        <h2>Picker collection</h2>
        <MediaCollection collectionId="fixture:picker:12" items={FIXTURE_ITEMS} title="Picker fixture" variant="picker-grid" />
      </PageSection>
    </Shell>
  );
}
