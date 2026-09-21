import { type FormEvent, useState } from "react";
import { Modal } from "../../components/modal";
import type { MetricDefinition } from "./metric-definitions-api";
import type { CreateMetricEntryInput } from "./metric-entries-api";
import { formatMetricValue } from "./metric-entry-formatters";
import {
  formatDateTimeLocalInput,
  getSleepDurationHours,
  parseMetricEntryValue,
} from "./metric-entry-input";

interface MetricEntryDialogProps {
  initialDate?: string;
  isPending: boolean;
  metricDefinition: MetricDefinition;
  onClose: () => void;
  onSubmit: (input: CreateMetricEntryInput) => Promise<unknown>;
}

export function MetricEntryDialog({
  initialDate,
  isPending,
  metricDefinition,
  onClose,
  onSubmit,
}: MetricEntryDialogProps) {
  const [value, setValue] = useState("");
  const [recordedAt, setRecordedAt] = useState(() =>
    formatDateTimeLocalInput(
      initialDate ? `${initialDate}T12:00:00Z` : new Date().toISOString(),
    ),
  );
  const initialWakeTime = initialDate ? `${initialDate}T07:00:00Z` : undefined;
  const [bedtime, setBedtime] = useState(() =>
    initialWakeTime
      ? formatDateTimeLocalInput(
          new Date(
            new Date(initialWakeTime).getTime() - 8 * 60 * 60 * 1000,
          ).toISOString(),
        )
      : "",
  );
  const [wakeTime, setWakeTime] = useState(() =>
    initialWakeTime ? formatDateTimeLocalInput(initialWakeTime) : "",
  );
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const isSleepDuration = metricDefinition.slug === "sleep_duration";
  const sleepDurationHours = getSleepDurationHours(bedtime, wakeTime);

  function closeWhenIdle() {
    if (!isPending) {
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSleepDuration) {
      if (
        sleepDurationHours === undefined ||
        sleepDurationHours < metricDefinition.min_value ||
        sleepDurationHours > metricDefinition.max_value
      ) {
        setFormError(
          `Enter a sleep window between ${metricDefinition.min_value} and ${metricDefinition.max_value} hours.`,
        );
        return;
      }

      setFormError(null);

      try {
        await onSubmit({
          metricDefinition: metricDefinition.slug,
          periodStart: new Date(bedtime).toISOString(),
          recordedAt: new Date(wakeTime).toISOString(),
          context: { notes },
        });
        onClose();
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
      return;
    }

    const parsedValue = parseMetricEntryValue(value);

    if (
      parsedValue === undefined ||
      parsedValue < metricDefinition.min_value ||
      parsedValue > metricDefinition.max_value
    ) {
      setFormError(
        `Enter a value between ${metricDefinition.min_value} and ${metricDefinition.max_value} ${metricDefinition.unit}.`,
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
        metricDefinition: metricDefinition.slug,
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
    <Modal
      labelledBy="add-metric-entry-title"
      onClose={closeWhenIdle}
      busy={isPending}
    >
      <div className="metric-dialog-header">
        <div>
          <p className="eyebrow">Manual entry</p>
          <h2 id="add-metric-entry-title">Add {metricDefinition.name} entry</h2>
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
        {isSleepDuration
          ? "Record bedtime and wake time. Sleep duration is calculated automatically."
          : `Record a value in ${metricDefinition.unit}. The date and time can be adjusted for an earlier measurement.`}
      </p>

      <form className="metric-add-entry-form" onSubmit={handleSubmit}>
        {isSleepDuration ? (
          <>
            <label>
              Bedtime
              <input
                autoFocus
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
              <p className="metric-form-preview metric-add-entry-preview">
                Calculated duration:{" "}
                {formatMetricValue(sleepDurationHours, metricDefinition.slug)}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <label>
              {metricDefinition.name} value
              <input
                autoFocus
                inputMode="decimal"
                max={metricDefinition.max_value}
                min={metricDefinition.min_value}
                required
                step={getMetricEntryStep(metricDefinition.slug)}
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
          </>
        )}

        <label className="metric-add-entry-notes">
          {metricDefinition.name} notes
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
            {isPending
              ? "Saving..."
              : getSaveEntryActionLabel(metricDefinition)}
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
    </Modal>
  );
}

function getSaveEntryActionLabel(metricDefinition: MetricDefinition) {
  if (metricDefinition.slug === "body_weight") {
    return "Save weight entry";
  }

  return `Save ${metricDefinition.name} entry`;
}

function getMetricEntryStep(metricSlug: string): number | "any" {
  if (metricSlug === "body_weight") {
    return 0.1;
  }

  if (metricSlug === "steps") {
    return 1;
  }

  return "any";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Metric entry action failed";
}
