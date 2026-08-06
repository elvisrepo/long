import { Link, createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { formatMetricEntrySource } from '../features/metrics/metric-entry-formatters'
import { MetricTrendChart } from '../features/metrics/metric-trend-chart'
import { useDeleteMetricEntryMutation } from '../features/metrics/use-delete-metric-entry-mutation'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import {
  type GetMetricEntriesFilters,
  type MetricEntry,
} from '../features/metrics/metric-entries-api'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'
import { useUpdateMetricEntryMutation } from '../features/metrics/use-update-metric-entry-mutation'

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

const METRIC_DETAIL_ENTRY_LIMIT = 50

type MetricEntryRange = (typeof metricEntryRanges)[number]

function MetricDetailRoute() {
  const { slug } = Route.useParams()
  const [selectedRange, setSelectedRange] = useState<MetricEntryRange>(
    metricEntryRanges[3],
  )
  const [selectedRangeFrom, setSelectedRangeFrom] = useState<
    string | undefined
  >(undefined)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [entryActionError, setEntryActionError] = useState<string | null>(null)
  const metricEntryFilters: GetMetricEntriesFilters = selectedRangeFrom
    ? {
        metric: slug,
        from: selectedRangeFrom,
        limit: METRIC_DETAIL_ENTRY_LIMIT,
      }
    : { metric: slug, limit: METRIC_DETAIL_ENTRY_LIMIT }
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
  const updateMetricEntryMutation = useUpdateMetricEntryMutation()
  const deleteMetricEntryMutation = useDeleteMetricEntryMutation()

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

  async function handleDeleteEntry(entryId: number) {
    setEntryActionError(null)

    try {
      await deleteMetricEntryMutation.mutateAsync(entryId)
    } catch (error) {
      setEntryActionError(getErrorMessage(error))
    }
  }

  async function handleUpdateEntry(
    entry: MetricEntry,
    input: {
      value: number
      recordedAt: string
      context: Record<string, unknown>
    },
  ) {
    setEntryActionError(null)

    try {
      await updateMetricEntryMutation.mutateAsync({
        id: entry.id,
        input,
      })
      setEditingEntryId(null)
    } catch (error) {
      setEntryActionError(getErrorMessage(error))
    }
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

        <MetricTrendChart
          entries={metricEntries}
          metricName={metricDefinition.name}
          unit={metricDefinition.unit}
        />

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
            <p className="eyebrow">Manual and synced records</p>
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
        {entryActionError ? (
          <p className="form-error">{entryActionError}</p>
        ) : null}

        {metricEntries.length === 0 ? (
          <div className="empty-state">
            <h3>No entries recorded yet</h3>
            <p>
              Log your first value from the{' '}
              <Link to="/">Dashboard</Link>.
            </p>
          </div>
        ) : (
          <div className="entry-list">
            {metricEntries.map((entry) => (
              <MetricEntryHistoryRow
                entry={entry}
                isDeleting={deleteMetricEntryMutation.isPending}
                isEditing={editingEntryId === entry.id}
                isUpdating={updateMetricEntryMutation.isPending}
                key={entry.id}
                metricName={metricDefinition.name}
                onCancelEdit={() => setEditingEntryId(null)}
                onDelete={() => handleDeleteEntry(entry.id)}
                onEdit={() => {
                  setEntryActionError(null)
                  setEditingEntryId(entry.id)
                }}
                onUpdate={(input) => handleUpdateEntry(entry, input)}
                unit={metricDefinition.unit}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

interface MetricEntryHistoryRowProps {
  entry: MetricEntry
  isDeleting: boolean
  isEditing: boolean
  isUpdating: boolean
  metricName: string
  onCancelEdit: () => void
  onDelete: () => void
  onEdit: () => void
  onUpdate: (input: {
    value: number
    recordedAt: string
    context: Record<string, unknown>
  }) => void
  unit: string
}

function MetricEntryHistoryRow({
  entry,
  isDeleting,
  isEditing,
  isUpdating,
  metricName,
  onCancelEdit,
  onDelete,
  onEdit,
  onUpdate,
  unit,
}: MetricEntryHistoryRowProps) {
  const [value, setValue] = useState(String(entry.value))
  const [notes, setNotes] = useState(getEntryNotes(entry))
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedValue = parseMetricEntryValue(value)

    if (parsedValue === undefined) {
      setValidationError('Enter a numeric value before saving.')
      return
    }

    setValidationError(null)
    onUpdate({
      value: parsedValue,
      recordedAt: entry.recorded_at,
      context: {
        ...entry.context,
        notes,
      },
    })
  }

  if (isEditing) {
    return (
      <article className="entry-row entry-row-editing">
        <form className="entry-edit-form" onSubmit={handleSubmit}>
          <label>
            {metricName} value
            <input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>

          <label>
            {metricName} notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="entry-actions">
            <button disabled={isUpdating} type="submit">
              {isUpdating ? 'Saving...' : `Save ${metricName} entry`}
            </button>
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>

          {validationError ? (
            <p className="form-error">{validationError}</p>
          ) : null}
        </form>
      </article>
    )
  }

  return (
    <article className="entry-row">
      <div>
        <p className="entry-label">{metricName}</p>
        <p className="meta-label">{formatMetricEntrySource(entry.source)}</p>
        <time dateTime={entry.recorded_at}>
          {formatMetricEntryRecordedAt(entry.recorded_at)}
        </time>
      </div>

      <div className="entry-row-side">
        <p className="entry-value">
          {entry.value} {unit}
        </p>
        {entry.source === 'manual' ? (
          <div className="entry-actions">
            <button type="button" onClick={onEdit}>
              Edit {metricName} entry
            </button>
            <button disabled={isDeleting} type="button" onClick={onDelete}>
              {isDeleting ? 'Deleting...' : `Delete ${metricName} entry`}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function getEntryNotes(entry: MetricEntry) {
  return typeof entry.context.notes === 'string' ? entry.context.notes : ''
}

function parseMetricEntryValue(value: string) {
  if (value.trim() === '') {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : undefined
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Metric entry action failed'
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
