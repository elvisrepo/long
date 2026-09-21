import { MetricEntryDialog } from "../features/metrics/metric-entry-dialog";
import {
  formatDateTimeLocalInput,
  isValidSleepWindow,
  parseMetricEntryValue,
} from "../features/metrics/metric-entry-input";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createPortal } from "react-dom";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import {
  formatMetricEntrySource,
  formatMetricValue,
  formatMetricValueWithUnit,
  formatSleepDate,
  formatSleepWindow,
} from "../features/metrics/metric-entry-formatters";
import { MetricTrendChart } from "../features/metrics/metric-trend-chart";
import { useCreateMetricEntryMutation } from "../features/metrics/use-create-metric-entry-mutation";
import { useDeleteMetricEntryMutation } from "../features/metrics/use-delete-metric-entry-mutation";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import {
  type GetMetricEntriesFilters,
  type MetricEntry,
} from "../features/metrics/metric-entries-api";
import type { MetricDefinition } from "../features/metrics/metric-definitions-api";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useUpdateMetricEntryMutation } from "../features/metrics/use-update-metric-entry-mutation";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";

export const Route = createFileRoute("/metrics/$slug")({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricDetailRoute,
  validateSearch: (search: Record<string, unknown>): MetricDetailSearch => ({
    date: isUtcDate(search.date) ? search.date : undefined,
  }),
});

interface MetricDetailSearch {
  date?: string;
}

const metricEntryRanges = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: null },
] as const;

const METRIC_DETAIL_ENTRY_LIMIT = 50;

type MetricEntryRange = (typeof metricEntryRanges)[number];

