import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'

export const Route = createFileRoute('/')({
    beforeLoad: requireAuthBeforeLoad,
    component: DashboardRoute,
  })

function DashboardRoute() {

  const {
      data: metricDefinitions = [],
      isLoading,
      isError,
    } = useMetricDefinitionsQuery()

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
            </article>
          ))}
        </div>
      </section>
  )
}
