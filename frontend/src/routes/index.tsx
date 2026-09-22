import { PageHeader } from "../components/page-header";
import { PageState } from "../components/page-state";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
const DASHBOARD_METRICS_PER_PAGE = 6;
const DASHBOARD_METRIC_ORDER = ["sleep_duration", "steps", "body_weight"];

function DashboardRoute() {
  const metricRailRef = useRef<HTMLDivElement>(null);
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
  const orderedDefinitions = [...metricDefinitions].sort((left, right) => {
    const leftIndex = DASHBOARD_METRIC_ORDER.indexOf(left.slug);
    const rightIndex = DASHBOARD_METRIC_ORDER.indexOf(right.slug);
    if (leftIndex < 0) return rightIndex < 0 ? 0 : 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });
  const metricPages = Array.from(
    {
      length: Math.ceil(orderedDefinitions.length / DASHBOARD_METRICS_PER_PAGE),
    },
    (_, index) =>
      orderedDefinitions.slice(
        index * DASHBOARD_METRICS_PER_PAGE,
        (index + 1) * DASHBOARD_METRICS_PER_PAGE,
      ),
  );

  function scrollMetrics(direction: -1 | 1) {
    const rail = metricRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth,
      behavior: "smooth",
    });
  }

  if (isLoading) {
    return <PageState message="Loading metric definitions..." />;
  }

  if (isError) {
    return <PageState message="Metric definitions failed to load" error />;
  }

  return (
    <section className="dashboard-screen">
      <PageHeader title="Dashboard" eyebrow={formatDashboardDate()} />

      <section className="dashboard-metrics">
        <div className="dashboard-metrics-heading">
          <h2 className="dashboard-section-title">Your metrics</h2>
          {metricPages.length > 1 ? (
            <div className="dashboard-rail-controls">
              <button
                type="button"
                aria-label="Scroll metrics left"
                onClick={() => scrollMetrics(-1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Scroll metrics right"
                onClick={() => scrollMetrics(1)}
              >
                →
              </button>
            </div>
          ) : null}
        </div>
        <div
          ref={metricRailRef}
          className="dashboard-metric-rail"
          role="region"
          aria-label="Health metrics"
          tabIndex={0}
        >
          {metricPages.map((page, pageIndex) => (
            <div
              key={page[0].id}
              className="dashboard-metric-page"
              role="group"
              aria-label={`Metrics page ${pageIndex + 1} of ${metricPages.length}`}
            >
              {page.map((definition) => (
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
          ))}
        </div>
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
            <div className="insight-navigation">
              <Link className="insight-destination" to="/analytics/sleep">
                <strong>Sleep Insights →</strong>
              </Link>
              <Link
                className="insight-destination"
                to="/analytics/weight-steps"
              >
                <strong>Weight × Steps →</strong>
              </Link>
              <Link className="insight-destination" to="/analytics/consistency">
                <strong>Consistency →</strong>
              </Link>
            </div>
          </>
        ) : (
          <p className="insights-locked">
            Upgrade to Pro for insights.{" "}
            <Link to="/settings" search={{}}>
              View plans →
            </Link>
          </p>
        )}
      </section>

      <section className="entries-card" aria-label="Metric entries">
        <div className="entries-toolbar">
          <div>
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
