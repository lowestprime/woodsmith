"use client";

import {
  useCallback,
  useState,
  useTransition
} from "react";
import { flushStudioNavigationQueues } from "@/components/studio/studio-navigation-state";
import { useRouter } from "next/navigation";
import WorldMap, {
  type ISOCode
} from "react-svg-worldmap";

import {
  loadVisitorInsightsAction,
  purgeVisitorAnalyticsAction,
  saveVisitorAnalyticsPolicyAutosaveAction,
  type VisitorAnalyticsPolicyAutosavePatch
} from "@/lib/actions";
import type {
  VisitorAnalyticsPolicyRecord,
  VisitorInsightsSnapshot
} from "@/lib/db";
import {
  ConfirmDestructiveAction
} from "@/components/studio/confirm-destructive-action";
import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";
import type {
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";
import {
  VISITOR_MAP_SIZE, VISITOR_MAP_VIEWBOX,
  VISITOR_TREND_WIDTH, VISITOR_TREND_HEIGHT,
  visitorTrendGeometry, visitorWorkspaceHref
} from "@/lib/visitor-charts";
import { formatDateTime } from "@/lib/format";

export type VisitorIdentityStatus = {
  configured: boolean;
  keyId: string | null;
  source:
    | "visitor-secret"
    | "session-secret"
    | "missing";
  continuity: string;
};

function countryName(code: string | null) {
  if (!code || code === "ZZ") return "Unknown / unresolved";
  try {
    return new Intl.DisplayNames(
      ["en"],
      { type: "region" }
    ).of(code) ?? code;
  } catch {
    return code;
  }
}

function changeLabel(
  current: number,
  previous: number
) {
  if (previous === 0) {
    return current === 0
      ? "No change"
      : "New in this period";
  }
  const percent = Math.round(
    ((current - previous) / previous) * 100
  );
  return `${percent >= 0 ? "+" : ""}${percent}% from prior period`;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric", timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

// react-svg-worldmap draws in pixel coordinates without a viewBox.
// A fixed intrinsic size plus this local adapter lets CSS scale the complete
// geometry, without viewport-dependent sizes or a library fork.
function prepareMap(node: HTMLDivElement | null) {
  const svg = node?.querySelector("svg");
  svg?.setAttribute("viewBox", VISITOR_MAP_VIEWBOX);
  svg?.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (svg && node) node.dataset.ready = "true";
}

function TrendChart({ trend }: { trend: VisitorInsightsSnapshot["trend"] }) {
  const { points, total } = visitorTrendGeometry(trend.map((day) => day.pageviews));
  const peak = Math.max(0, ...trend.map((day) => day.pageviews));
  return (
    <figure className="visitor-trend-card">
      <figcaption>
        <strong>Daily pageviews</strong>
        <span>{total} in selected period</span>
      </figcaption>
      <p className="muted-copy">UTC dates · first and last days may be partial</p>
      <div className="visitor-chart-scale" aria-hidden="true">
        <span>Peak {peak}</span><span>Baseline 0</span>
      </div>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${VISITOR_TREND_WIDTH} ${VISITOR_TREND_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <line className="visitor-chart-baseline" x1="12" x2="628" y1="228" y2="228" />
        <polyline className="visitor-chart-line" fill="none"
          points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
        {points.map(({ x, y }, index) => (
          <circle className="visitor-chart-point" cx={x} cy={y} r="3" key={trend[index].date} />
        ))}
      </svg>
      <div className="visitor-chart-axis" aria-hidden="true">
        <span>{trend[0] ? shortDate(trend[0].date) : ""}</span>
        <span>{trend.at(-1) ? shortDate(trend.at(-1)!.date) : ""}</span>
      </div>
      {total === 0 ? <p className="muted-copy">No pageviews recorded in this period.</p> : null}
      <details className="visitor-data-details">
        <summary>Daily values ({trend.length} UTC dates)</summary>
        <table className="visitor-data-table">
          <caption>Daily activity in the selected rolling window. Peak: {peak} pageviews.</caption>
          <thead><tr><th scope="col">UTC date</th><th scope="col">Visitors</th><th scope="col">Sessions</th><th scope="col">Pageviews</th></tr></thead>
          <tbody>{trend.map((day) => (
            <tr key={day.date}>
              <th scope="row"><time dateTime={day.date}>{shortDate(day.date)}<small>{day.date.slice(0, 4)}</small></time></th>
              <td>{day.uniqueVisitors}</td><td>{day.sessions}</td><td>{day.pageviews}</td>
            </tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}

function VisitorPolicyEditor({
  policy,
  onSaved,
  onBusyChange
}: {
  policy: VisitorAnalyticsPolicyRecord;
  onBusyChange: (busy: boolean) => void;
  onSaved: (
    policy: VisitorAnalyticsPolicyRecord
  ) => void;
}) {
  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);
      return {
        enabled: data.get("enabled") === "1",
        retentionDays: Number.parseInt(
          String(data.get("retentionDays") ?? ""),
          10
        ),
        storeCity:
          data.get("storeCity") === "1",
        storeReferrer:
          data.get("storeReferrer") === "1"
      };
    },
    []
  );
  const mutate = useCallback(
    (
      request: StudioMutationRequest<
        VisitorAnalyticsPolicyAutosavePatch
      >
    ) =>
      saveVisitorAnalyticsPolicyAutosaveAction({
        patch: request.payload,
        operationId: request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );
  const onStatus = useCallback(
    (
      snapshot: StudioMutationSnapshot<
        VisitorAnalyticsPolicyRecord
      >
    ) => {
      onBusyChange(snapshot.hasUnsavedChanges);
      if (
        snapshot.phase === "saved" &&
        !snapshot.hasUnsavedChanges &&
        snapshot.currentEntity
      ) {
        onSaved(snapshot.currentEntity);
      }
    },
    [onSaved, onBusyChange]
  );

  return (
    <StudioAutosaveForm
      className="request-form compact-form"
      createPayload={createPayload}
      entityKey="visitor-analytics-policy:default"
      expectedUpdatedAt={policy.updatedAt}
      mutate={mutate}
      onStatus={onStatus}
    >
      <div className="studio-editor-head">
        <div>
          <p className="eyebrow">Privacy and retention</p>
          <h3>Visitor data policy</h3>
        </div>
        <label className="compact-switch">
          <input
            defaultChecked={policy.enabled}
            name="enabled"
            type="checkbox"
            value="1"
          />
          <span>Collect</span>
        </label>
      </div>
      <label>
        <span>Retention days</span>
        <input
          defaultValue={policy.retentionDays}
          max="730"
          min="1"
          name="retentionDays"
          type="number"
        />
      </label>
      <div className="visitor-policy-toggles">
        <label className="compact-switch">
          <input
            defaultChecked={policy.storeCity}
            name="storeCity"
            type="checkbox"
            value="1"
          />
          <span>City</span>
        </label>
        <label className="compact-switch">
          <input
            defaultChecked={policy.storeReferrer}
            name="storeReferrer"
            type="checkbox"
            value="1"
          />
          <span>Referrer host</span>
        </label>
      </div>
      <p className="muted-copy">
        Raw IP addresses, full user agents, precise coordinates, URL queries, and full referrer URLs are not retained.
      </p>
      <button
        className="button-secondary"
        onPointerDown={(event) => {
          // Keep the active field focused so blur-autosave and
          // explicit submit cannot enqueue the same draft twice.
          event.preventDefault();
        }}
        type="submit"
      >
        Save privacy policy
      </button>
    </StudioAutosaveForm>
  );
}

export function StudioVisitorInsights({
  initialInsights,
  initialPolicy,
  identityStatus
}: {
  initialInsights: VisitorInsightsSnapshot;
  initialPolicy: VisitorAnalyticsPolicyRecord;
  identityStatus: VisitorIdentityStatus;
}) {
  const router = useRouter();
  const [insights, setInsights] =
    useState(initialInsights);
  const [policy, setPolicy] =
    useState(initialPolicy);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  function load(rangeDays: number, page: number) {
    startTransition(async () => {
      try {
        await flushStudioNavigationQueues();
        router.push(visitorWorkspaceHref(rangeDays, page), { scroll: false });
      } catch {
        setMessage("Finish saving or resolve the privacy edit before changing the range or page.");
      }
    });
  }

  function purge() {
    startTransition(async () => {
      try {
        await flushStudioNavigationQueues();
        const result = await purgeVisitorAnalyticsAction();
        setMessage(result.message);
        if (!result.ok) return;
        const refreshed = await loadVisitorInsightsAction({
          rangeDays: insights.rangeDays,
          page: insights.page,
          pageSize: insights.pageSize
        });
        if (!refreshed.ok) {
          setMessage(refreshed.message);
          return;
        }
        const lastPage = Math.max(1, Math.ceil(refreshed.data.totalSessions / insights.pageSize));
        if (insights.page > lastPage) {
          router.replace(visitorWorkspaceHref(insights.rangeDays, lastPage), { scroll: false });
        } else {
          setInsights(refreshed.data);
        }
      } catch {
        setMessage("Could not refresh visitor data. Check your connection and reload before retrying.");
      }
    });
  }

  const totalPages = Math.max(
    1,
    Math.ceil(
      insights.totalSessions /
        insights.pageSize
    )
  );

  return (
    <div
      className="visitor-admin-workspace"
      data-audit-id="studio-visitor-insights"
      aria-label="Visitor analytics"
      role="region"
      aria-busy={pending}
    >
      <div className="visitor-range-toolbar">
        <div
          aria-label="Visitor insight range"
          className="segmented-control"
          role="group"
        >
          {[7, 30, 90].map((days) => (
            <button
              aria-pressed={
                insights.rangeDays === days
              }
              className={
                insights.rangeDays === days
                  ? "is-active"
                  : ""
              }
              disabled={pending}
              key={days}
              onClick={() => load(days, 1)}
              type="button"
            >
              {days} days
            </button>
          ))}
        </div>
        <p className="visitor-load-status" role="status">{pending ? "Loading visitor activity…" : message}</p>
      </div>

      <div className="studio-grid visitor-summary-grid">
        <article className="studio-panel">
          <strong>{insights.summary.uniqueVisitors}</strong>
          <span>Unique visitors</span>
          <small>{changeLabel(insights.summary.uniqueVisitors, insights.summary.previousUniqueVisitors)}</small>
        </article>
        <article className="studio-panel">
          <strong>{insights.summary.sessions}</strong>
          <span>Sessions</span>
          <small>{changeLabel(insights.summary.sessions, insights.summary.previousSessions)}</small>
        </article>
        <article className="studio-panel">
          <strong>{insights.summary.pageviews}</strong>
          <span>Pageviews</span>
          <small>{changeLabel(insights.summary.pageviews, insights.summary.previousPageviews)}</small>
        </article>
      </div>

      <div className="visitor-visual-grid">
        <article className="studio-panel visitor-map-card">
          <div className="studio-editor-head">
            <div>
              <p className="eyebrow">Geography</p>
              <h3>Unique visitors by country</h3>
            </div>
          </div>
          {insights.countries.length > 0 ? (
            <>
              <div className="visitor-map-geometry" aria-hidden="true" inert ref={prepareMap}>
                <WorldMap
                  backgroundColor="transparent"
                  borderColor="var(--muted)"
                  color="var(--accent)"
                  data={insights.countries.map((item) => ({
                    country: item.countryCode.toLowerCase() as ISOCode,
                    value: item.uniqueVisitors
                  }))}
                  size={VISITOR_MAP_SIZE}
                  strokeOpacity={1}
                  tooltipTextFunction={() => ""}
                />
              </div>
              <p className="muted-copy">Shading compares unique visitors per country. Country totals can overlap; some countries or territories have no shape on this map.</p>
              <details className="visitor-data-details">
                <summary>Country totals ({insights.countries.length})</summary>
                <table className="visitor-data-table">
                  <caption>Unique visitors by reported country or region, from the same aggregates as the map.</caption>
                  <thead><tr><th scope="col">Country / region</th><th scope="col">Unique visitors</th></tr></thead>
                  <tbody>{insights.countries.map((item) => (
                    <tr key={item.countryCode}><th scope="row">{countryName(item.countryCode)}</th><td>{item.uniqueVisitors}</td></tr>
                  ))}</tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="muted-copy">No country-level records are available for this period.</p>
          )}
          <p className="muted-copy">Missing geography is not mapped. Unresolved country codes are not assigned a location.</p>
        </article>
        <TrendChart trend={insights.trend} />
      </div>

      <div className="studio-delivery-workspace visitor-session-workspace">
        <article className="studio-panel visitor-session-list">
          <div className="studio-editor-head">
            <div>
              <p className="eyebrow">Sessions</p>
              <h3>Recent visits</h3>
            </div>
            <span>{insights.totalSessions}</span>
          </div>
          <div className="compact-event-list">
            {insights.sessions.map((session) => (
              <article
                className="visitor-session-item"
                key={session.id}
              >
                <div>
                  <strong>{countryName(session.countryCode)}</strong>
                  <span>
                    {[session.city, session.region]
                      .filter(Boolean)
                      .join(", ") || "Location unavailable"}
                  </span>
                </div>
                <span>{session.lastPath}</span>
                {session.referrerHost ? <span className="visitor-session-referrer">Referrer host: {session.referrerHost}</span> : null}
                <small>
                  {session.pageviewCount} pageview{session.pageviewCount === 1 ? "" : "s"} · {session.deviceClass} · {formatDateTime(session.lastSeenAt)}
                </small>
              </article>
            ))}
            {insights.sessions.length === 0 ? (
              <p className="muted-copy">
                No visitor sessions are available for this period.
              </p>
            ) : null}
          </div>
          <div className="pagination-controls">
            <button
              className="button-secondary"
              disabled={pending || insights.page <= 1}
              onClick={() => load(insights.rangeDays, insights.page - 1)}
              type="button"
            >
              Previous
            </button>
            <span>Page {insights.page} of {totalPages}</span>
            <button
              className="button-secondary"
              disabled={pending || insights.page >= totalPages}
              onClick={() => load(insights.rangeDays, insights.page + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </article>

        <div className="visitor-policy-stack">
          <article className="studio-panel">
            <p className="eyebrow">Pseudonym key</p>
            <h3>
              {identityStatus.configured
                ? identityStatus.keyId
                : "Configuration needed"}
            </h3>
            <p className="muted-copy">
              {identityStatus.configured
                ? `Source: ${identityStatus.source === "visitor-secret" ? "dedicated visitor secret" : "session secret fallback"}.`
                : "Set a 32-character VISITOR_HMAC_SECRET before collecting visitor analytics."}
            </p>
            <p className="muted-copy">
              {identityStatus.continuity}
            </p>
            {insights.cohorts.length > 0 ? (
              <details>
                <summary>Stored key cohorts</summary>
                <ol className="compact-event-list">
                  {insights.cohorts.map((cohort) => (
                    <li key={cohort.keyId}>
                      <strong>{cohort.keyId}</strong>
                      <span>
                        {cohort.uniqueVisitors} visitor{cohort.uniqueVisitors === 1 ? "" : "s"} · {formatDateTime(cohort.firstSeenAt)} to {formatDateTime(cohort.lastSeenAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </article>
          <article className="studio-panel">
            <VisitorPolicyEditor
              onSaved={setPolicy}
              onBusyChange={setPolicyBusy}
              policy={policy}
            />
            <div className="notification-retention-action">
              <ConfirmDestructiveAction
                disabled={pending || policyBusy}
                confirmLabel="Apply retention"
                description={`Delete pageviews and sessions older than ${policy.retentionDays} days? This cannot be undone.`}
                onConfirm={purge}
                title="Purge expired visitor data?"
                triggerLabel="Purge expired"
              />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
