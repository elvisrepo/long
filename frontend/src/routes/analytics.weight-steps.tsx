import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { useWeightStepsAnalyticsQuery } from "../features/metrics/use-weight-steps-analytics-query";
import {
  type WeightStepsAnalytics,
  type WeightStepsRange,
} from "../features/metrics/weight-steps-analytics-api";
import { WeightStepsOverlayChart } from "../features/metrics/weight-steps-overlay-chart";

export const Route = createFileRoute("/analytics/weight-steps")({
  beforeLoad: requireAuthBeforeLoad,
  component: WeightStepsRoute,
});

const ranges: WeightStepsRange[] = [7, 30, 90];

function WeightStepsRoute() {
  const [range, setRange] = useState<WeightStepsRange>(30);
  const analyticsQuery = useWeightStepsAnalyticsQuery(range);

  if (analyticsQuery.isLoading) {
    return <WeightStepsLoading />;
  }

  if (analyticsQuery.isError) {
    return (
      <section className="weight-steps-screen">
        <Link
          className="metric-detail-breadcrumb"
          to="/metrics/$slug"
          params={{ slug: "body_weight" }}
        >
          ← Body Weight
        </Link>
        <div className="settings-inline-error" role="alert">
          {analyticsQuery.error instanceof Error
            ? analyticsQuery.error.message
            : "Weight and steps analytics failed to load"}
        </div>
      </section>
    );
  }

  const analytics = analyticsQuery.data;
  if (!analytics) {
    return null;
  }

  return (
    <section className="weight-steps-screen">
      <nav aria-label="Breadcrumb" className="metric-detail-breadcrumb">
        <Link to="/metrics/$slug" params={{ slug: "body_weight" }}>
          body_weight
        </Link>
        <span aria-hidden="true">×</span>
        <Link to="/metrics/$slug" params={{ slug: "steps" }}>
          steps
        </Link>
      </nav>

      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Pro Insights · Comparison</p>
          <h1 className="dashboard-title">Weight × Steps</h1>
          <p className="weight-steps-subtitle">
            Daily latest weight and daily total steps on one timeline.
          </p>
        </div>
        <span className="status-pill">Pro · Analytics</span>
      </div>

      <section
        className="weight-steps-card"
        aria-label="Weight and steps comparison"
      >
        <div className="entries-toolbar">
          <div>
            <p className="meta-label">Last {range} days</p>
            <h2>Compare movement and weight trends</h2>
          </div>
          <div className="range-toggle" aria-label="Overlay range">
            {ranges.map((days) => (
              <button
                aria-pressed={range === days}
                key={days}
                onClick={() => setRange(days)}
                type="button"
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {analytics.series.length === 0 ? (
          <div className="empty-state">
            <h3>No comparison data in this range</h3>
            <p>Sync or log Body Weight and Steps, then return here.</p>
          </div>
        ) : (
          <>
            <WeightStepsOverlayChart series={analytics.series} />
            <WeightStepsSummaryCards analytics={analytics} />
          </>
        )}
      </section>
    </section>
  );
}

function WeightStepsSummaryCards({
  analytics,
}: {
  analytics: WeightStepsAnalytics;
}) {
  const { summary, series } = analytics;
  const pairedDays = series.filter(
    (point) => point.weight_kg !== null && point.steps !== null,
  ).length;

  return (
    <div className="weight-steps-summary">
      <article>
        <p className="meta-label">Weight</p>
        <p className="weight-steps-summary-value">
          {summary.weight_start_kg === null || summary.weight_end_kg === null
            ? "—"
            : `${formatWeight(summary.weight_start_kg)} → ${formatWeight(summary.weight_end_kg)} kg`}
        </p>
      </article>
      <article>
        <p className="meta-label">Average steps</p>
        <p className="weight-steps-summary-value">
          {summary.average_daily_steps === null
            ? "—"
            : `${summary.average_daily_steps.toLocaleString("en-US")} / day`}
        </p>
      </article>
      <article>
        <p className="meta-label">Paired coverage</p>
        <p className="weight-steps-summary-value">
          {pairedDays} {pairedDays === 1 ? "day" : "days"}
        </p>
        <p className="weight-steps-note">
          Trend overlap can show patterns, but it does not establish cause.
        </p>
      </article>
    </div>
  );
}

function WeightStepsLoading() {
  return (
    <section
      aria-label="Loading weight and steps analytics"
      className="weight-steps-screen settings-loading-skeleton"
      role="status"
    >
      <span className="settings-skeleton settings-skeleton-eyebrow" />
      <span className="settings-skeleton settings-skeleton-title" />
      <span className="settings-skeleton settings-skeleton-card" />
    </section>
  );
}

function formatWeight(value: number) {
  return value.toFixed(1);
}
