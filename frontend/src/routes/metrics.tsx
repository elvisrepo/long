import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { requireAuthBeforeLoad } from '../features/auth/require-auth-before-load'
import type { MetricDefinition } from '../features/metrics/metric-definitions-api'
import { useCreateMetricDefinitionMutation } from '../features/metrics/use-create-metric-definition-mutation'
import { useDeactivateMetricDefinitionMutation } from '../features/metrics/use-deactivate-metric-definition-mutation'
import { useMetricDefinitionsQuery } from '../features/metrics/use-metric-definitions-query'
import { useUpdateMetricDefinitionMutation } from '../features/metrics/use-update-metric-definition-mutation'

export const Route = createFileRoute('/metrics')({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricsRoute,
})

function MetricsRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== '/metrics') {
    return <Outlet />
  }

  return <MetricsCatalog />
}

function MetricsCatalog() {
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
          <MetricDefinitionRow
            definition={definition}
            key={definition.id}
          />
  ))}
      </div>
    </section>
  )
}

interface MetricDefinitionRowProps {
  definition: MetricDefinition
}

function MetricDefinitionRow({ definition }: MetricDefinitionRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(definition.name)
  const [unit, setUnit] = useState(definition.unit)
  const [minValue, setMinValue] = useState(String(definition.min_value))
  const [maxValue, setMaxValue] = useState(String(definition.max_value))
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const updateMetricDefinitionMutation = useUpdateMetricDefinitionMutation()
  const deactivateMetricDefinitionMutation =
    useDeactivateMetricDefinitionMutation()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await updateMetricDefinitionMutation.mutateAsync({
        id: definition.id,
        input: {
          name,
          unit,
          minValue: Number(minValue),
          maxValue: Number(maxValue),
        },
      })
      setIsEditing(false)
    } catch {
      // The mutation state below renders the backend validation message.
    }
  }

  async function handleDeactivate() {
    try {
      setDeactivateError(null)
      await deactivateMetricDefinitionMutation.mutateAsync(definition.id)
    } catch (error) {
      setDeactivateError(
        error instanceof Error
          ? error.message
          : 'Metric definition request failed',
      )
    }
  }

  if (isEditing) {
    return (
      <form className="metric-list-row metric-edit-form" onSubmit={handleSubmit}>
        <div className="metric-edit-grid">
          <label>
            {definition.name} name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            {definition.name} unit
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </label>

          <label>
            {definition.name} min value
            <input
              type="number"
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
            />
          </label>

          <label>
            {definition.name} max value
            <input
              type="number"
              value={maxValue}
              onChange={(event) => setMaxValue(event.target.value)}
            />
          </label>
        </div>

        <div className="metric-row-actions">
          <button
            disabled={updateMetricDefinitionMutation.isPending}
            type="submit"
          >
            {updateMetricDefinitionMutation.isPending
              ? 'Saving...'
              : `Save ${definition.name}`}
          </button>
          <button type="button" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </div>

        {updateMetricDefinitionMutation.isError ? (
          <p className="form-error">
            {updateMetricDefinitionMutation.error.message}
          </p>
        ) : null}
      </form>
    )
  }

  return (
    <article className="metric-list-row">
      <Link
        className="metric-row-link"
        params={{ slug: definition.slug }}
        to="/metrics/$slug"
      >
        <div>
          <h2>{definition.name}</h2>
          <p>
            {definition.category} · {definition.unit}
          </p>
        </div>
      </Link>

      <div className="metric-row-actions">
        <span>{definition.slug}</span>
        {!definition.is_default ? (
          <>
            <button type="button" onClick={() => setIsEditing(true)}>
              Edit {definition.name}
            </button>
            <button
              disabled={deactivateMetricDefinitionMutation.isPending}
              type="button"
              onClick={handleDeactivate}
            >
              {deactivateMetricDefinitionMutation.isPending
                ? 'Deactivating...'
                : `Deactivate ${definition.name}`}
            </button>
          </>
        ) : null}
      </div>

      {deactivateError ? <p className="form-error">{deactivateError}</p> : null}
    </article>
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
