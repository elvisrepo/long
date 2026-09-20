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
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useUpdateMetricEntryMutation } from "../features/metrics/use-update-metric-entry-mutation";

export const Route = createFileRoute("/metrics/$slug")({
  beforeLoad: requireAuthBeforeLoad,
  component: MetricDetailRoute,
});

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
  const [selectedRange, setSelectedRange] = useState<MetricEntryRange>(
    metricEntryRanges[3],
  );
  const [selectedRangeFrom, setSelectedRangeFrom] = useState<
    string | undefined
  >(undefined);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isAddingWeightEntry, setIsAddingWeightEntry] = useState(false);
  const [entryPendingDeletion, setEntryPendingDeletion] =
    useState<MetricEntry | null>(null);
  const [entryActionError, setEntryActionError] = useState<string | null>(null);
  const metricEntryFilters: GetMetricEntriesFilters = selectedRangeFrom
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
        <span>{metricDefinition.slug}</span>
      </nav>

      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Metric detail</p>
          <h1 className="dashboard-title">{metricDefinition.name}</h1>
          <p className="metric-detail-meta">
            {metricDefinition.slug} · {metricDefinition.unit} ·{" "}
            {metricDefinition.category} ·{" "}
            {metricDefinition.is_default ? "default" : "custom"}
          </p>
        </div>
        <div className="metric-detail-hero-actions">
          {metricDefinition.slug === "body_weight" ? (
            <button
              className="metrics-primary-action"
              type="button"
              onClick={() => setIsAddingWeightEntry(true)}
            >
              Add weight entry
            </button>
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
          <span className="metric-detail-range-status">
            {selectedRange.label} · Daily latest values
          </span>
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
              Log your first value from the <Link to="/">Dashboard</Link>.
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

      {isAddingWeightEntry
        ? createPortal(
            <BodyWeightEntryDialog
              isPending={createMetricEntryMutation.isPending}
              maxValue={metricDefinition.max_value}
              minValue={metricDefinition.min_value}
              onClose={() => setIsAddingWeightEntry(false)}
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

interface BodyWeightEntryDialogProps {
  isPending: boolean;
  maxValue: number;
  minValue: number;
  onClose: () => void;
  onSubmit: (input: {
    metricDefinition: string;
    value: number;
    recordedAt: string;
    context: Record<string, unknown>;
  }) => Promise<unknown>;
}

function BodyWeightEntryDialog({
  isPending,
  maxValue,
  minValue,
  onClose,
  onSubmit,
}: BodyWeightEntryDialogProps) {
  const [value, setValue] = useState("");
  const [recordedAt, setRecordedAt] = useState(() =>
    formatDateTimeLocalInput(new Date().toISOString()),
  );
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function closeWhenIdle() {
    if (!isPending) {
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedValue = parseMetricEntryValue(value);

    if (
      parsedValue === undefined ||
      parsedValue < minValue ||
      parsedValue > maxValue
    ) {
      setFormError(
        `Enter a weight between ${minValue} and ${maxValue} kilograms.`,
      );
      return;
    }

    const recordedAtDate = new Date(recordedAt);

    if (!recordedAt || Number.isNaN(recordedAtDate.getTime())) {
      setFormError("Enter a valid measurement time.");
      return;
    }

    setFormError(null);

    try {
      await onSubmit({
        metricDefinition: "body_weight",
        value: parsedValue,
        recordedAt: recordedAtDate.toISOString(),
        context: { notes },
      });
      onClose();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <div
      className="metric-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeWhenIdle();
        }
      }}
    >
      <section
        aria-labelledby="add-weight-entry-title"
        aria-modal="true"
        className="metric-dialog metric-add-entry-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeWhenIdle();
          }
        }}
      >
        <div className="metric-dialog-header">
          <div>
            <p className="eyebrow">Manual entry</p>
            <h2 id="add-weight-entry-title">Add Body Weight entry</h2>
          </div>
          <button
            aria-label="Close dialog"
            className="metric-dialog-close"
            disabled={isPending}
            type="button"
            onClick={closeWhenIdle}
          >
            ×
          </button>
        </div>

        <p className="metric-dialog-copy">
          Record a weigh-in in kilograms. The date and time can be adjusted for
          an earlier measurement.
        </p>

        <form className="metric-add-entry-form" onSubmit={handleSubmit}>
          <label>
            Body Weight value
            <input
              autoFocus
              inputMode="decimal"
              max={maxValue}
              min={minValue}
              required
              step="0.1"
              type="number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>

          <label>
            Recorded at
            <input
              required
              type="datetime-local"
              value={recordedAt}
              onChange={(event) => setRecordedAt(event.target.value)}
            />
          </label>

          <label className="metric-add-entry-notes">
            Body Weight notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="metric-dialog-actions metric-add-entry-actions">
            <button disabled={isPending} type="submit">
              {isPending ? "Saving..." : "Save weight entry"}
            </button>
            <button
              className="metrics-secondary-action"
              disabled={isPending}
              type="button"
              onClick={closeWhenIdle}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
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

function parseMetricEntryValue(value: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function formatDateTimeLocalInput(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp);
  const localTimestamp = new Date(
    timestamp.getTime() - timestamp.getTimezoneOffset() * 60 * 1000,
  );
  return localTimestamp.toISOString().slice(0, 16);
}

function isValidSleepWindow(bedtime: string, wakeTime: string) {
  return (
    bedtime !== "" &&
    wakeTime !== "" &&
    new Date(wakeTime).getTime() > new Date(bedtime).getTime()
  );
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
