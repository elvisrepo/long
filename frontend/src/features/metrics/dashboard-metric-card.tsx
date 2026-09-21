import { Link } from "@tanstack/react-router";
import type { MetricEntry } from "./metric-entries-api";
import {
  formatMetricValue,
  formatMetricEntrySource,
  formatMetricEntryRecordedAt,
} from "./metric-entry-formatters";

interface DashboardMetricCardProps {
  latestEntry: MetricEntry | undefined;
  name: string;
  slug: string;
  trendValues: number[];
  unit: string;
  onAddEntry: () => void;
}

export function DashboardMetricCard({
  latestEntry,
  name,
  slug,
  trendValues,
  unit,
  onAddEntry,
}: DashboardMetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-header">
        <h2>
          <Link
            className="metric-card-link"
            params={{ slug }}
            to="/metrics/$slug"
          >
            {name} <span aria-hidden="true">↗</span>
          </Link>
        </h2>
        <p className="metric-meta">
          {latestEntry ? "Latest reading" : "No readings yet"}
        </p>
      </div>
      <div className="metric-current-value">
        <span>
          {latestEntry ? formatMetricValue(latestEntry.value, slug) : "—"}
        </span>
        {slug === "sleep_duration" ? null : <small>{unit}</small>}
      </div>
      <div className="metric-card-trend">
        <MetricSparkline metricName={name} values={trendValues} />
        <p className="metric-meta">
          {trendValues.length >= 2
            ? "Recent readings"
            : "Add readings to see your trend"}
        </p>
      </div>
      {latestEntry ? (
        <p className="metric-card-source">
          {formatMetricEntrySource(latestEntry.source)} · Recorded{" "}
          <time dateTime={latestEntry.recorded_at}>
            {formatMetricEntryRecordedAt(latestEntry.recorded_at)} UTC
          </time>
        </p>
      ) : null}
      <button
        className="metric-card-add"
        type="button"
        aria-label={`Add ${name} entry`}
        onClick={onAddEntry}
      >
        + Add entry
      </button>
    </article>
  );
}

function MetricSparkline({
  metricName,
  values,
}: {
  metricName: string;
  values: number[];
}) {
  if (values.length < 2) {
    return null;
  }

  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const span = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 200;
      const y = 38 - ((value - minimum) / span) * 30;

      return `${x},${y}`;
    })
    .join(" L");

  return (
    <svg
      aria-label={`${metricName} recent trend`}
      className="metric-sparkline"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 200 44"
    >
      <path
        className="metric-sparkline-fill"
        d={`M${points} L200 44 L0 44 Z`}
      />
      <path className="metric-sparkline-line" d={`M${points}`} />
    </svg>
  );
}
