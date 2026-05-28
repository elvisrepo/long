import { Link, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { useCreateMetricEntryMutation } from "../features/metrics/use-create-metric-entry-mutation";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";

export const Route = createFileRoute("/")({
  beforeLoad: requireAuthBeforeLoad,
  component: DashboardRoute,
});

function DashboardRoute() {
  const [selectedMetricSlug, setSelectedMetricSlug] = useState("");
  const {
    data: metricDefinitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery();
  const {
    data: metricEntries = [],
    isLoading: metricEntriesAreLoading,
    isError: metricEntriesFailed,
  } = useMetricEntriesQuery(
    selectedMetricSlug ? { metric: selectedMetricSlug } : {},
  );
  const metricDefinitionsBySlug = new Map(
    metricDefinitions.map((definition) => [definition.slug, definition]),
  );
  const latestEntriesByMetric = new Map<
    string,
    (typeof metricEntries)[number]
  >();

  for (const entry of metricEntries) {
    if (!latestEntriesByMetric.has(entry.metric_definition)) {
      latestEntriesByMetric.set(entry.metric_definition, entry);
    }
  }

  if (isLoading) {
    return <p>Loading metric definitions...</p>;
  }

  if (isError) {
    return <p>Metric definitions failed to load</p>;
  }

  return (
    <section className="dashboard-screen">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Mar 7 · Manual tracking</p>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Good morning. Track the baseline metrics that matter.
          </p>
        </div>
        <div className="status-pill">
          {metricDefinitions.length} metrics active
        </div>
      </div>

      <div className="metric-grid" aria-label="Metric definitions">
        {metricDefinitions.map((definition) => (
          <article className="metric-card" key={definition.id}>
            <div className="metric-card-header">
              <Link
                className="metric-card-link"
                params={{ slug: definition.slug }}
                to="/metrics/$slug"
              >
                <p className="chip-label">
                  {definition.category} · {definition.unit}
                </p>
                <h2>{definition.name}</h2>
              </Link>
              <p className="metric-meta">{definition.slug}</p>
          </div>

            <MetricDefinitionValue
              entry={latestEntriesByMetric.get(definition.slug)}
              unit={definition.unit}
            />

            <MetricEntryForm
              metricName={definition.name}
              metricSlug={definition.slug}
            />
          </article>
        ))}
      </div>

      <section className="entries-card" aria-label="Metric entries">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Recorded manually</p>
            <h2>Recent Entries</h2>
          </div>

          <label className="entries-filter">
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
        </div>

        {metricEntriesAreLoading ? <p>Loading metric entries...</p> : null}
        {metricEntriesFailed ? <p>Metric entries failed to load</p> : null}

        <div className="entry-list">
          {metricEntries.map((entry) => (
            <MetricEntrySummary
              key={entry.id}
              metricName={
                metricDefinitionsBySlug.get(entry.metric_definition)?.name ??
                entry.metric_definition
              }
              metricSlug={entry.metric_definition}
              recordedAt={entry.recorded_at}
              source={entry.source}
              unit={metricDefinitionsBySlug.get(entry.metric_definition)?.unit}
              value={entry.value}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

interface MetricDefinitionValueProps {
  entry:
    | {
        value: number;
      }
    | undefined;
  unit: string;
}

function MetricDefinitionValue({ entry, unit }: MetricDefinitionValueProps) {
  return (
    <div className="metric-current-value">
      <span>{entry?.value ?? "—"}</span>
      <small>{unit}</small>
    </div>
  );
}

interface MetricEntrySummaryProps {
  metricName: string;
  metricSlug: string;
  recordedAt: string;
  source: string;
  unit: string | undefined;
  value: number;
}

function MetricEntrySummary({
  metricName,
  metricSlug,
  recordedAt,
  source,
  unit,
  value,
}: MetricEntrySummaryProps) {
  const displayValue = unit ? `${value} ${unit}` : value;
  const displayRecordedAt = formatMetricEntryRecordedAt(recordedAt);

  return (
    <article className="entry-row">
      <div>
        <Link
          className="entry-link"
          params={{ slug: metricSlug }}
          to="/metrics/$slug"
        >
          {metricName}
        </Link>
        <p className="entry-time">
          <time dateTime={recordedAt}>{displayRecordedAt}</time>
          <span className="entry-source">{source}</span>
        </p>
      </div>
      <p className="entry-value">{displayValue}</p>
    </article>
  );
}

function formatMetricEntryRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(recordedAt));
}

interface MetricEntryFormProps {
  metricName: string;
  metricSlug: string;
}

function MetricEntryForm({ metricName, metricSlug }: MetricEntryFormProps) {
  const [value, setValue] = useState("");
  const createMetricEntryMutation = useCreateMetricEntryMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createMetricEntryMutation.mutateAsync({
        metricDefinition: metricSlug,
        value: Number(value),
        recordedAt: new Date().toISOString(),
        context: {},
      });

      setValue("");
    } catch {
      // The mutation state below renders the error message.
    }
  }

  return (
    <form className="metric-form" onSubmit={handleSubmit}>
      <label>
        {metricName} value
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          type="number"
        />
      </label>

      <button disabled={createMetricEntryMutation.isPending} type="submit">
        {createMetricEntryMutation.isPending
          ? "Logging..."
          : `Log ${metricName}`}
      </button>

      {createMetricEntryMutation.isError ? (
        <p className="form-error">{createMetricEntryMutation.error.message}</p>
      ) : null}
    </form>
  );
}
