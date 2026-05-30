import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { type GetMetricEntriesFilters } from '../features/metrics/metric-entries-api'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'

export const Route = createFileRoute('/metrics/$slug')({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricDetailRoute,
})

const metricEntryRanges = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
] as const

type MetricEntryRange = (typeof metricEntryRanges)[number]

function MetricDetailRoute() {
  const { slug } = Route.useParams()
  const [selectedRange, setSelectedRange] = useState<MetricEntryRange>(
    metricEntryRanges[3],
  )
  const [selectedRangeFrom, setSelectedRangeFrom] = useState<
    string | undefined
  >(undefined)
  const metricEntryFilters: GetMetricEntriesFilters = selectedRangeFrom
    ? { metric: slug, from: selectedRangeFrom }
    : { metric: slug }
  const {
    data: metricDefinitions = [],
    isLoading: definitionsAreLoading,
    isError: definitionsFailed,
  } = useMetricDefinitionsQuery()
  const {
    data: metricEntries = [],
    isLoading: entriesAreLoading,
    isError: entriesFailed,
  } = useMetricEntriesQuery(metricEntryFilters)

  if (definitionsAreLoading) {
    return <p>Loading metric...</p>
  }

  if (definitionsFailed) {
    return <p>Metric failed to load</p>
  }

  const metricDefinition = metricDefinitions.find(
    (definition) => definition.slug === slug,
  )

  if (!metricDefinition) {
    return <p>Metric not found</p>
  }

  const latestEntry = metricEntries[0]
  const valueRange = `${metricDefinition.min_value}-${metricDefinition.max_value} ${metricDefinition.unit}`
  const oldestEntry = metricEntries.at(-1)
  const trendDelta =
    latestEntry && oldestEntry ? latestEntry.value - oldestEntry.value : undefined
  const formattedTrendDelta =
    trendDelta === undefined
      ? '—'
      : `${trendDelta > 0 ? '+' : ''}${trendDelta} ${metricDefinition.unit}`

  function handleRangeSelect(range: MetricEntryRange) {
    if (selectedRange.label === range.label) {
      return
    }

    setSelectedRange(range)
    setSelectedRangeFrom(
      range.days === null ? undefined : getRangeStartIso(range.days),
    )
  }

  return (
    <section className="metric-detail-screen">
      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Metric detail</p>
          <h1 className="dashboard-title">{metricDefinition.name}</h1>
          <p className="metric-detail-meta">
            {metricDefinition.slug} · {metricDefinition.unit}
          </p>
        </div>
        <div className="status-pill">{metricEntries.length} entries</div>
      </div>

      <section className="metric-detail-summary" aria-label="Metric summary">
        <article className="metric-detail-stat metric-detail-stat-primary">
          <p className="meta-label">Latest value</p>
          <p
            aria-label={`${latestEntry?.value ?? 'No value'} ${metricDefinition.unit}`}
            className="metric-detail-value"
          >
            <span>{latestEntry?.value ?? '—'}</span>
            <small>{metricDefinition.unit}</small>
          </p>
        </article>

        <article className="metric-detail-stat">
          <p className="meta-label">Tracked entries</p>
          <p className="metric-detail-stat-value">
            {metricEntries.length} entries
          </p>
        </article>

        <article className="metric-detail-stat">
          <p className="meta-label">Accepted range</p>
          <p className="metric-detail-stat-value">{valueRange}</p>
        </article>
      </section>

      <section className="trend-card" aria-label="Trend overview">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Selected range</p>
            <h2>Trend Overview</h2>
          </div>
        </div>

        <div className="trend-grid">
          <article>
            <p className="meta-label">Oldest</p>
            <p className="trend-value">
              {oldestEntry ? `${oldestEntry.value} ${metricDefinition.unit}` : '—'}
            </p>
          </article>

          <article>
            <p className="meta-label">Latest</p>
            <p className="trend-value">
              {latestEntry ? `${latestEntry.value} ${metricDefinition.unit}` : '—'}
            </p>
          </article>

          <article>
            <p className="meta-label">Delta</p>
            <p className="trend-value trend-delta">{formattedTrendDelta}</p>
          </article>
        </div>
      </section>

      <section className="entries-card" aria-label="Metric entry history">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Recorded manually</p>
            <h2>Entry History</h2>
          </div>

          <div className="range-toggle" aria-label="Metric entry range">
            {metricEntryRanges.map((range) => (
              <button
                aria-pressed={selectedRange.label === range.label}
                key={range.label}
                onClick={() => handleRangeSelect(range)}
                type="button"
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {entriesAreLoading ? <p>Loading metric entries...</p> : null}
        {entriesFailed ? <p>Metric entries failed to load</p> : null}

        <div className="entry-list">
          {metricEntries.map((entry) => (
            <article className="entry-row" key={entry.id}>
              <div>
                <p className="entry-label">{metricDefinition.name}</p>
                <time dateTime={entry.recorded_at}>
                  {formatMetricEntryRecordedAt(entry.recorded_at)}
                </time>
              </div>
              <p className="entry-value">
                {entry.value} {metricDefinition.unit}
              </p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function formatMetricEntryRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(recordedAt))
}

function getRangeStartIso(days: number) {
  const rangeStart = new Date()
  rangeStart.setUTCDate(rangeStart.getUTCDate() - days)
  return rangeStart.toISOString()
}
