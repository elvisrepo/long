import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createPortal } from "react-dom";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import type { MetricDefinition } from "../features/metrics/metric-definitions-api";
import { useCreateMetricDefinitionMutation } from "../features/metrics/use-create-metric-definition-mutation";
import { useDeactivateMetricDefinitionMutation } from "../features/metrics/use-deactivate-metric-definition-mutation";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricUsageQuery } from "../features/metrics/use-metric-usage-query";
import { useReactivateMetricDefinitionMutation } from "../features/metrics/use-reactivate-metric-definition-mutation";
import { useUpdateMetricDefinitionMutation } from "../features/metrics/use-update-metric-definition-mutation";

export const Route = createFileRoute("/metrics")({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricsRoute,
});

function MetricsRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname !== "/metrics") {
    return <Outlet />;
  }

  return <MetricsCatalog />;
}

function MetricsCatalog() {
  const [showInactive, setShowInactive] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const {
    data: metricDefinitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery({ includeInactive: showInactive });
  const {
    data: metricUsage,
    isLoading: isMetricUsageLoading,
    isError: isMetricUsageError,
  } = useMetricUsageQuery();

  if (isLoading || isMetricUsageLoading) {
    return <MetricsCatalogLoading />;
  }

  if (isError || isMetricUsageError || !metricUsage) {
    return <p>Metrics failed to load</p>;
  }

  const activeMetricDefinitions = metricDefinitions.filter(
    (definition) => definition.is_active,
  );
  const archivedCustomMetricDefinitions = metricDefinitions.filter(
    (definition) => !definition.is_active && !definition.is_default,
  );
  const { used, limit } = metricUsage.active_custom_metrics;

  return (
    <section className="metrics-screen">
      <div className="metrics-hero">
        <div>
          <p className="eyebrow">Metric catalog</p>
          <h1 className="dashboard-title">Metrics</h1>
        </div>
        <div className="metrics-usage">
          <div className="status-pill">
            {activeMetricDefinitions.length} tracked
          </div>
          <p
            aria-label={`${used} of ${limit} custom metrics used`}
            className={`custom-metric-usage ${
              used >= limit ? "custom-metric-usage-limit" : ""
            }`}
            role="status"
          >
            {used} of {limit} custom metrics used
          </p>
        </div>
      </div>

      <div className="metrics-toolbar">
        <button
          aria-haspopup="dialog"
          className="metrics-primary-action"
          type="button"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          + New custom metric
        </button>
        <button
          aria-expanded={showInactive}
          aria-controls="archived-metrics"
          className="metrics-secondary-action"
          type="button"
          onClick={() => setShowInactive((currentValue) => !currentValue)}
        >
          {showInactive ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {isCreateDialogOpen ? (
        <div
          className="metric-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsCreateDialogOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="create-metric-title"
            aria-modal="true"
            className="metric-dialog"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsCreateDialogOpen(false);
              }
            }}
          >
            <div className="metric-dialog-header">
              <div>
                <p className="eyebrow">Custom metric</p>
                <h2 id="create-metric-title">Create custom metric</h2>
              </div>
              <button
                aria-label="Close dialog"
                className="metric-dialog-close"
                type="button"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                ×
              </button>
            </div>
            <p
              className={`metric-dialog-quota ${
                used >= limit ? "metric-dialog-quota-limit" : ""
              }`}
            >
              {used} of {limit} custom metrics used
            </p>
            <CreateCustomMetricForm
              onCancel={() => setIsCreateDialogOpen(false)}
              onCreated={() => setIsCreateDialogOpen(false)}
            />
          </section>
        </div>
      ) : null}

      <div className="metrics-list" aria-label="Available metrics">
        {activeMetricDefinitions.map((definition) => (
          <MetricDefinitionRow definition={definition} key={definition.id} />
        ))}
      </div>

      <section
        hidden={!showInactive}
        id="archived-metrics"
        aria-label="Archived custom metrics"
        className="metrics-list archived-metrics-list"
      >
        <div className="archived-metrics-header">
          <p className="eyebrow">Archived</p>
          <h2>Archived custom metrics</h2>
        </div>

        {showInactive && archivedCustomMetricDefinitions.length === 0 ? (
          <p className="metrics-archive-empty">No archived custom metrics.</p>
        ) : null}
        {archivedCustomMetricDefinitions.map((definition) => (
          <ArchivedMetricDefinitionRow
            definition={definition}
            key={definition.id}
          />
        ))}
      </section>
    </section>
  );
}

function MetricsCatalogLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading metrics"
      className="metrics-screen"
      role="status"
    >
      <span className="visually-hidden">Loading metrics...</span>
      <div aria-hidden="true" className="metrics-loading-hero">
        <div className="metrics-skeleton metrics-skeleton-eyebrow" />
        <div className="metrics-skeleton metrics-skeleton-title" />
      </div>
      <div aria-hidden="true" className="metrics-loading-toolbar">
        <div className="metrics-skeleton metrics-skeleton-button" />
        <div className="metrics-skeleton metrics-skeleton-button" />
      </div>
      <div aria-hidden="true" className="metrics-list metrics-loading-list">
        {[0, 1, 2].map((index) => (
          <div className="metric-list-row" key={index}>
            <div className="metrics-loading-copy">
              <div className="metrics-skeleton metrics-skeleton-row-title" />
              <div className="metrics-skeleton metrics-skeleton-row-meta" />
            </div>
            <div className="metrics-skeleton metrics-skeleton-chip" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface ArchivedMetricDefinitionRowProps {
  definition: MetricDefinition;
}

function ArchivedMetricDefinitionRow({
  definition,
}: ArchivedMetricDefinitionRowProps) {
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const reactivateMetricDefinitionMutation =
    useReactivateMetricDefinitionMutation();

  async function handleReactivate() {
    try {
      setReactivateError(null);
      await reactivateMetricDefinitionMutation.mutateAsync(definition.id);
    } catch (error) {
      setReactivateError(
        error instanceof Error
          ? error.message
          : "Metric definition request failed",
      );
    }
  }

  return (
    <article className="metric-list-row archived-metric-row">
      <div>
        <h2>{definition.name}</h2>
        <p>{formatMetricSubtitle(definition)}</p>
      </div>

      <div className="metric-row-actions">
        <span className="metric-status-pill archived-status-pill">
          Archived
        </span>
        <button
          aria-label={`${reactivateMetricDefinitionMutation.isPending ? "Reactivating" : "Reactivate"} ${definition.name}`}
          className="metric-row-secondary-action"
          disabled={reactivateMetricDefinitionMutation.isPending}
          type="button"
          onClick={handleReactivate}
        >
          {reactivateMetricDefinitionMutation.isPending
            ? "Reactivating..."
            : "Reactivate"}
        </button>
      </div>

      {reactivateError ? <p className="form-error">{reactivateError}</p> : null}
    </article>
  );
}

interface MetricDefinitionRowProps {
  definition: MetricDefinition;
}

function MetricDefinitionRow({ definition }: MetricDefinitionRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [name, setName] = useState(definition.name);
  const [unit, setUnit] = useState(definition.unit);
  const [minValue, setMinValue] = useState(String(definition.min_value));
  const [maxValue, setMaxValue] = useState(String(definition.max_value));
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const updateMetricDefinitionMutation = useUpdateMetricDefinitionMutation();
  const deactivateMetricDefinitionMutation =
    useDeactivateMetricDefinitionMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await updateMetricDefinitionMutation.mutateAsync({
        id: definition.id,
        input: {
          name,
          unit,
          minValue: Number(minValue),
          maxValue: Number(maxValue),
        },
      });
      setIsEditing(false);
    } catch {
      // The mutation state below renders the backend validation message.
    }
  }

  async function handleDeactivate() {
    try {
      setDeactivateError(null);
      await deactivateMetricDefinitionMutation.mutateAsync(definition.id);
      setIsDeactivateDialogOpen(false);
    } catch (error) {
      setDeactivateError(
        error instanceof Error
          ? error.message
          : "Metric definition request failed",
      );
    }
  }

  if (isEditing) {
    return (
      <form
        className="metric-list-row metric-edit-form"
        onSubmit={handleSubmit}
      >
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
              ? "Saving..."
              : `Save ${definition.name}`}
          </button>
          <button
            className="metrics-secondary-action"
            type="button"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
        </div>

        {updateMetricDefinitionMutation.isError ? (
          <p className="form-error">
            {updateMetricDefinitionMutation.error.message}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <>
      <article className="metric-list-row">
        <Link
          className="metric-row-link"
          params={{ slug: definition.slug }}
          to="/metrics/$slug"
        >
          <div>
            <h2>{definition.name} →</h2>
            <p>{formatMetricSubtitle(definition)}</p>
          </div>
        </Link>

        <div className="metric-row-actions">
          {!definition.is_default ? (
            <>
              <span className="metric-custom-label">Custom</span>
              <button
                aria-label={`Edit ${definition.name}`}
                className="metric-row-secondary-action"
                type="button"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
              <button
                aria-label={`Deactivate ${definition.name}`}
                className="metric-row-danger-action"
                type="button"
                onClick={() => setIsDeactivateDialogOpen(true)}
              >
                Deactivate
              </button>
            </>
          ) : null}
        </div>
      </article>

      {isDeactivateDialogOpen
        ? createPortal(
            <div
              className="metric-dialog-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsDeactivateDialogOpen(false);
                }
              }}
            >
              <section
                aria-labelledby={`deactivate-${definition.id}-title`}
                aria-modal="true"
                className="metric-dialog metric-deactivate-dialog"
                role="dialog"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsDeactivateDialogOpen(false);
                  }
                }}
              >
                <div className="metric-dialog-header">
                  <div>
                    <p className="eyebrow">Archive custom metric</p>
                    <h2 id={`deactivate-${definition.id}-title`}>
                      Deactivate {definition.name}?
                    </h2>
                  </div>
                  <button
                    aria-label="Close dialog"
                    className="metric-dialog-close"
                    type="button"
                    onClick={() => setIsDeactivateDialogOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <p className="metric-dialog-copy">
                  Entries are kept. The metric moves to Archived, logging stops,
                  and one custom metric slot is freed.
                </p>
                {deactivateError ? (
                  <p className="form-error" role="alert">
                    {deactivateError}
                  </p>
                ) : null}
                <div className="metric-dialog-actions">
                  <button
                    className="metric-danger-action"
                    disabled={deactivateMetricDefinitionMutation.isPending}
                    type="button"
                    onClick={() => void handleDeactivate()}
                  >
                    {deactivateMetricDefinitionMutation.isPending
                      ? "Deactivating..."
                      : "Deactivate metric"}
                  </button>
                  <button
                    className="metrics-secondary-action"
                    disabled={deactivateMetricDefinitionMutation.isPending}
                    type="button"
                    onClick={() => setIsDeactivateDialogOpen(false)}
                  >
                    Keep it
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

interface CreateCustomMetricFormProps {
  onCancel: () => void;
  onCreated: () => void;
}

function CreateCustomMetricForm({
  onCancel,
  onCreated,
}: CreateCustomMetricFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [unit, setUnit] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const createMetricDefinitionMutation = useCreateMetricDefinitionMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createMetricDefinitionMutation.mutateAsync({
        name,
        slug,
        unit,
        minValue: Number(minValue),
        maxValue: Number(maxValue),
      });

      setName("");
      setSlug("");
      setUnit("");
      setMinValue("");
      setMaxValue("");
      onCreated();
    } catch {
      // The mutation state below renders the error message.
    }
  }

  return (
    <form className="custom-metric-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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

      <div className="custom-metric-form-actions">
        <button
          disabled={createMetricDefinitionMutation.isPending}
          type="submit"
        >
          {createMetricDefinitionMutation.isPending
            ? "Creating..."
            : "Create custom metric"}
        </button>
        <button
          className="metrics-secondary-action"
          disabled={createMetricDefinitionMutation.isPending}
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {createMetricDefinitionMutation.isError ? (
        <p className="form-error">
          {createMetricDefinitionMutation.error.message}
        </p>
      ) : null}
    </form>
  );
}

function formatMetricSubtitle(definition: MetricDefinition): string {
  if (definition.category === "custom") return definition.unit;
  const category = definition.category
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
  return `${category} · ${definition.unit}`;
}
