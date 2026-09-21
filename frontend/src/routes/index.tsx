import { Link, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { DashboardMetricCard } from "../features/metrics/dashboard-metric-card";
import {
  formatMetricEntrySource,
  formatMetricValue,
  formatMetricValueWithUnit,
} from "../features/metrics/metric-entry-formatters";
import type { MetricEntry } from "../features/metrics/metric-entries-api";
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
          <p className="eyebrow">{formatDashboardDate()} · Health overview</p>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Good morning. Track the baseline metrics that matter.
          </p>
        </div>
        <div className="status-pill">
          {metricDefinitions.length}{" "}
          {metricDefinitions.length === 1 ? "metric" : "metrics"} active
        </div>
      </div>

      <div className="metric-grid" aria-label="Metric definitions">
        {metricDefinitions.map((definition) => {
          const latestEntry = latestEntriesByMetric.get(definition.slug);

          return (
            <DashboardMetricCard
              category={definition.category}
              form={
                <MetricEntryForm
                  metricName={definition.name}
                  metricSlug={definition.slug}
                />
              }
              isFeatured={definition.slug === "sleep_duration"}
              key={definition.id}
              latestValue={latestEntry?.value}
              name={definition.name}
              slug={definition.slug}
              trendValues={getMetricTrendValues(
                cardMetricEntries,
                definition.slug,
              )}
              unit={definition.unit}
            />
          );
        })}
      </div>

      <section className="insights-card" aria-label="Pro insights">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Pro Insights</h2>
          </div>
          <div className="insights-actions">
            <div className="status-pill">
              {analyticsEnabled ? "Unlocked" : "Pro"}
            </div>
            {analyticsEnabled ? (
              <Link
                className="insights-action-link"
                to="/analytics/weight-steps"
              >
                Weight × Steps →
              </Link>
            ) : null}
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
  const displayValue = formatMetricValueWithUnit(value, metricSlug, unit);
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

function formatDashboardDate() {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function getMetricTrendValues(entries: MetricEntry[], metricSlug: string) {
  return entries
    .filter((entry) => entry.metric_definition === metricSlug)
    .sort(
      (left, right) =>
        new Date(left.recorded_at).getTime() -
        new Date(right.recorded_at).getTime(),
    )
    .map((entry) => entry.value);
}

interface MetricEntryFormProps {
  metricName: string;
  metricSlug: string;
}

function MetricEntryForm({ metricName, metricSlug }: MetricEntryFormProps) {
  const [value, setValue] = useState("");
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const createMetricEntryMutation = useCreateMetricEntryMutation();
  const isSleepDuration = metricSlug === "sleep_duration";
  const sleepDurationHours = getSleepDurationHours(bedtime, wakeTime);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const input = isSleepDuration
      ? getSleepEntryInput(metricSlug, bedtime, wakeTime)
      : {
          metricDefinition: metricSlug,
          value: Number(value),
          recordedAt: new Date().toISOString(),
          context: {},
        };

    if (!input) {
      setValidationError("Wake time must be later than bedtime.");
      return;
    }

    try {
      await createMetricEntryMutation.mutateAsync(input);

      setValue("");
      setBedtime("");
      setWakeTime("");
    } catch {
      // The mutation state below renders the error message.
    }
  }

  return (
    <form className="metric-form" onSubmit={handleSubmit}>
      {isSleepDuration ? (
        <>
          <label>
            Bedtime
            <input
              required
              type="datetime-local"
              value={bedtime}
              onChange={(event) => setBedtime(event.target.value)}
            />
          </label>
          <label>
            Wake time
            <input
              required
              type="datetime-local"
              value={wakeTime}
              onChange={(event) => setWakeTime(event.target.value)}
            />
          </label>
          {sleepDurationHours !== undefined ? (
            <p className="metric-form-preview">
              Calculated duration:{" "}
              {formatMetricValue(sleepDurationHours, metricSlug)}
            </p>
          ) : null}
        </>
      ) : (
        <label>
          {metricName} value
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type="number"
          />
        </label>
      )}

      <button disabled={createMetricEntryMutation.isPending} type="submit">
        {createMetricEntryMutation.isPending
          ? "Logging..."
          : `Log ${metricName}`}
      </button>

      {validationError ? <p className="form-error">{validationError}</p> : null}

      {createMetricEntryMutation.isError ? (
        <p className="form-error">{createMetricEntryMutation.error.message}</p>
      ) : null}
    </form>
  );
}

function getSleepDurationHours(bedtime: string, wakeTime: string) {
  if (!bedtime || !wakeTime) {
    return undefined;
  }

  const durationMilliseconds =
    new Date(wakeTime).getTime() - new Date(bedtime).getTime();

  return durationMilliseconds > 0
    ? durationMilliseconds / (60 * 60 * 1000)
    : undefined;
}

function getSleepEntryInput(
  metricDefinition: string,
  bedtime: string,
  wakeTime: string,
) {
  if (getSleepDurationHours(bedtime, wakeTime) === undefined) {
    return undefined;
  }

  return {
    metricDefinition,
    periodStart: new Date(bedtime).toISOString(),
    recordedAt: new Date(wakeTime).toISOString(),
    context: {},
  };
}
