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

    const weightValues = series.flatMap((point) =>
      [point.weight_kg, point.weight_7d_average_kg].filter(
        (value): value is number => value !== null,
      ),
    );
    const weightAxisBounds =
      weightValues.length > 0
        ? {
            suggestedMin: Math.floor(Math.min(...weightValues) - 1),
            suggestedMax: Math.ceil(Math.max(...weightValues) + 1),
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
            backgroundColor: "rgba(59, 130, 246, 0.55)",
            borderColor: "rgba(96, 165, 250, 0.9)",
            borderWidth: 1,
            borderRadius: 5,
            yAxisID: "steps",
          },
          {
            type: "line",
            label: "Daily weight kg",
            data: series.map((point) => point.weight_kg),
            borderColor: "rgba(0, 229, 160, 0.45)",
            backgroundColor: "rgba(0, 229, 160, 0.45)",
            borderWidth: 1,
            pointBackgroundColor: "#00e5a0",
            pointRadius: 4,
            showLine: false,
            spanGaps: true,
            yAxisID: "weight",
          },
          {
            type: "line",
            label: "7-day weight average kg",
            data: series.map((point) => point.weight_7d_average_kg),
            borderColor: "#00e5a0",
            backgroundColor: "rgba(0, 229, 160, 0.14)",
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
          legend: { labels: { color: "#b9c6d8" } },
        },
        scales: {
          x: {
            border: { color: "rgba(133, 151, 176, 0.35)" },
            grid: { color: "rgba(133, 151, 176, 0.1)" },
            ticks: { color: "#8597b0", maxTicksLimit: 10 },
          },
          weight: {
            ...weightAxisBounds,
            position: "left",
            border: { color: "rgba(0, 229, 160, 0.45)" },
            grid: { color: "rgba(133, 151, 176, 0.12)" },
            ticks: {
              color: "#00e5a0",
              callback: (value) => `${value} kg`,
            },
          },
          steps: {
            position: "right",
            border: { color: "rgba(96, 165, 250, 0.55)" },
            grid: { drawOnChartArea: false },
            ticks: { color: "#60a5fa" },
          },
        },
      },
    };

    const chart = new ChartJS(context, config);
    return () => chart.destroy();
  }, [series]);

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
