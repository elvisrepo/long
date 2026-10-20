import { PageHeader } from "../components/page-header";
import { PageState } from "../components/page-state";
import { DashboardDailyTrackers } from "../components/dashboard-daily-trackers";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { DashboardMetricCard } from "../features/metrics/dashboard-metric-card";
import { EstimatedBmrCard } from "../features/profile/estimated-bmr-card";
import {
  formatMetricEntryRecordedAt,
  formatMetricEntrySource,
  formatMetricValueWithUnit,
} from "../features/metrics/metric-entry-formatters";
import { MetricEntryDialog } from "../features/metrics/metric-entry-dialog";
import type { MetricDefinition } from "../features/metrics/metric-definitions-api";
import type { MetricEntry } from "../features/metrics/metric-entries-api";
import { useCreateMetricEntryMutation } from "../features/metrics/use-create-metric-entry-mutation";
import { useConsistencyAnalyticsQuery } from "../features/metrics/use-consistency-analytics-query";
import { useDashboardMetricEntriesQuery } from "../features/metrics/use-dashboard-metric-entries-query";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";

export const Route = createFileRoute("/")({
  beforeLoad: requireAuthBeforeLoad,
  component: DashboardRoute,
});

const DASHBOARD_RECENT_ENTRY_LIMIT = 5;
const DASHBOARD_METRICS_PER_PAGE = 6;
const DASHBOARD_METRIC_ORDER = ["sleep_duration", "steps", "body_weight"];
const DASHBOARD_PREVIEW_DAYS = 7;

