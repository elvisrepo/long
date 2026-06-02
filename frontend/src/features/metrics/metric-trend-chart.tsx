import {
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
} from 'chart.js'
import { useEffect, useMemo, useRef } from 'react'

import type { MetricEntry } from './metric-entries-api'

// Chart.js is modular: every controller, scale, element, and plugin used by
// this component must be registered before creating a chart instance.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
  Filler,
)

interface MetricTrendChartProps {
  entries: MetricEntry[]
  metricName: string
  unit: string
}

export function MetricTrendChart({
  entries,
  metricName,
  unit,
}: MetricTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // The chart is a daily trend, not a raw event plot. Entry History still shows
  // every log, but the chart uses the latest manually recorded value per day.
  const chartEntries = useMemo(() => getLatestEntriesByDay(entries), [entries])
  const values = useMemo(
    () => chartEntries.map((entry) => entry.value),
    [chartEntries],
  )
  const chartSummary =
    values.length > 0
      ? `${Math.min(...values)} to ${Math.max(...values)} ${unit}`
      : undefined

  useEffect(() => {
    if (chartEntries.length === 0 || !canvasRef.current) {
      return
    }

    let context: CanvasRenderingContext2D | null = null

    try {
      context = canvasRef.current.getContext('2d')
    } catch {
      // jsdom does not provide a real canvas context; the accessible fallback
      // still lets tests verify the chart contract without browser graphics.
      return
    }

    if (!context) {
      return
    }

    // React dev rendering and route reloads can reuse the same canvas. Chart.js
    // refuses to create a second chart on a canvas until the old one is gone.
    ChartJS.getChart(canvasRef.current)?.destroy()

    const chartConfig: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: chartEntries.map((entry) =>
          new Intl.DateTimeFormat('en', {
            month: 'short',
            day: 'numeric',
          }).format(new Date(entry.recorded_at)),
        ),
        datasets: [
          {
            label: metricName,
            data: values,
            borderColor: '#00e5a0',
            backgroundColor: 'rgba(0, 229, 160, 0.16)',
            borderWidth: 3,
            pointBackgroundColor: '#00e5a0',
            pointBorderColor: '#07100d',
            pointBorderWidth: 2,
            pointRadius: 4,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltipItem) => `${tooltipItem.parsed.y} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            border: { color: 'rgba(133, 151, 176, 0.35)' },
            grid: { color: 'rgba(133, 151, 176, 0.12)' },
            ticks: { color: '#8597b0' },
          },
          y: {
            border: { color: 'rgba(133, 151, 176, 0.35)' },
            grid: { color: 'rgba(133, 151, 176, 0.14)' },
            ticks: {
              color: '#8597b0',
              callback: (value) => `${value} ${unit}`,
            },
          },
        },
      },
    }

    const chart = new ChartJS(context, chartConfig)

    return () => {
      chart.destroy()
    }
  }, [chartEntries, metricName, unit, values])

  if (chartEntries.length === 0) {
    return <p className="trend-empty">No chart data yet.</p>
  }

  return (
    <div
      aria-label={`${metricName} trend chart`}
      className="metric-trend-chart"
      role="img"
    >
      <p className="metric-trend-chart-summary">{chartSummary}</p>
      <canvas ref={canvasRef} />
    </div>
  )
}

function getLatestEntriesByDay(entries: MetricEntry[]) {
  const latestEntriesByDate = new Map<string, MetricEntry>()

  for (const entry of entries) {
    const dateKey = getLocalDateKey(entry.recorded_at)
    const existingEntry = latestEntriesByDate.get(dateKey)

    if (
      !existingEntry ||
      new Date(entry.recorded_at).getTime() >
        new Date(existingEntry.recorded_at).getTime()
    ) {
      latestEntriesByDate.set(dateKey, entry)
    }
  }

  return [...latestEntriesByDate.values()].sort(
    (left, right) =>
      new Date(left.recorded_at).getTime() -
      new Date(right.recorded_at).getTime(),
  )
}

function getLocalDateKey(isoDateTime: string) {
  const date = new Date(isoDateTime)

  // Use the user's local day for grouping, matching what they see on screen.
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
