import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { DashboardMetricCard } from "../features/metrics/dashboard-metric-card";
import {
  formatMetricEntryRecordedAt,
  formatMetricEntrySource,
  formatMetricValueWithUnit,
} from "../features/metrics/metric-entry-formatters";
import { MetricEntryDialog } from "../features/metrics/metric-entry-dialog";
import type { MetricDefinition } from "../features/metrics/metric-definitions-api";
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
  const [entryDefinition, setEntryDefinition] =
    useState<MetricDefinition | null>(null);
  const createEntryMutation = useCreateMetricEntryMutation();
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
            Your health at a glance. Start with how you slept, moved and felt.
          </p>
        </div>
        <div className="status-pill">
          {metricDefinitions.length}{" "}
          {metricDefinitions.length === 1 ? "metric" : "metrics"} active
        </div>
      </div>

      <section aria-label="Metric definitions" className="dashboard-metrics">
        {[true, false].map((priority) => {
          const order = ["sleep_duration", "steps", "body_weight"];
          const definitions = metricDefinitions
            .filter(
              (definition) => order.includes(definition.slug) === priority,
            )
            .sort((left, right) =>
              priority
                ? order.indexOf(left.slug) - order.indexOf(right.slug)
                : 0,
            );
          if (!definitions.length) return null;
          return (
            <div key={String(priority)}>
              <h2 className="dashboard-section-title">
                {priority ? "Your daily overview" : "More metrics"}
              </h2>
              <div className="metric-grid">
                {definitions.map((definition) => (
                  <DashboardMetricCard
                    key={definition.id}
                    onAddEntry={() => setEntryDefinition(definition)}
                    latestEntry={latestEntriesByMetric.get(definition.slug)}
                    name={definition.name}
                    slug={definition.slug}
                    unit={definition.unit}
                    trendValues={getMetricTrendValues(
                      cardMetricEntries,
                      definition.slug,
                    )}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="insights-card" aria-label="Pro insights">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Pro Insights</h2>
          </div>
          <span className="status-pill">Pro</span>
        </div>

        {analyticsEnabled ? (
          <>
            <p className="insight-context">
              {latestEntriesByMetric.size} metrics with data
              {latestInsightEntry
                ? ` · Latest update ${formatMetricEntryRecordedAt(latestInsightEntry.recorded_at)} UTC`
                : " · No data yet"}
            </p>
            <p className="insight-guidance">
              Start with your sleep: compare your recent nights with your
              personal target.
            </p>
            <div className="insight-navigation">
              <Link className="insight-destination" to="/analytics/sleep">
                <strong>Sleep Insights →</strong>
                <span>See your shortfall and adjust your nightly target.</span>
              </Link>
              <Link
                className="insight-destination"
                to="/analytics/weight-steps"
              >
                <strong>Weight × Steps →</strong>
                <span>Explore weight and movement trends together.</span>
              </Link>
              <Link className="insight-destination" to="/analytics/consistency">
                <strong>Consistency →</strong>
                <span>Find gaps in your records and keep them up to date.</span>
              </Link>
            </div>
          </>
        ) : (
          <p className="insights-locked">
            Upgrade to Pro to unlock trend summaries and advanced analytics.{" "}
            <Link to="/settings" search={{}}>
              View plans →
            </Link>
          </p>
        )}
      </section>

      <section className="entries-card" aria-label="Metric entries">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Manual and synced records</p>
            <h2>Recent Entries</h2>
          </div>

          <div className="entries-controls">
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
        </div>

        {cardMetricEntriesAreLoading || metricEntriesAreLoading ? (
          <p>Loading metric entries...</p>
        ) : null}
        {cardMetricEntriesFailed || metricEntriesFailed ? (
          <p>Metric entries failed to load</p>
        ) : null}

        {!metricEntriesAreLoading &&
        !metricEntriesFailed &&
        recentMetricEntries.length === 0 ? (
          <p className="empty-state">
            No entries yet{selectedMetricSlug ? " for this metric" : ""}. Use
            Add entry on a metric card to get started.
          </p>
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
      {entryDefinition ? (
        <MetricEntryDialog
          metricDefinition={entryDefinition}
          isPending={createEntryMutation.isPending}
          onClose={() => setEntryDefinition(null)}
          onSubmit={createEntryMutation.mutateAsync}
        />
      ) : null}
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
