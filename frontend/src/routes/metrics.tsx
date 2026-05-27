import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import { useCreateMetricDefinitionMutation } from '../features/metrics/use-create-metric-definition-mutation'
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

      <CreateCustomMetricForm />

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

function CreateCustomMetricForm() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [unit, setUnit] = useState('')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const createMetricDefinitionMutation = useCreateMetricDefinitionMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await createMetricDefinitionMutation.mutateAsync({
        name,
        slug,
        unit,
        minValue: Number(minValue),
        maxValue: Number(maxValue),
      })

      setName('')
      setSlug('')
      setUnit('')
      setMinValue('')
      setMaxValue('')
    } catch {
      // The mutation state below renders the error message.
    }
  }

  return (
    <form className="custom-metric-form" onSubmit={handleSubmit}>
      <h2>Create custom metric</h2>

      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label>
        Slug
        <input value={slug} onChange={(event) => setSlug(event.target.value)} />
      </label>

      <label>
        Unit
        <input value={unit} onChange={(event) => setUnit(event.target.value)} />
      </label>

      <label>
        Min value
        <input
          type="number"
          value={minValue}
          onChange={(event) => setMinValue(event.target.value)}
        />
      </label>

      <label>
        Max value
        <input
          type="number"
          value={maxValue}
          onChange={(event) => setMaxValue(event.target.value)}
        />
      </label>

      <button disabled={createMetricDefinitionMutation.isPending} type="submit">
        {createMetricDefinitionMutation.isPending
          ? 'Creating...'
          : 'Create custom metric'}
      </button>

      {createMetricDefinitionMutation.isError ? (
        <p className="form-error">
          {createMetricDefinitionMutation.error.message}
        </p>
      ) : null}
    </form>
  )
}