function DashboardRoute() {
  const metricRailRef = useRef<HTMLDivElement>(null);
  const [metricPage, setMetricPage] = useState(0);
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
  const metricSlugs = metricDefinitions.map((definition) => definition.slug);
  const {
    data: cardMetricEntries,
    isLoading: cardMetricEntriesAreLoading,
    isError: cardMetricEntriesFailed,
  } = useDashboardMetricEntriesQuery(metricSlugs);
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
  const consistencyQuery = useConsistencyAnalyticsQuery(analyticsEnabled);
  const insightPreviews = getInsightPreviews(
    cardMetricEntries,
    metricDefinitionsBySlug,
  );
  const consistencyPreview = consistencyQuery.isError
    ? "Coverage unavailable"
    : consistencyQuery.data
      ? consistencyQuery.data.summary.days_with_any_data === 0
        ? "No recent data"
        : `${consistencyQuery.data.summary.days_with_any_data} of ${consistencyQuery.data.range_days} days with data`
      : "Loading coverage...";
  const orderedDefinitions = [...metricDefinitions].sort((left, right) => {
    const leftIndex = DASHBOARD_METRIC_ORDER.indexOf(left.slug);
    const rightIndex = DASHBOARD_METRIC_ORDER.indexOf(right.slug);
    if (leftIndex < 0) return rightIndex < 0 ? 0 : 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });
  const orderedCards = [
    ...orderedDefinitions.map((definition) => ({
      key: definition.id,
      definition,
    })),
    { key: "estimated-bmr", definition: null },
  ];
  const metricPages = Array.from(
    {
      length: Math.ceil(orderedCards.length / DASHBOARD_METRICS_PER_PAGE),
    },
    (_, index) =>
      orderedCards.slice(
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

      <div className="dashboard-overview">
        <section className="dashboard-metrics">
          <div
            ref={metricRailRef}
            onScroll={(event) => {
              const rail = event.currentTarget;
              const pageWidth =
                (rail.scrollWidth - rail.clientWidth) /
                (metricPages.length - 1);
              if (pageWidth > 0)
                setMetricPage(
                  Math.max(
                    0,
                    Math.min(
                      metricPages.length - 1,
                      Math.round(rail.scrollLeft / pageWidth),
                    ),
                  ),
                );
            }}
            className="dashboard-metric-rail"
            role="region"
            aria-label="Health metrics"
            tabIndex={0}
          >
            {metricPages.map((page, pageIndex) => (
              <div
                key={page[0].key}
                className="dashboard-metric-page"
                role="group"
                aria-label={`Metrics page ${pageIndex + 1} of ${metricPages.length}`}
              >
                {page.map(({ key, definition }) =>
                  definition ? (
                    <DashboardMetricCard
                      key={definition.id}
                      category={definition.category}
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
                  ) : (
                    <EstimatedBmrCard key={key} />
                  ),
                )}
              </div>
            ))}
          </div>
          {metricPages.length > 1 ? (
            <div
              className="dashboard-rail-controls"
              role="group"
              aria-label="Metric pages"
            >
              <button
                type="button"
                aria-label="Scroll metrics left"
                onClick={() => scrollMetrics(-1)}
              >
                ←
              </button>
              <span role="status" aria-label="Metric page" aria-live="polite">
                {Math.min(metricPage + 1, metricPages.length)} of{" "}
                {metricPages.length}
              </span>
              <button
                type="button"
                aria-label="Scroll metrics right"
                onClick={() => scrollMetrics(1)}
              >
                →
              </button>
            </div>
          ) : null}
        </section>

        <DashboardDailyTrackers />
      </div>

      <section className="insights-card" aria-label="Pro insights">
        <div className="entries-toolbar dashboard-insights-heading">
          <div>
            <h2>Pro Insights</h2>
            <p className="dashboard-insights-description">
              Explore patterns across your trackers.
            </p>
          </div>
          <span className="status-pill">Pro</span>
        </div>

        {analyticsEnabled ? (
          <>
            <div className="insight-navigation">
              <Link
                className="insight-destination"
                data-insight="ai"
                to="/analytics/ai"
              >
                <InsightIcon kind="ai" />
                <strong>AI suggestions</strong>
                <span className="insight-preview">
                  Suggestions from a day, week or month of data
                </span>
              </Link>
              <Link
                className="insight-destination"
                data-insight="sleep"
                to="/analytics/sleep"
              >
                <InsightIcon kind="sleep" />
                <strong>Sleep Insights</strong>
                <span className="insight-preview">{insightPreviews.sleep}</span>
              </Link>
              <Link
                className="insight-destination"
                data-insight="weight"
                to="/analytics/weight-steps"
              >
                <InsightIcon kind="weight" />
                <strong>Weight × Steps</strong>
                <span className="insight-preview">
                  {insightPreviews.weightSteps}
                </span>
              </Link>
              <Link
                className="insight-destination"
                data-insight="consistency"
                to="/analytics/consistency"
              >
                <InsightIcon kind="consistency" />
                <strong>Consistency</strong>
                <span className="insight-preview">{consistencyPreview}</span>
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

      <details className="dashboard-source-history">
        <summary>
          Recent source entries ({recentMetricEntries.length})
          <small>Individual records · expand to inspect</small>
        </summary>
        <p className="dashboard-source-context">
          Some imported records cover part of a day. Use the metric summaries
          above for daily totals.
        </p>
        <section className="entries-card" aria-label="Metric entries">
          <div className="entries-toolbar">
            <div>
              <h2>Recent source entries</h2>
            </div>

            <div className="entries-controls">
              <label className="entries-filter">
                Filter recent entries by metric
                <select
                  value={selectedMetricSlug}
                  onChange={(event) =>
                    setSelectedMetricSlug(event.target.value)
                  }
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
                unit={
                  metricDefinitionsBySlug.get(entry.metric_definition)?.unit
                }
                value={entry.value}
              />
            ))}
          </div>
        </section>
      </details>
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

const insightIconPaths = {
  ai: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4",
  sleep: "M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z",
  weight: "M4 4v16h16M7 14l4-5 4 3 5-7",
  consistency:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 11h18m-13 5 3 3 5-5",
};

function InsightIcon({ kind }: { kind: keyof typeof insightIconPaths }) {
  return (
    <span className="dashboard-insight-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d={insightIconPaths[kind]} />
      </svg>
    </span>
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

interface InsightPreviews {
  sleep: string;
  weightSteps: string;
}

// Previews derive from the dashboard's existing bounded entry read so they
// add no API requests. Consistency uses the report's shared query above.
function getInsightPreviews(
  entries: MetricEntry[],
  definitionsBySlug: Map<string, MetricDefinition>,
): InsightPreviews {
  const previewWeek = trailingLocalDayKeys(DASHBOARD_PREVIEW_DAYS);
  const latestBySlug = new Map<string, MetricEntry>();
  for (const entry of entries) {
    if (!latestBySlug.has(entry.metric_definition)) {
      latestBySlug.set(entry.metric_definition, entry);
    }
  }

  const sleepNights = new Set(
    entries
      .filter((entry) => entry.metric_definition === "sleep_duration")
      .map(metricEntryDayKey)
      .filter((day) => previewWeek.has(day)),
  );
  const latestSleep = latestBySlug.get("sleep_duration");
  const sleep = latestSleep
    ? `Latest ${formatMetricValueWithUnit(latestSleep.value, "sleep_duration", definitionsBySlug.get("sleep_duration")?.unit)} · ${sleepNights.size} of ${DASHBOARD_PREVIEW_DAYS} nights`
    : "No sleep data yet";

  const latestWeight = latestBySlug.get("body_weight");
  const latestSteps = latestBySlug.get("steps");
  const weightParts: string[] = [];
  if (latestWeight) {
    weightParts.push(
      formatMetricValueWithUnit(
        latestWeight.value,
        "body_weight",
        definitionsBySlug.get("body_weight")?.unit,
      ),
    );
  }
  if (latestSteps) {
    weightParts.push(
      formatMetricValueWithUnit(
        latestSteps.value,
        "steps",
        definitionsBySlug.get("steps")?.unit,
      ),
    );
  }
  const weightSteps =
    weightParts.length > 0 ? weightParts.join(" · ") : "No weight or steps yet";

  return { sleep, weightSteps };
}

function metricEntryDayKey(entry: MetricEntry): string {
  return entry.local_date ?? localDayKey(new Date(entry.recorded_at));
}

function localDayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function trailingLocalDayKeys(days: number): Set<string> {
  const keys = new Set<string>();
  const today = new Date();
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    keys.add(localDayKey(day));
  }
  return keys;
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
