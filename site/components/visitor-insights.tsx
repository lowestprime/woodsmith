"use client";

import WorldMap, { type ISOCode } from "react-svg-worldmap";

type CountrySummary = {
  countryCode: string;
  total: number;
};

type RecentVisitor = {
  id: string;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  lastPath: string;
  lastSeenAt: string;
  visitCount: number;
};

function formatCountry(code: string | null) {
  if (!code || code === "XX") {
    return "Unknown";
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function VisitorInsights({
  countrySummary,
  recentVisitors
}: {
  countrySummary: CountrySummary[];
  recentVisitors: RecentVisitor[];
}) {
  return (
    <div className="visitor-insights">
      <div className="visitor-map-card">
        {countrySummary.length > 0 ? (
          <WorldMap
            color="#5a3a25"
            data={countrySummary.map((entry) => ({ country: entry.countryCode.toLowerCase() as ISOCode, value: entry.total }))}
            size="responsive"
            title="Recent visitor countries"
            valueSuffix=" visits"
          />
        ) : (
          <p className="muted-copy">Visitor telemetry will appear here after the first recorded session.</p>
        )}
      </div>
      <div className="visitor-list">
        {recentVisitors.map((visitor) => (
          <article className="visitor-list-item" key={visitor.id}>
            <strong>{formatCountry(visitor.countryCode)}</strong>
            <span>{[visitor.city, visitor.region].filter(Boolean).join(", ") || "Location not available"}</span>
            <span>{visitor.lastPath}</span>
            <small>{visitor.visitCount} view{visitor.visitCount === 1 ? "" : "s"} · {formatTimestamp(visitor.lastSeenAt)}</small>
          </article>
        ))}
      </div>
    </div>
  );
}
