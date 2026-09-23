// longevity React port — dashboard metric cards with bottom-pinned submit.
// Paste into src/features/metrics/DashboardMetricCard.tsx, then use it inside
// the metric-grid in src/routes/index.tsx in place of the current <article>.
// Keeps your MetricEntryForm + formatters; only layout changes.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { formatMetricValue } from "./metric-entry-formatters";

interface DashboardMetricCardProps {
  slug: string;
  name: string;
  category: string;
  unit: string;
  latestValue: number | undefined;
  spark: number[];
  form: ReactNode;
  featured?: boolean;
}

export function DashboardMetricCard({
  slug,
  name,
  category,
  unit,
  latestValue,
  spark,
  form,
  featured = false,
}: DashboardMetricCardProps) {
  return (
    <article className={`metric-card${featured ? " hero-card" : ""}`}>
      <div>
        <p className="chip-label">
          {category} · {unit}
        </p>
        <h2>
          <Link params={{ slug }} to="/metrics/$slug">
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

      <Sparkline values={spark} />

      {form}
    </article>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 200},${44 - ((v - min) / span) * 32}`,
    )
    .join(" L");
  return (
    <svg
      aria-hidden="true"
      className="mini-trend"
      preserveAspectRatio="none"
      viewBox="0 0 200 44"
    >
      <path d={`M${pts} L200 44 L0 44 Z`} fill="var(--chart-fill)" />
      <path
        d={`M${pts}`}
        fill="none"
        stroke="var(--chart-line)"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

/* Add to src/index.css (pairs with handoff/tokens-addition.css):

.metric-card { display: flex; flex-direction: column; }
.metric-card .metric-form { display: flex; flex-direction: column; flex: 1; }
.metric-card .metric-form > button:last-child { margin-top: auto; }
.mini-trend { height: 44px; width: 100%; }
*/
