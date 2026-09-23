// longevity React port — Pro weight × steps overlay
// Drop in as src/features/metrics/OverlayWeightSteps.tsx, render only when
// currentSubscription.plan.analytics_enabled === true (free keeps MetricTrendChart).

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { useEffect, useMemo, useRef } from "react";
import { useMetricEntriesQuery } from "./use-metric-entries-query";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  BarElement,
  Tooltip,
  Legend,
);

const OVERLAY_LIMIT = 200;

export function useOverlayWeightSteps(rangeDays: number | null) {
  const from =
    rangeDays === null ? undefined : getRangeStartIso(rangeDays);
  const weight = useMetricEntriesQuery({
    metric: "body_weight",
    limit: OVERLAY_LIMIT,
    ...(from ? { from } : {}),
  });
  const steps = useMetricEntriesQuery({
    metric: "steps",
    limit: OVERLAY_LIMIT,
    ...(from ? { from } : {}),
  });

  const days = useMemo(() => {
    const byDay = new Map<
      string,
      { weight?: number; steps: number; label: string }
    >();
    for (const e of weight.data ?? []) {
      const key = getLocalDateKey(e.recorded_at);
      const slot = byDay.get(key) ?? { steps: 0, label: formatDay(e.recorded_at) };
      // entries are newest-first: first write wins = daily latest
      if (slot.weight === undefined) slot.weight = e.value;
      slot.label = formatDay(e.recorded_at);
      byDay.set(key, slot);
    }
    for (const e of steps.data ?? []) {
      const key = getLocalDateKey(e.recorded_at);
      const slot = byDay.get(key) ?? { steps: 0, label: formatDay(e.recorded_at) };
      slot.steps += e.value; // steps accumulate; weight takes latest
      slot.label = formatDay(e.recorded_at);
      byDay.set(key, slot);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({ key, ...v }));
  }, [weight.data, steps.data]);

  return {
    days,
    isLoading: weight.isLoading || steps.isLoading,
    isError: weight.isError || steps.isError,
  };
}

export function OverlayWeightStepsChart({
  rangeDays,
}: {
  rangeDays: number | null;
}) {
  const { days, isLoading, isError } = useOverlayWeightSteps(rangeDays);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (days.length === 0 || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ChartJS.getChart(canvasRef.current)?.destroy();
    const chart = new ChartJS(ctx, {
      type: "bar",
      data: {
        labels: days.map((d) => d.label),
        datasets: [
          {
            type: "bar",
            label: "Steps total",
            data: days.map((d) => d.steps),
            backgroundColor: "rgba(59, 130, 246, 0.55)",
            yAxisID: "steps",
          },
          {
            type: "line",
            label: "Weight (daily latest)",
            data: days.map((d) => d.weight ?? null),
            borderColor: "#00e5a0",
            backgroundColor: "rgba(0, 229, 160, 0.16)",
            borderWidth: 3,
            pointRadius: 3,
            tension: 0.35,
            fill: true,
            yAxisID: "weight",
            spanGaps: true,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          weight: { type: "linear", position: "left" },
          steps: { type: "linear", position: "right", grid: { display: false } },
        },
      },
    });
    return () => chart.destroy();
  }, [days]);

  if (isLoading) return <p>Loading overlay…</p>;
  if (isError) return <p>Overlay failed to load.</p>;
  if (days.length === 0) return <p>No chart data yet.</p>;
  return (
    <div style={{ height: 280 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function getRangeStartIso(days: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

function getLocalDateKey(iso: string) {
  const d = new Date(iso);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
