import { Link, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import {
  formatMetricEntrySource,
  formatMetricValue,
} from "../features/metrics/metric-entry-formatters";
import { useCreateMetricEntryMutation } from "../features/metrics/use-create-metric-entry-mutation";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";

export const Route = createFileRoute("/")({
  beforeLoad: requireAuthBeforeLoad,
  component: DashboardRoute,
});

const DASHBOARD_RECENT_ENTRY_LIMIT = 5;
const DASHBOARD_CARD_ENTRY_LIMIT = 50;

function DashboardRoute() {
  const [selectedMetricSlug, setSelectedMetricSlug] = useState("");
  const {
    data: metricDefinitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery();
  const currentSubscriptionQuery = useCurrentSubscriptionQuery();
  const {
    data: cardMetricEntries = [],
    isLoading: cardMetricEntriesAreLoading,
    isError: cardMetricEntriesFailed,
  } = useMetricEntriesQuery({ limit: DASHBOARD_CARD_ENTRY_LIMIT });
  const {
    data: recentMetricEntries = [],
    isLoading: metricEntriesAreLoading,
    isError: metricEntriesFailed,
  } = useMetricEntriesQuery(
    selectedMetricSlug
      ? { metric: selectedMetricSlug, limit: DASHBOARD_RECENT_ENTRY_LIMIT }
      : { limit: DASHBOARD_RECENT_ENTRY_LIMIT },
  );
  const metricDefinitionsBySlug = new Map(
    metricDefinitions.map((definition) => [definition.slug, definition]),
  );
  const latestEntriesByMetric = new Map<
    string,
    (typeof cardMetricEntries)[number]
  >();

  for (const entry of cardMetricEntries) {
    if (!latestEntriesByMetric.has(entry.metric_definition)) {
      latestEntriesByMetric.set(entry.metric_definition, entry);
    }
  }

  const analyticsEnabled =
    currentSubscriptionQuery.data?.plan.analytics_enabled === true;
  const latestInsightEntry = [...latestEntriesByMetric.values()].sort(
    (left, right) =>
      new Date(right.recorded_at).getTime() -
      new Date(left.recorded_at).getTime(),
  )[0];

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
              metricSlug={definition.slug}
              unit={definition.unit}
            />

            <MetricEntryForm
              metricName={definition.name}
              metricSlug={definition.slug}
            />
          </article>
        ))}
      </div>

      <section className="insights-card" aria-label="Pro insights">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Pro Insights</h2>
          </div>
          <div className="status-pill">
            {analyticsEnabled ? "Unlocked" : "Pro"}
          </div>
        </div>

        {analyticsEnabled ? (
          <div className="insights-grid">
            <article>
              <p className="meta-label">Coverage</p>
              <p className="insight-value">
                {latestEntriesByMetric.size} metrics with data
              </p>
            </article>
            <article>
              <p className="meta-label">Freshness</p>
              <p className="insight-value">
                {latestInsightEntry
                  ? `Latest update ${formatMetricEntryRecordedAt(
                      latestInsightEntry.recorded_at,
                    )}`
                  : "No data yet"}
              </p>
            </article>
          </div>
        ) : (
          <p className="insights-locked">
            Upgrade to Pro to unlock trend summaries and advanced analytics.
          </p>
        )}
      </section>

      <section className="entries-card" aria-label="Metric entries">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Manual and synced records</p>
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

        {cardMetricEntriesAreLoading || metricEntriesAreLoading ? (
          <p>Loading metric entries...</p>
        ) : null}
        {cardMetricEntriesFailed || metricEntriesFailed ? (
          <p>Metric entries failed to load</p>
        ) : null}

        <div className="entry-list">
          {recentMetricEntries.map((entry) => (
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
  metricSlug: string;
  unit: string;
}

function MetricDefinitionValue({
  entry,
  metricSlug,
  unit,
}: MetricDefinitionValueProps) {
  return (
    <div className="metric-current-value">
      <span>{entry ? formatMetricValue(entry.value, metricSlug) : "—"}</span>
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
  const formattedValue = formatMetricValue(value, metricSlug);
  const displayValue = unit ? `${formattedValue} ${unit}` : formattedValue;
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
          <span className="entry-source">
            {formatMetricEntrySource(source)}
          </span>
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
