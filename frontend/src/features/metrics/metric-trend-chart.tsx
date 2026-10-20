import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  Legend,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { useEffect, useMemo, useRef } from "react";

import {
  formatChartAxisTick,
  formatMetricValue,
  formatMetricValueWithUnit,
} from "./metric-entry-formatters";
import type { MetricEntry } from "./metric-entries-api";
import { getChartPalette } from "./chart-palette";
import { useTheme } from "../../theme";

// Chart.js is modular: every controller, scale, element, and plugin used by
// this component must be registered before creating a chart instance.
ChartJS.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
  Filler,
);

interface MetricTrendChartProps {
  entries: MetricEntry[];
  metricName: string;
  metricSlug: string;
  unit: string;
  calendarDates?: string[];
}

export function MetricTrendChart({
  entries,
  metricName,
  metricSlug,
  unit,
  calendarDates,
}: MetricTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useTheme();
  const isDistance = metricSlug === "distance";
  // The chart is a daily trend, not a raw event plot. Entry History still shows
  // every manual or synced record, but the chart uses the latest value per day.
  const chartEntries = useMemo(() => getLatestEntriesByDay(entries), [entries]);
  const values = useMemo(
    () => chartEntries.map((entry) => entry.value),
    [chartEntries],
  );
  const chartSummary =
    values.length > 0
      ? `${formatMetricValue(Math.min(...values), metricSlug)} to ${formatMetricValueWithUnit(Math.max(...values), metricSlug, unit)}`
      : undefined;

  useEffect(() => {
    if (chartEntries.length === 0 || !canvasRef.current) {
      return;
    }

    let context: CanvasRenderingContext2D | null = null;

    try {
      context = canvasRef.current.getContext("2d");
    } catch {
      // jsdom does not provide a real canvas context; the accessible fallback
      // still lets tests verify the chart contract without browser graphics.
      return;
    }

    if (!context) {
      return;
    }

    // React dev rendering and route reloads can reuse the same canvas. Chart.js
    // refuses to create a second chart on a canvas until the old one is gone.
    ChartJS.getChart(canvasRef.current)?.destroy();
    const colors = getChartPalette();

    const dailyValues = new Map(
      chartEntries.map((entry) => [getMetricEntryDateKey(entry), entry.value]),
    );
    const firstRecordedDate = getMetricEntryDateKey(chartEntries[0]);
    const lastRecordedDate = getMetricEntryDateKey(chartEntries.at(-1)!);
    const labels = calendarDates
      ? calendarDates.filter(
          (date) => date >= firstRecordedDate && date <= lastRecordedDate,
        )
      : chartEntries.map(getMetricEntryDateKey);
    const chartConfig: ChartConfiguration<"line" | "bar"> = {
      type: isDistance ? "bar" : "line",
      data: {
        labels: labels.map((date) =>
          new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
          }).format(new Date(`${date}T12:00:00`)),
        ),
        datasets: [
          {
            label: metricName,
            data: calendarDates
              ? labels.map((date) => dailyValues.get(date) ?? null)
              : values,
            borderColor: colors.line,
            backgroundColor: isDistance ? colors.lineDim : colors.fill,
            borderWidth: isDistance ? 1 : 3,
            ...(isDistance
              ? {
                  borderRadius: 4,
                  maxBarThickness: 32,
                  minBarLength: 2,
                  categoryPercentage: 0.85,
                  barPercentage: 0.9,
                }
              : {
                  spanGaps: false,
                  pointBackgroundColor: colors.line,
                  pointBorderColor: colors.background,
                  pointBorderWidth: 2,
                  pointRadius: calendarDates ? 3 : 4,
                  tension: 0.35,
                  fill: true,
                }),
          },
        ],
      },
      options: {
        ...(calendarDates ? { animation: false } : {}),
        font: { family: colors.font, size: 12 },
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: !calendarDates, labels: { color: colors.text } },
          tooltip: {
            backgroundColor: colors.background,
            titleColor: colors.foreground,
            bodyColor: colors.foreground,
            borderColor: colors.axis,
            borderWidth: 1,
            callbacks: {
              label: (tooltipItem) => {
                const value = tooltipItem.parsed.y;

                return value === null
                  ? "No value"
                  : formatMetricValueWithUnit(value, metricSlug, unit);
              },
            },
          },
        },
        scales: {
          x: {
            border: { color: colors.axis },
            grid: { color: colors.grid, display: !calendarDates },
            ticks: {
              color: colors.text,
              ...(calendarDates ? { maxTicksLimit: 4, maxRotation: 0 } : {}),
            },
          },
          y: {
            beginAtZero: !!calendarDates,
            border: { color: colors.axis },
            grid: { color: colors.grid },
            ticks: {
              color: colors.text,
              callback: (value) =>
                typeof value === "number"
                  ? formatChartAxisTick(value, metricSlug, unit)
                  : `${value} ${unit}`,
            },
          },
        },
      },
    };

    const chart = new ChartJS(context, chartConfig);

    return () => {
      chart.destroy();
    };
  }, [
    chartEntries,
    metricName,
    metricSlug,
    unit,
    values,
    theme,
    calendarDates,
    isDistance,
  ]);

  if (chartEntries.length === 0) {
    return <p className="trend-empty">No chart data yet.</p>;
  }

  return (
    <div
      aria-label={`${metricName} trend chart`}
      className="chart-surface metric-trend-chart"
      role="img"
    >
      {!calendarDates ? (
        <div className="metric-trend-chart-header">
          <p className="metric-trend-chart-summary">{chartSummary}</p>
          <p className="metric-trend-chart-mode">Daily latest values</p>
        </div>
      ) : null}
      {!calendarDates && chartEntries.length < 2 ? (
        <p className="metric-trend-single-day-note">
          Only one day of data so far. Log a second day to see a trend.
        </p>
      ) : null}
      <canvas ref={canvasRef} />
    </div>
  );
}

function getLatestEntriesByDay(entries: MetricEntry[]) {
  const latestEntriesByDate = new Map<string, MetricEntry>();

  for (const entry of entries) {
    const dateKey = getMetricEntryDateKey(entry);
    const existingEntry = latestEntriesByDate.get(dateKey);

    if (
      !existingEntry ||
      new Date(entry.recorded_at).getTime() >
        new Date(existingEntry.recorded_at).getTime()
    ) {
      latestEntriesByDate.set(dateKey, entry);
    }
  }

  return [...latestEntriesByDate.values()].sort((left, right) =>
    getMetricEntryDateKey(left).localeCompare(getMetricEntryDateKey(right)),
  );
}

function getMetricEntryDateKey(entry: MetricEntry): string {
  return entry.local_date ?? getLocalDateKey(entry.recorded_at);
}

function getLocalDateKey(isoDateTime: string) {
  const date = new Date(isoDateTime);

  // Use the user's local day for grouping, matching what they see on screen.
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