function MetricDetailRoute() {
  const { slug } = Route.useParams();
  const { date: selectedDate } = Route.useSearch();
  const [selectedRange, setSelectedRange] = useState<MetricEntryRange>(
    metricEntryRanges[3],
  );
  const [selectedRangeFrom, setSelectedRangeFrom] = useState<
    string | undefined
  >(undefined);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isAddingMetricEntry, setIsAddingMetricEntry] = useState(false);
  const [entryPendingDeletion, setEntryPendingDeletion] =
    useState<MetricEntry | null>(null);
  const [entryActionError, setEntryActionError] = useState<string | null>(null);
  const metricEntryFilters: GetMetricEntriesFilters = selectedDate
    ? {
        metric: slug,
        from: `${selectedDate}T00:00:00.000Z`,
        to: `${selectedDate}T23:59:59.999Z`,
        limit: METRIC_DETAIL_ENTRY_LIMIT,
      }
    : selectedRangeFrom
      ? {
          metric: slug,
          from: selectedRangeFrom,
          limit: METRIC_DETAIL_ENTRY_LIMIT,
        }
      : { metric: slug, limit: METRIC_DETAIL_ENTRY_LIMIT };
  const {
    data: metricDefinitions = [],
    isLoading: definitionsAreLoading,
    isError: definitionsFailed,
  } = useMetricDefinitionsQuery();
  const {
    data: metricEntries = [],
    isLoading: entriesAreLoading,
    isError: entriesFailed,
  } = useMetricEntriesQuery(metricEntryFilters);
  const updateMetricEntryMutation = useUpdateMetricEntryMutation();
  const deleteMetricEntryMutation = useDeleteMetricEntryMutation();
  const createMetricEntryMutation = useCreateMetricEntryMutation();

  if (definitionsAreLoading) {
    return <p>Loading metric...</p>;
  }

  if (definitionsFailed) {
    return <p>Metric failed to load</p>;
  }

  const metricDefinition = metricDefinitions.find(
    (definition) => definition.slug === slug,
  );

  if (!metricDefinition) {
    return <p>Metric not found</p>;
  }

  const latestEntry = metricEntries[0];
  const formattedLatestValue = latestEntry
    ? formatMetricValue(latestEntry.value, metricDefinition.slug)
    : undefined;
  const valueRange = `${metricDefinition.min_value}-${metricDefinition.max_value} ${metricDefinition.unit}`;
  const oldestEntry = metricEntries.at(-1);
  const trendDelta =
    latestEntry && oldestEntry
      ? latestEntry.value - oldestEntry.value
      : undefined;
  const formattedTrendDelta =
    trendDelta === undefined
      ? "—"
      : `${trendDelta > 0 ? "+" : ""}${formatMetricValueWithUnit(trendDelta, metricDefinition.slug, metricDefinition.unit)}`;

  function handleRangeSelect(range: MetricEntryRange) {
    if (selectedRange.label === range.label) {
      return;
    }

    setSelectedRange(range);
    setSelectedRangeFrom(
      range.days === null ? undefined : getRangeStartIso(range.days),
    );
  }

  async function handleDeleteEntry(entryId: number) {
    setEntryActionError(null);

    try {
      await deleteMetricEntryMutation.mutateAsync(entryId);
      setEntryPendingDeletion(null);
    } catch (error) {
      setEntryActionError(getErrorMessage(error));
    }
  }

  async function handleUpdateEntry(
    entry: MetricEntry,
    input: {
      value?: number;
      periodStart?: string;
      recordedAt: string;
      context: Record<string, unknown>;
    },
  ) {
    setEntryActionError(null);

    try {
      await updateMetricEntryMutation.mutateAsync({
        id: entry.id,
        input,
      });
      setEditingEntryId(null);
    } catch (error) {
      setEntryActionError(getErrorMessage(error));
    }
  }

  return (
    <section
      className={`metric-detail-screen metric-detail-screen-${metricDefinition.slug}`}
    >
      <nav aria-label="Breadcrumb" className="metric-detail-breadcrumb">
        <Link to="/metrics">Metrics</Link>
        <span aria-hidden="true">/</span>
        <span>{metricDefinition.name}</span>
      </nav>

      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Metric detail</p>
          <h1 className="dashboard-title">{metricDefinition.name}</h1>
          <p className="metric-detail-meta">
            {metricDefinition.category.replaceAll("_", " ")} ·{" "}
            {metricDefinition.unit}
          </p>
        </div>
        <div className="metric-detail-hero-actions">
          <button
            className="metrics-primary-action"
            type="button"
            onClick={() => setIsAddingMetricEntry(true)}
          >
            {getAddEntryActionLabel(metricDefinition)}
          </button>
          {metricDefinition.slug === "body_weight" ||
          metricDefinition.slug === "steps" ||
          metricDefinition.slug === "sleep_duration" ? (
            <MetricAnalyticsLink metricSlug={metricDefinition.slug} />
          ) : null}
          <div className="status-pill">
            {formatMetricEntryCount(metricEntries.length)}
          </div>
        </div>
      </div>

      <section className="metric-detail-summary" aria-label="Metric summary">
        <article className="metric-detail-stat metric-detail-stat-primary">
          <p className="meta-label">Latest value</p>
          <p
            aria-label={
              metricDefinition.slug === "sleep_duration"
                ? (formattedLatestValue ?? "No value")
                : `${formattedLatestValue ?? "No value"} ${metricDefinition.unit}`
            }
            className="metric-detail-value"
          >
            <span>{formattedLatestValue ?? "—"}</span>
            {metricDefinition.slug === "sleep_duration" ? null : (
              <small>{metricDefinition.unit}</small>
            )}
          </p>
          {latestEntry ? (
            <p className="metric-card-source">
              {formatMetricEntrySource(latestEntry.source)} · Recorded{" "}
              {formatMetricEntryRecordedAt(latestEntry.recorded_at)} UTC
            </p>
          ) : null}
        </article>

        <article className="metric-detail-stat">
          <p className="meta-label">Tracked entries</p>
          <p className="metric-detail-stat-value">
            {formatMetricEntryCount(metricEntries.length)}
          </p>
        </article>

        <article className="metric-detail-stat">
          <p className="meta-label">Accepted range</p>
          <p className="metric-detail-stat-value">{valueRange}</p>
        </article>
      </section>

      <section className="trend-card" aria-label="Trend overview">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Selected range</p>
            <h2>Trend Overview</h2>
          </div>
          {selectedDate ? (
            <div className="metric-selected-date">
              <span>Entries for {formatUtcDate(selectedDate)} (UTC)</span>
              <Link
                aria-label="Clear selected date"
                params={{ slug }}
                search={{ date: undefined }}
                to="/metrics/$slug"
              >
                Clear date
              </Link>
            </div>
          ) : (
            <div className="range-toggle" aria-label="Metric entry range">
              {metricEntryRanges.map((range) => (
                <button
                  aria-pressed={selectedRange.label === range.label}
                  key={range.label}
                  onClick={() => handleRangeSelect(range)}
                  type="button"
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <MetricTrendChart
          entries={metricEntries}
          metricName={metricDefinition.name}
          metricSlug={metricDefinition.slug}
          unit={metricDefinition.unit}
        />

        <div className="trend-grid">
          <article>
            <p className="meta-label">Oldest</p>
            <p className="trend-value">
              {oldestEntry
                ? formatMetricValueWithUnit(
                    oldestEntry.value,
                    metricDefinition.slug,
                    metricDefinition.unit,
                  )
                : "—"}
            </p>
          </article>

          <article>
            <p className="meta-label">Latest</p>
            <p className="trend-value">
              {latestEntry
                ? formatMetricValueWithUnit(
                    latestEntry.value,
                    metricDefinition.slug,
                    metricDefinition.unit,
                  )
                : "—"}
            </p>
          </article>

          <article>
            <p className="meta-label">Delta</p>
            <p className="trend-value trend-delta">{formattedTrendDelta}</p>
          </article>
        </div>
      </section>

      <section className="entries-card" aria-label="Metric entry history">
        <div className="entries-toolbar">
          <div>
            <p className="eyebrow">Manual and synced records</p>
            <h2>Entry History</h2>
          </div>
        </div>

        {entriesAreLoading ? <p>Loading metric entries...</p> : null}
        {entriesFailed ? <p>Metric entries failed to load</p> : null}
        {entryActionError && !entryPendingDeletion ? (
          <p className="form-error">{entryActionError}</p>
        ) : null}

        {metricEntries.length === 0 ? (
          <div className="empty-state">
            <h3>No entries recorded yet</h3>
            <p>
              Use {getAddEntryActionLabel(metricDefinition)} above to record
              your first value.
            </p>
          </div>
        ) : (
          <div className="entry-list">
            {metricEntries.map((entry) => (
              <MetricEntryHistoryRow
                entry={entry}
                isDeleting={deleteMetricEntryMutation.isPending}
                isEditing={editingEntryId === entry.id}
                isUpdating={updateMetricEntryMutation.isPending}
                key={entry.id}
                maxValue={metricDefinition.max_value}
                metricName={metricDefinition.name}
                metricSlug={metricDefinition.slug}
                minValue={metricDefinition.min_value}
                onCancelEdit={() => setEditingEntryId(null)}
                onDelete={() => {
                  setEntryActionError(null);
                  setEntryPendingDeletion(entry);
                }}
                onEdit={() => {
                  setEntryActionError(null);
                  setEditingEntryId(entry.id);
                }}
                onUpdate={(input) => handleUpdateEntry(entry, input)}
                unit={metricDefinition.unit}
              />
            ))}
          </div>
        )}
      </section>

      {isAddingMetricEntry
        ? createPortal(
            <MetricEntryDialog
              initialDate={selectedDate}
              isPending={createMetricEntryMutation.isPending}
              metricDefinition={metricDefinition}
              onClose={() => setIsAddingMetricEntry(false)}
              onSubmit={(input) => createMetricEntryMutation.mutateAsync(input)}
            />,
            document.body,
          )
        : null}

      {entryPendingDeletion
        ? createPortal(
            <div
              className="metric-dialog-backdrop"
              onMouseDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  !deleteMetricEntryMutation.isPending
                ) {
                  setEntryActionError(null);
                  setEntryPendingDeletion(null);
                }
              }}
            >
              <section
                aria-labelledby="delete-entry-title"
                aria-modal="true"
                className="metric-dialog metric-delete-dialog"
                role="dialog"
                onKeyDown={(event) => {
                  if (
                    event.key === "Escape" &&
                    !deleteMetricEntryMutation.isPending
                  ) {
                    setEntryActionError(null);
                    setEntryPendingDeletion(null);
                  }
                }}
              >
                <div className="metric-dialog-header">
                  <div>
                    <p className="eyebrow">Delete entry</p>
                    <h2 id="delete-entry-title">
                      Delete {metricDefinition.name} entry?
                    </h2>
                  </div>
                  <button
                    aria-label="Close dialog"
                    className="metric-dialog-close"
                    disabled={deleteMetricEntryMutation.isPending}
                    type="button"
                    onClick={() => {
                      setEntryActionError(null);
                      setEntryPendingDeletion(null);
                    }}
                  >
                    ×
                  </button>
                </div>
                <p className="metric-dialog-copy">
                  This permanently removes the manual record. Synced records
                  cannot be deleted here.
                </p>
                <p className="metric-delete-entry-summary">
                  {formatMetricValueWithUnit(
                    entryPendingDeletion.value,
                    metricDefinition.slug,
                    metricDefinition.unit,
                  )}{" "}
                  ·{" "}
                  {formatMetricEntryRecordedAt(
                    entryPendingDeletion.recorded_at,
                  )}
                </p>
                {entryActionError ? (
                  <p className="form-error" role="alert">
                    {entryActionError}
                  </p>
                ) : null}
                <div className="metric-dialog-actions">
                  <button
                    className="metric-danger-action"
                    disabled={deleteMetricEntryMutation.isPending}
                    type="button"
                    onClick={() =>
                      void handleDeleteEntry(entryPendingDeletion.id)
                    }
                  >
                    {deleteMetricEntryMutation.isPending
                      ? "Deleting..."
                      : "Delete entry"}
                  </button>
                  <button
                    className="metrics-secondary-action"
                    disabled={deleteMetricEntryMutation.isPending}
                    type="button"
                    onClick={() => {
                      setEntryActionError(null);
                      setEntryPendingDeletion(null);
                    }}
                  >
                    Keep it
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function MetricAnalyticsLink({ metricSlug }: { metricSlug: string }) {
  const subscriptionQuery = useCurrentSubscriptionQuery();

  if (!subscriptionQuery.data?.plan.analytics_enabled) {
    return null;
  }

  if (metricSlug === "sleep_duration") {
    return (
      <Link className="metric-pro-insight-link" to="/analytics/sleep">
        View Sleep Insights
      </Link>
    );
  }

  return (
    <Link className="metric-pro-insight-link" to="/analytics/weight-steps">
      {metricSlug === "steps" ? "Compare with Weight" : "Compare with Steps"}
    </Link>
  );
}

interface MetricEntryHistoryRowProps {
  entry: MetricEntry;
  isDeleting: boolean;
  isEditing: boolean;
  isUpdating: boolean;
  maxValue: number;
  metricName: string;
  metricSlug: string;
  minValue: number;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onUpdate: (input: {
    value?: number;
    periodStart?: string;
    recordedAt: string;
    context: Record<string, unknown>;
  }) => void;
  unit: string;
}

function MetricEntryHistoryRow({
  entry,
  isDeleting,
  isEditing,
  isUpdating,
  maxValue,
  metricName,
  metricSlug,
  minValue,
  onCancelEdit,
  onDelete,
  onEdit,
  onUpdate,
  unit,
}: MetricEntryHistoryRowProps) {
  const [value, setValue] = useState(String(entry.value));
  const [bedtime, setBedtime] = useState(
    entry.period_start ? formatDateTimeLocalInput(entry.period_start) : "",
  );
  const [wakeTime, setWakeTime] = useState(
    formatDateTimeLocalInput(entry.recorded_at),
  );
  const [notes, setNotes] = useState(getEntryNotes(entry));
  const [validationError, setValidationError] = useState<string | null>(null);
  const isSleepInterval =
    metricSlug === "sleep_duration" && entry.period_start !== null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSleepInterval) {
      if (!isValidSleepWindow(bedtime, wakeTime)) {
        setValidationError("Wake time must be later than bedtime.");
        return;
      }

      setValidationError(null);
      onUpdate({
        periodStart: new Date(bedtime).toISOString(),
        recordedAt: new Date(wakeTime).toISOString(),
        context: {
          ...entry.context,
          notes,
        },
      });
      return;
    }

    const parsedValue = parseMetricEntryValue(value);

    if (parsedValue === undefined) {
      setValidationError("Enter a numeric value before saving.");
      return;
    }

    setValidationError(null);
    onUpdate({
      value: parsedValue,
      recordedAt: entry.recorded_at,
      context: {
        ...entry.context,
        notes,
      },
    });
  }

  if (isEditing) {
    return (
      <article className="entry-row entry-row-editing">
        <form
          className={`entry-edit-form${isSleepInterval ? " entry-edit-form-sleep" : ""}`}
          onSubmit={handleSubmit}
        >
          {isSleepInterval ? (
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
            </>
          ) : (
            <label>
              {metricName} value
              <input
                inputMode="decimal"
                max={maxValue}
                min={minValue}
                step={metricSlug === "body_weight" ? 0.1 : "any"}
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
          )}

          <label>
            {metricName} notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="entry-actions">
            <button disabled={isUpdating} type="submit">
              {isUpdating ? "Saving..." : `Save ${metricName} entry`}
            </button>
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>

          {validationError ? (
            <p className="form-error">{validationError}</p>
          ) : null}
        </form>
      </article>
    );
  }

  return (
    <article className="entry-row">
      <div>
        <p className="entry-label">{metricName}</p>
        <p className="meta-label">{formatMetricEntrySource(entry.source)}</p>
        {getEntryNotes(entry) ? (
          <p className="entry-note">{getEntryNotes(entry)}</p>
        ) : null}
        {metricSlug === "sleep_duration" && entry.period_start ? (
          <p className="entry-time">
            Sleep window:{" "}
            {formatSleepWindow(entry.period_start, entry.recorded_at)}
          </p>
        ) : null}
        <time dateTime={entry.recorded_at}>
          {metricSlug === "sleep_duration"
            ? formatSleepDate(entry.recorded_at)
            : formatMetricEntryRecordedAt(entry.recorded_at)}
        </time>
      </div>

      <div className="entry-row-side">
        <p className="entry-value">
          {formatMetricValueWithUnit(entry.value, metricSlug, unit)}
        </p>
        {entry.source === "manual" ? (
          <div className="entry-actions">
            <button type="button" onClick={onEdit}>
              Edit {metricName} entry
            </button>
            <button disabled={isDeleting} type="button" onClick={onDelete}>
              {isDeleting ? "Deleting..." : `Delete ${metricName} entry`}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function getEntryNotes(entry: MetricEntry) {
  return typeof entry.context.notes === "string" ? entry.context.notes : "";
}

function isUtcDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function formatUtcDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getAddEntryActionLabel(metricDefinition: MetricDefinition) {
  if (metricDefinition.slug === "body_weight") {
    return "Add weight entry";
  }

  return `Add ${metricDefinition.name} entry`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Metric entry action failed";
}

function formatMetricEntryRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(recordedAt));
}

function formatMetricEntryCount(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function getRangeStartIso(days: number) {
  const rangeStart = new Date();
  rangeStart.setUTCDate(rangeStart.getUTCDate() - days);
  return rangeStart.toISOString();
}
