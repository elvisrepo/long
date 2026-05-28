import { createFileRoute } from '@tanstack/react-router'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useMetricEntriesQuery } from '../features/metrics/use-metric-entries-query'

export const Route = createFileRoute('/metrics/$slug')({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricDetailRoute,
})

function MetricDetailRoute() {
  const { slug } = Route.useParams()
  const {
    data: metricDefinitions = [],
    isLoading: definitionsAreLoading,
    isError: definitionsFailed,
  } = useMetricDefinitionsQuery()
  const {
    data: metricEntries = [],
    isLoading: entriesAreLoading,
    isError: entriesFailed,
  } = useMetricEntriesQuery({ metric: slug })

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

  return (
    <section className="metric-detail-screen">
      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Metric detail</p>
          <h1 className="dashboard-title">{metricDefinition.name}</h1>
          <p>
            {metricDefinition.slug} · {metricDefinition.unit}
          </p>
        </div>
      </div>

      <section className="entries-card" aria-label="Metric entry history">
        <h2>Entry History</h2>

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
