"use client";

import {
  useCallback,
  useState,
  useTransition
} from "react";
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
  if (!code) return "Unknown";
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

function TrendChart({
  trend
}: {
  trend: VisitorInsightsSnapshot["trend"];
}) {
  const width = 720;
  const height = 170;
  const inset = 14;
  const maximum = Math.max(
    1,
    ...trend.map((item) => item.pageviews)
  );
  const points = trend.map((item, index) => {
    const x = trend.length <= 1
      ? width / 2
      : inset +
        (index / (trend.length - 1)) *
          (width - inset * 2);
    const y = height - inset -
      (item.pageviews / maximum) *
        (height - inset * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const total = trend.reduce(
    (sum, item) => sum + item.pageviews,
    0
  );

  return (
    <figure className="visitor-trend-card">
      <figcaption>
        <strong>Pageview trend</strong>
        <span>{total} in selected period</span>
      </figcaption>
      <svg
        aria-label={`Daily pageview trend with ${total} total pageviews.`}
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          className="visitor-chart-baseline"
          x1={inset}
          x2={width - inset}
          y1={height - inset}
          y2={height - inset}
        />
        <polyline
          className="visitor-chart-line"
          fill="none"
          points={points}
        />
      </svg>
      <div className="visitor-chart-axis" aria-hidden="true">
        <span>{trend[0]?.date ?? ""}</span>
        <span>{trend.at(-1)?.date ?? ""}</span>
      </div>
    </figure>
  );
}

function VisitorPolicyEditor({
  policy,
  onSaved
}: {
  policy: VisitorAnalyticsPolicyRecord;
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
      if (
        snapshot.phase === "saved" &&
        !snapshot.hasUnsavedChanges &&
        snapshot.currentEntity
      ) {
        onSaved(snapshot.currentEntity);
      }
    },
    [onSaved]
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
  const [insights, setInsights] =
    useState(initialInsights);
  const [policy, setPolicy] =
    useState(initialPolicy);
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  const load = useCallback((
    rangeDays: number,
    page: number
  ) => {
    startTransition(async () => {
      const result = await loadVisitorInsightsAction({
        rangeDays,
        page,
        pageSize: insights.pageSize
      });
      setMessage(result.message);
      if (result.ok) {
        setInsights(result.data);
      }
    });
  }, [insights.pageSize]);

  function purge() {
    startTransition(async () => {
      const result =
        await purgeVisitorAnalyticsAction();
      setMessage(result.message);
      if (result.ok) {
        const refreshed =
          await loadVisitorInsightsAction({
            rangeDays: insights.rangeDays,
            page: 1,
            pageSize: insights.pageSize
          });
        if (refreshed.ok) {
          setInsights(refreshed.data);
        }
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
    <div className="visitor-admin-workspace">
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
        {message ? (
          <p className="muted-copy" role="status">
            {message}
          </p>
        ) : null}
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
            <WorldMap
              backgroundColor="transparent"
              borderColor="#8a735e"
              color="#9a6a3d"
              data={insights.countries.map((item) => ({
                country: item.countryCode.toLowerCase() as ISOCode,
                value: item.uniqueVisitors
              }))}
              size="responsive"
              strokeOpacity={0.42}
              title="Unique visitors by country"
              valueSuffix=" visitors"
            />
          ) : (
            <p className="muted-copy">
              No country-level records are available for this period.
            </p>
          )}
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
              policy={policy}
            />
            <div className="notification-retention-action">
              <ConfirmDestructiveAction
                disabled={pending}
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
