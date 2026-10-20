import { PageHeader } from "../components/page-header";
import { PageState } from "../components/page-state";
import { Modal } from "../components/modal";
import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { metricSymbol } from "../features/metrics/metric-symbol";
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
  const [filter, setFilter] = useState<
    "all" | "built-in" | "custom" | "archived"
  >("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const {
    data: metricDefinitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery({ includeInactive: true });
  const {
    data: metricUsage,
    isLoading: isMetricUsageLoading,
    isError: isMetricUsageError,
  } = useMetricUsageQuery();

  if (isLoading || isMetricUsageLoading) {
    return <MetricsCatalogLoading />;
  }

  if (isError || isMetricUsageError || !metricUsage) {
    return <PageState message="Metrics failed to load" error />;
  }

  const activeMetricDefinitions = metricDefinitions.filter(
    (definition) => definition.is_active,
  );
  const defaultMetricDefinitions = activeMetricDefinitions.filter(
    (definition) => definition.is_default,
  );
  const customMetricDefinitions = activeMetricDefinitions.filter(
    (definition) => !definition.is_default,
  );
  const archivedCustomMetricDefinitions = metricDefinitions.filter(
    (definition) => !definition.is_active && !definition.is_default,
  );
  const { used, limit } = metricUsage.active_custom_metrics;

  return (
    <section className="metrics-screen">
      <PageHeader
        title="Metrics"
        eyebrow="Metric catalog"
        description="Choose a metric to view its history and log entries."
        actions={
          <span className="status-pill">
            {activeMetricDefinitions.length} available
          </span>
        }
      />

      <section className="metrics-creation" aria-label="Custom metric creation">
        <div>
          <strong>Track something of your own</strong>
          <p
            aria-label={`${used} of ${limit} custom metrics used`}
            className={`custom-metric-usage ${used >= limit ? "custom-metric-usage-limit" : ""}`}
            role="status"
          >
            {used} of {limit} custom metrics used
          </p>
        </div>
        <button
          aria-haspopup="dialog"
          className="metrics-primary-action"
          type="button"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          + New custom metric
        </button>
      </section>

      <nav
        className="metrics-catalog-filters"
        aria-label="Metric catalog filters"
      >
        {(
          [
            ["all", `All (${activeMetricDefinitions.length})`],
            ["built-in", `Built-in (${defaultMetricDefinitions.length})`],
            ["custom", `Custom (${customMetricDefinitions.length})`],
            [
              "archived",
              `Archived (${archivedCustomMetricDefinitions.length})`,
            ],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {isCreateDialogOpen ? (
        <Modal
          labelledBy="create-metric-title"
          className="metric-catalog-dialog"
          closeOnBackdrop
          onClose={() => setIsCreateDialogOpen(false)}
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
            definitions={metricDefinitions}
            onCancel={() => setIsCreateDialogOpen(false)}
            onCreated={() => {
              setIsCreateDialogOpen(false);
              setFilter("custom");
            }}
          />
        </Modal>
      ) : null}

      {filter === "all" || filter === "custom" ? (
        <section aria-label="Custom metrics" className="metrics-cards-grid">
          <div className="metrics-section-header">
            <h2>Custom metrics</h2>
            <small>{customMetricDefinitions.length} available</small>
          </div>
          {customMetricDefinitions.length === 0 ? (
            <p className="metrics-empty">
              No custom metrics yet. Create one to track anything else.
            </p>
          ) : null}
          {customMetricDefinitions.map((definition) => (
            <MetricDefinitionRow definition={definition} key={definition.id} />
          ))}
        </section>
      ) : null}
      {filter === "all" || filter === "built-in" ? (
        <section aria-label="Built-in metrics" className="metrics-cards-grid">
          <div className="metrics-section-header">
            <h2>Built-in metrics</h2>
            <small>{defaultMetricDefinitions.length} available</small>
          </div>
          {defaultMetricDefinitions.map((definition) => (
            <MetricDefinitionRow definition={definition} key={definition.id} />
          ))}
        </section>
      ) : null}
      {filter === "archived" ? (
        <section
          id="archived-metrics"
          aria-label="Archived custom metrics"
          className="metrics-cards-grid"
        >
          <div className="metrics-section-header">
            <h2>Archived custom metrics</h2>
            <small>{archivedCustomMetricDefinitions.length} archived</small>
          </div>
          {archivedCustomMetricDefinitions.length === 0 ? (
            <p className="metrics-empty">No archived custom metrics.</p>
          ) : null}
          {archivedCustomMetricDefinitions.map((definition) => (
            <ArchivedMetricDefinitionRow
              definition={definition}
              key={definition.id}
            />
          ))}
          <p className="metrics-empty">
            Archiving preserves past entries and frees a custom metric slot.
          </p>
        </section>
      ) : null}
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
    <article
      className="metric-catalog-row metric-catalog-row-archived"
      data-category={definition.category}
      data-metric={definition.slug}
    >
      <div className="metric-catalog-open">
        <span className="metric-card-symbol" aria-hidden="true">
          {metricSymbol(definition.slug, definition.name)}
        </span>
        <div className="metric-catalog-label">
          <h2>{definition.name}</h2>
          <p>
            {formatMetricSubtitle(definition)} ·{" "}
            <span className="archived-status-pill">Archived</span>
          </p>
        </div>
        <button
          aria-label={`${reactivateMetricDefinitionMutation.isPending ? "Restoring" : "Restore"} ${definition.name}`}
          className="metrics-secondary-action"
          disabled={reactivateMetricDefinitionMutation.isPending}
          type="button"
          onClick={() => void handleReactivate()}
        >
          {reactivateMetricDefinitionMutation.isPending
            ? "Restoring..."
            : "Restore"}
        </button>
      </div>
      {reactivateError ? (
        <p className="form-error" role="alert">
          {reactivateError}
        </p>
      ) : null}
    </article>
  );
}

interface MetricDefinitionRowProps {
  definition: MetricDefinition;
}

function MetricDefinitionRow({ definition }: MetricDefinitionRowProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [dialog, setDialog] = useState<"edit" | "archive" | null>(null);
  const [name, setName] = useState(definition.name);
  const [unit, setUnit] = useState(definition.unit);
  const [minValue, setMinValue] = useState(String(definition.min_value));
  const [maxValue, setMaxValue] = useState(String(definition.max_value));
  const [editError, setEditError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const updateMutation = useUpdateMetricDefinitionMutation();
  const archiveMutation = useDeactivateMetricDefinitionMutation();

  function openDialog(next: "edit" | "archive") {
    const menu = menuRef.current;
    if (menu) {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
    setName(definition.name);
    setUnit(definition.unit);
    setMinValue(String(definition.min_value));
    setMaxValue(String(definition.max_value));
    setEditError(null);
    setArchiveError(null);
    setDialog(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Number(minValue) >= Number(maxValue)) {
      setEditError("Maximum value must be greater than minimum value.");
      return;
    }
    try {
      setEditError(null);
      await updateMutation.mutateAsync({
        id: definition.id,
        input: {
          name,
          unit,
          minValue: Number(minValue),
          maxValue: Number(maxValue),
        },
      });
      setDialog(null);
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Metric definition request failed",
      );
    }
  }

  async function handleArchive() {
    try {
      setArchiveError(null);
      await archiveMutation.mutateAsync(definition.id);
      setDialog(null);
    } catch (error) {
      setArchiveError(
        error instanceof Error
          ? error.message
          : "Metric definition request failed",
      );
    }
  }

  return (
    <>
      <article
        className="metric-catalog-row"
        data-category={definition.category}
        data-metric={definition.slug}
        data-custom={!definition.is_default || undefined}
      >
        <Link
          className="metric-catalog-open"
          params={{ slug: definition.slug }}
          to="/metrics/$slug"
        >
          <span className="metric-card-symbol" aria-hidden="true">
            {metricSymbol(definition.slug, definition.name)}
          </span>
          <div className="metric-catalog-label">
            <h2>{definition.name}</h2>
            <p>{formatMetricSubtitle(definition)}</p>
          </div>
          <span className="metric-catalog-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        {!definition.is_default ? (
          <details
            className="metric-catalog-menu"
            ref={menuRef}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label={`Manage ${definition.name}`}>⋯</summary>
            <div>
              <button
                aria-label={`Edit ${definition.name}`}
                type="button"
                onClick={() => openDialog("edit")}
              >
                Edit metric
              </button>
              <button
                aria-label={`Archive ${definition.name}`}
                type="button"
                onClick={() => openDialog("archive")}
              >
                Archive metric
              </button>
            </div>
          </details>
        ) : null}
      </article>
      {dialog === "edit" ? (
        <Modal
          labelledBy={`edit-${definition.id}-title`}
          className="metric-catalog-dialog"
          closeOnBackdrop
          busy={updateMutation.isPending}
          onClose={() => setDialog(null)}
        >
          <div className="metric-dialog-header">
            <h2 id={`edit-${definition.id}-title`}>Edit {definition.name}</h2>
            <button
              aria-label="Close dialog"
              className="metric-dialog-close"
              type="button"
              disabled={updateMutation.isPending}
              onClick={() => setDialog(null)}
            >
              ×
            </button>
          </div>
          <form className="metric-catalog-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={120}
                aria-label={`${definition.name} name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                required
                maxLength={32}
                aria-label={`${definition.name} unit`}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              />
            </label>
            <div>
              <div className="metric-catalog-range">
                <label>
                  Minimum value
                  <input
                    required
                    type="number"
                    step="any"
                    aria-label={`${definition.name} min value`}
                    value={minValue}
                    onChange={(event) => setMinValue(event.target.value)}
                  />
                </label>
                <label>
                  Maximum value
                  <input
                    required
                    type="number"
                    step="any"
                    aria-label={`${definition.name} max value`}
                    value={maxValue}
                    onChange={(event) => setMaxValue(event.target.value)}
                  />
                </label>
              </div>
              <p className="metric-field-hint">
                Allowed entry range, not a health target.
              </p>
            </div>
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="metric-dialog-actions">
              <button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending
                  ? "Saving..."
                  : `Save ${definition.name}`}
              </button>
              <button
                disabled={updateMutation.isPending}
                className="metrics-secondary-action"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog === "archive" ? (
        <Modal
          labelledBy={`archive-${definition.id}-title`}
          className="metric-deactivate-dialog"
          closeOnBackdrop
          busy={archiveMutation.isPending}
          onClose={() => setDialog(null)}
        >
          <div className="metric-dialog-header">
            <h2 id={`archive-${definition.id}-title`}>
              Archive {definition.name}?
            </h2>
            <button
              aria-label="Close dialog"
              className="metric-dialog-close"
              disabled={archiveMutation.isPending}
              type="button"
              onClick={() => setDialog(null)}
            >
              ×
            </button>
          </div>
          <p className="metric-dialog-copy">
            Entries are kept. The metric moves to Archived, logging stops, and
            one custom metric slot is freed.
          </p>
          {archiveError ? (
            <p className="form-error" role="alert">
              {archiveError}
            </p>
          ) : null}
          <div className="metric-dialog-actions">
            <button
              className="metric-danger-action"
              disabled={archiveMutation.isPending}
              type="button"
              onClick={() => void handleArchive()}
            >
              {archiveMutation.isPending ? "Archiving..." : "Archive metric"}
            </button>
            <button
              className="metrics-secondary-action"
              disabled={archiveMutation.isPending}
              type="button"
              onClick={() => setDialog(null)}
            >
              Keep it
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

interface CreateCustomMetricFormProps {
  definitions: MetricDefinition[];
  onCancel: () => void;
  onCreated: () => void;
}

function generatedMetricIdentifier(
  name: string,
  definitions: MetricDefinition[],
): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "metric";
  const existing = new Set(definitions.map((definition) => definition.slug));
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    const ending = `_${suffix++}`;
    candidate = base.slice(0, 80 - ending.length) + ending;
  }
  return candidate;
}

function CreateCustomMetricForm({
  definitions,
  onCancel,
  onCreated,
}: CreateCustomMetricFormProps) {
  const [name, setName] = useState("");
  const [manualIdentifier, setManualIdentifier] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [unit, setUnit] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateMetricDefinitionMutation();
  const slug =
    manualIdentifier ??
    (name.trim() ? generatedMetricIdentifier(name, definitions) : "");

  function revealIdentifier() {
    setAdvancedOpen(true);
    requestAnimationFrame(() => identifierRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || slug.length > 80 || !/^[-a-zA-Z0-9_]+$/.test(slug)) {
      setFormError(
        "Use an identifier of 1–80 letters, numbers, hyphens or underscores.",
      );
      revealIdentifier();
      return;
    }
    if (Number(minValue) >= Number(maxValue)) {
      setFormError("Maximum value must be greater than minimum value.");
      return;
    }
    try {
      setFormError(null);
      await createMutation.mutateAsync({
        name,
        slug,
        unit,
        minValue: Number(minValue),
        maxValue: Number(maxValue),
      });
      onCreated();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Metric definition request failed";
      setFormError(message);
      if (/slug|identifier/i.test(message)) revealIdentifier();
    }
  }

  return (
    <form className="metric-catalog-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input
          autoFocus
          required
          maxLength={120}
          value={name}
          placeholder="What do you want to track?"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Unit
        <input
          required
          maxLength={32}
          value={unit}
          placeholder="e.g. score, minutes, cups"
          onChange={(event) => setUnit(event.target.value)}
        />
      </label>
      <div>
        <div className="metric-catalog-range">
          <label>
            Minimum value
            <input
              required
              type="number"
              step="any"
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
            />
          </label>
          <label>
            Maximum value
            <input
              required
              type="number"
              step="any"
              value={maxValue}
              onChange={(event) => setMaxValue(event.target.value)}
            />
          </label>
        </div>
        <p className="metric-field-hint">
          Allowed entry range, not a health target.
        </p>
      </div>
      <details
        className="metric-catalog-advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>Advanced · Metric identifier</summary>
        <label>
          Identifier
          <input
            ref={identifierRef}
            maxLength={80}
            value={slug}
            onChange={(event) => setManualIdentifier(event.target.value)}
          />
        </label>
        <p className="metric-field-hint">
          Generated from the name, avoiding existing metrics. Edit if needed;
          the server also checks uniqueness.
        </p>
      </details>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="metric-dialog-actions">
        <button disabled={createMutation.isPending} type="submit">
          {createMutation.isPending ? "Creating..." : "Create custom metric"}
        </button>
        <button
          className="metrics-secondary-action"
          disabled={createMutation.isPending}
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
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
