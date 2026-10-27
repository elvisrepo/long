import { PageHeader } from "../components/page-header";
import { Link, createFileRoute } from "@tanstack/react-router";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import type { ConsistencyMetric } from "../features/metrics/consistency-analytics-api";
import { formatMetricEntryRecordedAt } from "../features/metrics/metric-entry-formatters";
import { useConsistencyAnalyticsQuery } from "../features/metrics/use-consistency-analytics-query";

export const Route = createFileRoute("/analytics/consistency")({
  beforeLoad: requireAuthBeforeLoad,
  component: ConsistencyAnalyticsRoute,
});

function ConsistencyAnalyticsRoute() {
  const analyticsQuery = useConsistencyAnalyticsQuery();

  if (analyticsQuery.isLoading) {
    return <ConsistencyLoading />;
  }

  if (analyticsQuery.isError) {
    return (
      <section className="consistency-screen">
        <Link className="metric-detail-breadcrumb" to="/">
          ← Dashboard
        </Link>
        <div className="settings-inline-error" role="alert">
          {analyticsQuery.error instanceof Error
            ? analyticsQuery.error.message
            : "Consistency analytics failed to load"}
        </div>
      </section>
    );
  }

  const analytics = analyticsQuery.data;
  if (!analytics) {
    return null;
  }
  const mostConsistent = findMostConsistentMetric(analytics.metrics);
  const attentionItems = getAttentionItems(analytics.metrics, analytics.dates);

  return (
    <section className="consistency-screen">
      <PageHeader
        title="Consistency & Coverage"
        eyebrow="Metrics · Last 7 days"
        breadcrumb={
          <nav aria-label="Breadcrumb" className="metric-detail-breadcrumb">
            <Link to="/">← Dashboard</Link>
          </nav>
        }
        description={
          <p className="weight-steps-subtitle">
            {formatDateRange(analytics.dates)} · UTC
          </p>
        }
      />

      <section
        aria-label="Seven-day consistency and coverage"
        className="consistency-card"
      >
        {analytics.metrics.length === 0 ? (
          <div className="empty-state">
            <h2>No active metrics</h2>
            <p>Create or activate a metric, then log or sync an entry.</p>
            <Link to="/metrics">Browse metrics →</Link>
          </div>
        ) : (
          <>
            <div className="consistency-summary">
              <article>
                <p className="meta-label">Metrics with data</p>
                <p className="consistency-summary-value">
                  {analytics.summary.metrics_with_data} of{" "}
                  {analytics.summary.total_metrics} metrics
                </p>
              </article>
              <article>
                <p className="meta-label">Days with any data</p>
                <p className="consistency-summary-value">
                  {analytics.summary.days_with_any_data} of{" "}
                  {analytics.range_days} days
                </p>
              </article>
              <article>
                <p className="meta-label">Most tracked</p>
                <p className="consistency-summary-value">
                  {mostConsistent
                    ? `${mostConsistent.name} · ${mostConsistent.tracked_days}/${analytics.range_days}`
                    : "No recent data"}
                </p>
              </article>
            </div>

            <div className="consistency-legend" aria-label="Day key">
              <span>✓ Tracked</span>
              <span>– No entry</span>
              <span>Select a day to view entries.</span>
            </div>
            <div
              aria-label="Per-metric consistency"
              className="consistency-metrics"
            >
              {analytics.metrics.map((metric) => (
                <ConsistencyMetricRow
                  dates={analytics.dates}
                  key={metric.metric_definition_id}
                  metric={metric}
                  rangeDays={analytics.range_days}
                />
              ))}
            </div>
            {attentionItems.length > 0 ? (
              <section
                aria-label="Recent gaps"
                className="consistency-attention"
              >
                <div>
                  <h2>Recent gaps</h2>
                </div>
                <div className="consistency-attention-list">
                  {attentionItems.map(({ message, metric }) => (
                    <article key={metric.metric_definition_id}>
                      <p>
                        <Link
                          className="consistency-open-link"
                          params={{ slug: metric.slug }}
                          to="/metrics/$slug"
                        >
                          {metric.name}
                        </Link>
                      </p>
                      <p>{message}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            <details className="consistency-note">
              <summary>How this works</summary>
              <p>
                Presence means at least one entry ended on that UTC date.
                Multiple entries still count as one tracked day. This view does
                not judge how often a health metric should be measured. Streaks
                cover only this seven-day window.
              </p>
            </details>
          </>
        )}
      </section>
    </section>
  );
}

function ConsistencyMetricRow({
  dates,
  metric,
  rangeDays,
}: {
  dates: string[];
  metric: ConsistencyMetric;
  rangeDays: number;
}) {
  return (
    <article className="consistency-metric-row">
      <div className="consistency-metric-copy">
        <h2>{metric.name}</h2>
        <p>
          {metric.tracked_days} of {rangeDays} tracked days
          {metric.current_window_streak_days > 0
            ? ` · ${metric.current_window_streak_days}-day streak`
            : ""}
        </p>
        <p>
          {metric.last_recorded_at
            ? `Latest ${formatMetricEntryRecordedAt(metric.last_recorded_at)} UTC`
            : "No entries yet"}
        </p>
      </div>
      <div className="consistency-days">
        {dates.map((date, index) => {
          const isPresent = metric.day_presence[index] ?? false;
          return (
            <Link
              aria-label={`${metric.name} on ${date}: ${isPresent ? "tracked" : "no entry"}`}
              className={`consistency-day ${isPresent ? "is-present" : "is-missing"}`}
              key={date}
              params={{ slug: metric.slug }}
              search={{ date }}
              title={date}
              to="/metrics/$slug"
            >
              <span>{formatWeekday(date)}</span>
              <span className="consistency-day-number">
                {Number(date.slice(-2))}
              </span>
              <span aria-hidden="true">{isPresent ? "✓" : "–"}</span>
            </Link>
          );
        })}
      </div>
      <Link
        aria-label={`Open ${metric.name}`}
        className="consistency-open-link"
        params={{ slug: metric.slug }}
        to="/metrics/$slug"
      >
        Open →
      </Link>
    </article>
  );
}

function findMostConsistentMetric(
  metrics: ConsistencyMetric[],
): ConsistencyMetric | null {
  return metrics.reduce<ConsistencyMetric | null>((best, metric) => {
    if (metric.tracked_days === 0) {
      return best;
    }
    return best === null || metric.tracked_days > best.tracked_days
      ? metric
      : best;
  }, null);
}

interface AttentionItem {
  metric: ConsistencyMetric;
  message: string;
}

function getAttentionItems(
  metrics: ConsistencyMetric[],
  dates: string[],
): AttentionItem[] {
  const currentDate = dates.at(-1);
  if (!currentDate) {
    return [];
  }

  return metrics.flatMap((metric) => {
    const isDailyMetric = ["steps", "sleep_duration"].includes(metric.slug);
    if (!metric.last_recorded_at) {
      return isDailyMetric ? [{ metric, message: "No entries yet." }] : [];
    }

    const daysSinceLatest = utcCalendarDayDifference(
      metric.last_recorded_at.slice(0, 10),
      currentDate,
    );
    if (daysSinceLatest < (isDailyMetric ? 2 : 7)) {
      return [];
    }

    return [
      {
        metric,
        message: `Last entry ${daysSinceLatest} day${daysSinceLatest === 1 ? "" : "s"} ago.`,
      },
    ];
  });
}

function utcCalendarDayDifference(earlier: string, later: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
        millisecondsPerDay,
    ),
  );
}

const utcWeekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDateRange(dates: string[]): string {
  const first = dates.at(0);
  const last = dates.at(-1);
  if (!first || !last) return "Last 7 days";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`));
}

function formatWeekday(date: string): string {
  const weekday = utcWeekdayLabels[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return weekday ?? "";
}

function ConsistencyLoading() {
  return (
    <section
      aria-label="Loading consistency analytics"
      className="consistency-screen settings-loading-skeleton"
      role="status"
    >
      <span className="settings-skeleton settings-skeleton-eyebrow" />
      <span className="settings-skeleton settings-skeleton-title" />
      <span className="settings-skeleton settings-skeleton-card" />
    </section>
  );
}
