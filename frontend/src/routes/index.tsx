import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useCreateMetricEntryMutation } from '../features/metrics/use-create-metric-entry-mutation'
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

            <MetricEntryForm
              metricName={definition.name}
              metricSlug={definition.slug}
            />
          </article>
        ))}
      </div>
    </section>
  )
}

interface MetricEntryFormProps {
  metricName: string
  metricSlug: string
}

function MetricEntryForm({ metricName, metricSlug }: MetricEntryFormProps) {
  const [value, setValue] = useState('')
  const createMetricEntryMutation = useCreateMetricEntryMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await createMetricEntryMutation.mutateAsync({
      metricDefinition: metricSlug,
      value: Number(value),
      recordedAt: new Date().toISOString(),
      context: {},
    })

    setValue('')
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
    </form>
  )
}
