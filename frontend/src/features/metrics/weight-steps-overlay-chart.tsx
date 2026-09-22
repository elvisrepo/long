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
  type ChartConfiguration,
} from "chart.js";
import { useEffect, useRef } from "react";

import type { WeightStepsPoint } from "./weight-steps-analytics-api";
import { formatChartAxisTick } from "./metric-entry-formatters";
import { getChartPalette } from "./chart-palette";
import { useTheme } from "../../theme";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);

export function WeightStepsOverlayChart({
  series,
}: {
  series: WeightStepsPoint[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!canvasRef.current || series.length === 0) {
      return;
    }

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvasRef.current.getContext("2d");
    } catch {
      return;
    }

    if (!context) {
      return;
    }

    ChartJS.getChart(canvasRef.current)?.destroy();
    const colors = getChartPalette();

    const weightValues = series.flatMap((point) =>
      [point.weight_kg, point.weight_7d_average_kg].filter(
        (value): value is number => value !== null,
      ),
    );
    const weightAxisBounds =
      weightValues.length > 0
        ? {
            min: Math.floor(Math.min(...weightValues) - 1),
            max: Math.ceil(Math.max(...weightValues) + 1),
          }
        : {};

    const config: ChartConfiguration<
      "bar" | "line",
      (number | null)[],
      string
    > = {
      type: "bar",
      data: {
        labels: series.map((point) => formatDate(point.date)),
        datasets: [
          {
            type: "bar",
            label: "Steps total",
            data: series.map((point) => point.steps),
            backgroundColor: colors.blueFill,
            borderColor: colors.blue,
            borderWidth: 1,
            borderRadius: 5,
            yAxisID: "steps",
          },
          {
            type: "line",
            label: "Daily weight kg",
            data: series.map((point) => point.weight_kg),
            borderColor: colors.lineDim,
            backgroundColor: colors.lineDim,
            borderWidth: 1,
            pointBackgroundColor: colors.line,
            pointRadius: 4,
            showLine: false,
            spanGaps: true,
            yAxisID: "weight",
          },
          {
            type: "line",
            label: "7-day weight average kg",
            data: series.map((point) => point.weight_7d_average_kg),
            borderColor: colors.line,
            backgroundColor: colors.fill,
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: false,
            yAxisID: "weight",
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { labels: { color: colors.text } },
          tooltip: {
            backgroundColor: colors.background,
            titleColor: colors.foreground,
            bodyColor: colors.foreground,
            borderColor: colors.axis,
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            border: { color: colors.axis },
            grid: { color: colors.grid },
            ticks: { color: colors.text, maxTicksLimit: 10 },
          },
          weight: {
            ...weightAxisBounds,
            position: "left",
            border: { color: colors.lineDim },
            grid: { color: colors.grid },
            ticks: {
              color: colors.line,
              callback: (value) =>
                typeof value === "number"
                  ? formatChartAxisTick(value, "body_weight", "kg")
                  : `${value} kg`,
            },
          },
          steps: {
            position: "right",
            border: { color: colors.blue },
            grid: { drawOnChartArea: false },
            ticks: { color: colors.blue },
          },
        },
      },
    };

    const chart = new ChartJS(context, config);
    return () => chart.destroy();
  }, [series, theme]);

  return (
    <div
      aria-label="Daily body weight, seven-day weight average, and daily total steps chart"
      className="weight-steps-chart"
      role="img"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
