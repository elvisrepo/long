import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MetricTrendChart } from './metric-trend-chart'
import type { MetricEntry } from './metric-entries-api'

const metricEntries: MetricEntry[] = [
  {
    id: 1,
    metric_definition: 'resting_hr',
    value: 60,
    recorded_at: '2026-03-10T07:15:00Z',
    source: 'manual',
    context: {},
    created_at: '2026-03-10T07:15:02Z',
  },
  {
    id: 2,
    metric_definition: 'resting_hr',
    value: 56,
    recorded_at: '2026-03-01T07:15:00Z',
    source: 'manual',
    context: {},
    created_at: '2026-03-01T07:15:02Z',
  },
]

describe('MetricTrendChart', () => {
  it('renders a chart region and summary for metric entries', () => {
    render(
      <MetricTrendChart
        entries={metricEntries}
        metricName="Resting Heart Rate"
        metricSlug="resting_hr"
        unit="bpm"
      />,
    )

    expect(
      screen.getByRole('img', { name: /resting heart rate trend chart/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/56 to 60 bpm/i)).toBeInTheDocument()
    expect(screen.getByText(/daily latest values/i)).toBeInTheDocument()
  })

  it('formats body-weight floating-point noise in the chart summary', () => {
    render(
      <MetricTrendChart
        entries={[
          {
            id: 1,
            metric_definition: 'body_weight',
            value: 83.5999984741211,
            recorded_at: '2026-08-05T07:15:00Z',
            source: 'samsung_health',
            context: {},
            created_at: '2026-08-05T07:15:02Z',
          },
          {
            id: 2,
            metric_definition: 'body_weight',
            value: 87,
            recorded_at: '2026-05-19T07:15:00Z',
            source: 'manual',
            context: {},
            created_at: '2026-05-19T07:15:02Z',
          },
        ]}
        metricName="Body Weight"
        metricSlug="body_weight"
        unit="kg"
      />,
    )

    expect(screen.getByText(/83\.6 to 87 kg/i)).toBeInTheDocument()
  })

  it('uses the latest entry per day for chart data', () => {
    const chartMock = ChartMock.create
    chartMock.mockClear()
    // jsdom has no real canvas implementation, so this test provides the
    // minimum context object needed for the component to build chart config.
    const getContextMock = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D)

    render(
      <MetricTrendChart
        entries={[
          {
            id: 1,
            metric_definition: 'resting_hr',
            value: 55,
            recorded_at: '2026-06-02T07:00:00Z',
            source: 'manual',
            context: {},
            created_at: '2026-06-02T07:00:02Z',
          },
          {
            id: 2,
            metric_definition: 'resting_hr',
            value: 57,
            recorded_at: '2026-06-02T12:00:00Z',
            source: 'manual',
            context: {},
            created_at: '2026-06-02T12:00:02Z',
          },
          {
            id: 3,
            metric_definition: 'resting_hr',
            value: 60,
            recorded_at: '2026-06-01T07:00:00Z',
            source: 'manual',
            context: {},
            created_at: '2026-06-01T07:00:02Z',
          },
        ]}
        metricName="Resting Heart Rate"
        metricSlug="resting_hr"
        unit="bpm"
      />,
    )

    expect(screen.getByText(/57 to 60 bpm/i)).toBeInTheDocument()
    expect(
      chartMock.mock.calls.at(-1)?.[0].data.datasets[0].data,
    ).toEqual([60, 57])

    getContextMock.mockRestore()
  })

  it('renders an empty state when there is no chart data', () => {
    render(
      <MetricTrendChart
        entries={[]}
        metricName="Resting Heart Rate"
        metricSlug="resting_hr"
        unit="bpm"
      />,
    )

    expect(screen.getByText(/no chart data yet/i)).toBeInTheDocument()
  })
})

class ChartMock {
  static create = vi.fn()
}

// We test our data-to-config behavior, not Chart.js rendering internals.
vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn()
    static getChart = vi.fn()

    constructor(_context: unknown, config: unknown) {
      ChartMock.create(config)
    }

    destroy = vi.fn()
  }

  return {
    CategoryScale: vi.fn(),
    Chart,
    Filler: vi.fn(),
    LineController: vi.fn(),
    LineElement: vi.fn(),
    LinearScale: vi.fn(),
    Legend: vi.fn(),
    PointElement: vi.fn(),
    Tooltip: vi.fn(),
  }
})
