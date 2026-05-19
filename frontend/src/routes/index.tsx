import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useCreateMetricEntryMutation } from '../features/metrics/use-create-metric-entry-mutation'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'


export const Route = createFileRoute('/')({
  beforeLoad: requireAuthBeforeLoad,
  component: DashboardRoute,
})

function DashboardRoute() {
  const [selectedMetricSlug, setSelectedMetricSlug] = useState('')
  const {
    data: metricDefinitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery()
  const {
    data: metricEntries = [],
    isLoading: metricEntriesAreLoading,
    isError: metricEntriesFailed,
  } = useMetricEntriesQuery(
    selectedMetricSlug ? { metric: selectedMetricSlug } : {},
  )
  const metricDefinitionsBySlug = new Map(
    metricDefinitions.map((definition) => [definition.slug, definition]),
  )

  if (isLoading) {
    return <p>Loading metric definitions...</p>
  }

  if (isError) {
    return <p>Metric definitions failed to load</p>
  }

  return (
    <section>
      <h1>Dashboard</h1>

      <div aria-label="Metric definitions">
        {metricDefinitions.map((definition) => (
          <article key={definition.id}>
            <h2>{definition.name}</h2>
            <p>
              {definition.category} · {definition.unit}
            </p>

            <MetricEntryForm
              metricName={definition.name}
              metricSlug={definition.slug}
            />
          </article>
        ))}
      </div>

      <section aria-label="Metric entries">
        <h2>Recent Entries</h2>

        <label>
          Filter recent entries by metric
          <select
            value={selectedMetricSlug}
            onChange={(event) => setSelectedMetricSlug(event.target.value)}
          >
            <option value="">All metrics</option>
            {metricDefinitions.map((definition) => (
              <option key={definition.id} value={definition.slug}>
                {definition.name}
              </option>
            ))}
          </select>
        </label>

        {metricEntriesAreLoading ? <p>Loading metric entries...</p> : null}
        {metricEntriesFailed ? <p>Metric entries failed to load</p> : null}

        {metricEntries.map((entry) => (
          <MetricEntrySummary
            key={entry.id}
            metricName={
              metricDefinitionsBySlug.get(entry.metric_definition)?.name ??
              entry.metric_definition
            }
            recordedAt={entry.recorded_at}
            unit={metricDefinitionsBySlug.get(entry.metric_definition)?.unit}
            value={entry.value}
          />
        ))}
      </section>
    </section>
  )
}

interface MetricEntrySummaryProps {
  metricName: string
  recordedAt: string
  unit: string | undefined
  value: number
}

function MetricEntrySummary({
  metricName,
  recordedAt,
  unit,
  value,
}: MetricEntrySummaryProps) {
  const displayValue = unit ? `${value} ${unit}` : value
  const displayRecordedAt = formatMetricEntryRecordedAt(recordedAt)

  return (
    <article>
      <h3>{metricName}</h3>
      <p>{displayValue}</p>
      <time dateTime={recordedAt}>{displayRecordedAt}</time>
    </article>
  )
}

function formatMetricEntryRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(recordedAt))
}

interface MetricEntryFormProps {
  metricName: string
  metricSlug: string
}

// MetricEntryForm receives props, destructures metricName and metricSlug from them, and TypeScript checks that
// those props match MetricEntryFormProps.
function MetricEntryForm({ metricName, metricSlug }: MetricEntryFormProps) {
  const [value, setValue] = useState('')
  const createMetricEntryMutation = useCreateMetricEntryMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await createMetricEntryMutation.mutateAsync({
        metricDefinition: metricSlug,
        value: Number(value),
        recordedAt: new Date().toISOString(),
        context: {},
      })

      setValue('')
    } catch {
      // The mutation state below renders the error message.
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {metricName} value
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          type="number"
        />
      </label>

      <button disabled={createMetricEntryMutation.isPending} type="submit">
        {createMetricEntryMutation.isPending ? 'Logging...' : `Log ${metricName}`}
      </button>

      {createMetricEntryMutation.isError ? (
        <p>{createMetricEntryMutation.error.message}</p>
      ) : null}
    </form>
  )
}
