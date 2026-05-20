import { createFileRoute } from '@tanstack/react-router'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'

export const Route = createFileRoute('/metrics')({
    beforeLoad: requireAuthBeforeLoad,
    component: MetricsRoute,
  })

function MetricsRoute() {
    const {
      data: metricDefinitions = [],
      isLoading,
      isError,
    } = useMetricDefinitionsQuery()

    if (isLoading) {
      return <p>Loading metrics...</p>
    }

    if (isError) {
      return <p>Metrics failed to load</p>
    }

    return (
      <section className="metrics-screen">
        <div className="metrics-hero">
          <div>
            <p className="eyebrow">Metric catalog</p>
            <h1 className="dashboard-title">Metrics</h1>
          </div>
          <div className="status-pill">{metricDefinitions.length} tracked</div>
        </div>

        <div className="metrics-list" aria-label="Available metrics">
          {metricDefinitions.map((definition) => (
            <article className="metric-list-row" key={definition.id}>
              <div>
                <h2>{definition.name}</h2>
                <p>
                  {definition.category} · {definition.unit}
                </p>
              </div>
              <span>{definition.slug}</span>
            </article>
          ))}
        </div>
      </section>
    )
  }