import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { formatMetricValue } from "./metric-entry-formatters";

interface DashboardMetricCardProps {
  category: string;
  form: ReactNode;
  isFeatured?: boolean;
  latestValue: number | undefined;
  name: string;
  slug: string;
  trendValues: number[];
  unit: string;
}

export function DashboardMetricCard({
  category,
  form,
  isFeatured = false,
  latestValue,
  name,
  slug,
  trendValues,
  unit,
}: DashboardMetricCardProps) {
  return (
    <article
      className={`metric-card${isFeatured ? " metric-card-featured" : ""}`}
    >
      <div className="metric-card-header">
        <p className="chip-label">
          {category} · {unit}
        </p>
        <h2>
          <Link
            className="metric-card-link"
            params={{ slug }}
            to="/metrics/$slug"
          >
            {name} →
          </Link>
        </h2>
        <p className="metric-meta">{slug}</p>
      </div>

      <div className="metric-current-value">
        <span>
          {latestValue === undefined
            ? "—"
            : formatMetricValue(latestValue, slug)}
        </span>
        {slug === "sleep_duration" ? null : <small>{unit}</small>}
      </div>

      <MetricSparkline metricName={name} values={trendValues} />

      {form}
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
