import { PageHeader } from "../components/page-header";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import type { SleepInsightsPoint } from "../features/metrics/sleep-insights-api";
import { SleepInsightsChart } from "../features/metrics/sleep-insights-chart";
import { useSleepInsightsQuery } from "../features/metrics/use-sleep-insights-query";
import {
  useSleepTargetPreferenceQuery,
  useUpdateSleepTargetPreferenceMutation,
} from "../features/metrics/use-sleep-target-preference";

export const Route = createFileRoute("/analytics/sleep")({
  beforeLoad: requireAuthBeforeLoad,
  component: SleepInsightsRoute,
});

const DEFAULT_TARGET_MINUTES = 7 * 60 + 30;

function SleepInsightsRoute() {
  const [draftTarget, setDraftTarget] = useState<{
    hours: string;
    minutes: string;
  } | null>(null);
  const preferenceQuery = useSleepTargetPreferenceQuery();
  const updatePreferenceMutation = useUpdateSleepTargetPreferenceMutation();
  const savedTargetMinutes =
    preferenceQuery.data?.target_minutes ?? DEFAULT_TARGET_MINUTES;
  const targetHours =
    draftTarget?.hours ?? String(Math.floor(savedTargetMinutes / 60));
  const targetMinuteField =
    draftTarget?.minutes ?? String(savedTargetMinutes % 60);
  const parsedDraftTarget = draftTarget
    ? parseDurationFields(targetHours, targetMinuteField)
    : savedTargetMinutes;
  const targetMinutes = parsedDraftTarget ?? savedTargetMinutes;
  const analyticsQuery = useSleepInsightsQuery(targetMinutes);

  if (preferenceQuery.isLoading || analyticsQuery.isLoading) {
    return <SleepInsightsLoading />;
  }

  if (preferenceQuery.isError || analyticsQuery.isError) {
    const error = preferenceQuery.error ?? analyticsQuery.error;
    return (
      <section className="sleep-insights-screen">
        <Link
          className="metric-detail-breadcrumb"
          to="/metrics/$slug"
          params={{ slug: "sleep_duration" }}
        >
          ← Sleep Duration
        </Link>
        <div className="settings-inline-error" role="alert">
          {error instanceof Error
            ? error.message
            : "Sleep insights failed to load"}
        </div>
      </section>
    );
  }

  const analytics = analyticsQuery.data;
  if (!analytics) {
    return null;
  }

  async function saveTarget() {
    if (
      parsedDraftTarget === null ||
      parsedDraftTarget === savedTargetMinutes
    ) {
      return;
    }
    try {
      await updatePreferenceMutation.mutateAsync(parsedDraftTarget);
      setDraftTarget(null);
    } catch {
      // The mutation exposes its safe error message in the form below.
    }
  }

  return (
    <section className="sleep-insights-screen">
      <PageHeader
        title="Sleep Insights"
        eyebrow="Sleep · Last 7 nights"
        breadcrumb={
          <nav aria-label="Breadcrumb" className="metric-detail-breadcrumb">
            <Link to="/metrics/$slug" params={{ slug: "sleep_duration" }}>
              ← Sleep Duration
            </Link>
          </nav>
        }
        description={
          <p className="weight-steps-subtitle">
            {formatDateRange(analytics.series)} · UTC
          </p>
        }
      />

      <section
        className="sleep-insights-card"
        aria-label="Seven-night sleep insights"
      >
        <details
          className="sleep-target-settings"
          open={
            analytics.summary.tracked_nights === 0 ||
            updatePreferenceMutation.isPending ||
            updatePreferenceMutation.isError ||
            updatePreferenceMutation.isSuccess
          }
        >
          <summary>
            Nightly target · {formatMinutes(savedTargetMinutes)}
          </summary>
          <div className="sleep-target-control">
            <fieldset
              aria-describedby="sleep-target-help"
              className="sleep-target-duration"
            >
              <legend>Nightly sleep target</legend>
              <div className="sleep-target-fields">
                <label>
                  Hours
                  <input
                    inputMode="numeric"
                    max="23"
                    min="1"
                    onChange={(event) =>
                      setDraftTarget({
                        hours: event.currentTarget.value,
                        minutes: targetMinuteField,
                      })
                    }
                    type="number"
                    value={targetHours}
                  />
                </label>
                <label>
                  Minutes
                  <input
                    inputMode="numeric"
                    max="59"
                    min="0"
                    onChange={(event) =>
                      setDraftTarget({
                        hours: targetHours,
                        minutes: event.currentTarget.value,
                      })
                    }
                    type="number"
                    value={targetMinuteField}
                  />
                </label>
              </div>
            </fieldset>
            <button
              disabled={
                updatePreferenceMutation.isPending ||
                parsedDraftTarget === null ||
                targetMinutes === savedTargetMinutes
              }
              onClick={() => void saveTarget()}
              type="button"
            >
              {updatePreferenceMutation.isPending ? "Saving…" : "Save target"}
            </button>
            <p id="sleep-target-help">
              Preview updates as you edit. Save to keep your target.
            </p>
            {analyticsQuery.isFetching ? (
              <p role="status">Updating preview…</p>
            ) : null}
            {updatePreferenceMutation.isSuccess ? (
              <p className="sleep-target-success" role="status">
                Target saved.
              </p>
            ) : null}
            {updatePreferenceMutation.isError ? (
              <p className="form-error" role="alert">
                {updatePreferenceMutation.error instanceof Error
                  ? updatePreferenceMutation.error.message
                  : "Sleep target failed to save"}
              </p>
            ) : null}
          </div>
        </details>

        {analytics.summary.tracked_nights === 0 ? (
          <div className="empty-state">
            <h2>No Sleep data in the last seven nights</h2>
            <p>Sync or log Sleep Duration, then return here.</p>
            <Link to="/metrics/$slug" params={{ slug: "sleep_duration" }}>
              Log sleep →
            </Link>
          </div>
        ) : (
          <>
            <div className="sleep-shortfall-summary">
              <div>
                <p className="meta-label">Estimated shortfall</p>
                {analytics.summary.total_shortfall_minutes === 0 ? (
                  <p className="sleep-shortfall-value sleep-shortfall-none">
                    No shortfall
                  </p>
                ) : (
                  <p className="sleep-shortfall-value">
                    {formatMinutes(analytics.summary.total_shortfall_minutes)}
                  </p>
                )}
                <p className="weight-steps-note">
                  Calculated from {analytics.summary.tracked_nights} of 7
                  nights. Missing nights are unknown.
                </p>
              </div>
              <p className="sleep-target-value">
                Target {formatMinutes(analytics.target_minutes)} per night
              </p>
            </div>

            <SleepInsightsChart
              series={analytics.series}
              targetMinutes={analytics.target_minutes}
            />
            <div className="sleep-chart-legend" aria-label="Chart key">
              <span>Solid bar · Recorded sleep</span>
              <span>Dotted mark · No record</span>
              <span>Dashed line · Target</span>
            </div>
            <SleepInsightsSummary
              series={analytics.series}
              summary={analytics.summary}
            />
            <p className="weight-steps-note">
              Bedtimes and wake times shown in your local timezone.
            </p>
            <details className="sleep-method-note">
              <summary>How this works</summary>
              <p>
                Shortfall adds the time below your target on recorded nights.
                Longer nights do not subtract from shorter nights. Missing
                nights are excluded. Your target is a personal comparison, not a
                medical prescription. Chart dates use UTC.
              </p>
            </details>
          </>
        )}
      </section>
    </section>
  );
}

function SleepInsightsSummary({
  series,
  summary,
}: {
  series: SleepInsightsPoint[];
  summary: NonNullable<
    ReturnType<typeof useSleepInsightsQuery>["data"]
  >["summary"];
}) {
  const periodStarts = series.flatMap((point) =>
    point.period_start ? [point.period_start] : [],
  );
  const wakeTimes = series.flatMap((point) =>
    point.recorded_at ? [point.recorded_at] : [],
  );

  return (
    <div className="sleep-insights-summary">
      <article>
        <p className="meta-label">Average sleep</p>
        <p className="weight-steps-summary-value">
          {summary.average_duration_minutes === null
            ? "—"
            : formatMinutes(summary.average_duration_minutes)}
        </p>
      </article>
      <article>
        <p className="meta-label">Avg bedtime</p>
        <p className="weight-steps-summary-value">
          {formatAverageClockTime(periodStarts)}
        </p>
      </article>
      <article>
        <p className="meta-label">Avg wake time</p>
        <p className="weight-steps-summary-value">
          {formatAverageClockTime(wakeTimes)}
        </p>
      </article>
      <article>
        <p className="meta-label">Shortest night</p>
        <p className="weight-steps-summary-value">
          {summary.worst_night
            ? `${formatDate(summary.worst_night.date)} · ${formatMinutes(summary.worst_night.duration_minutes)}`
            : "—"}
        </p>
      </article>
      <article>
        <p className="meta-label">Under target</p>
        <p className="weight-steps-summary-value">
          {summary.nights_under_target} of {summary.tracked_nights}
        </p>
      </article>
      <article>
        <p className="meta-label">Coverage</p>
        <p className="weight-steps-summary-value">
          {summary.tracked_nights} of 7 nights
        </p>
      </article>
    </div>
  );
}

function SleepInsightsLoading() {
  return (
    <section
      aria-label="Loading Sleep insights"
      className="sleep-insights-screen settings-loading-skeleton"
      role="status"
    >
      <span className="settings-skeleton settings-skeleton-eyebrow" />
      <span className="settings-skeleton settings-skeleton-title" />
      <span className="settings-skeleton settings-skeleton-card" />
    </section>
  );
}

function parseDurationFields(hoursValue: string, minutesValue: string) {
  if (hoursValue.trim() === "" || minutesValue.trim() === "") {
    return null;
  }
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 1 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 60 && totalMinutes <= 1439 ? totalMinutes : null;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatDateRange(series: SleepInsightsPoint[]): string {
  const first = series.at(0)?.date;
  const last = series.at(-1)?.date;
  if (!first || !last) return "Last 7 nights";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`));
}

function formatAverageClockTime(timestamps: string[]): string {
  if (timestamps.length === 0) {
    return "—";
  }

  const angles = timestamps.map((timestamp) => {
    const date = new Date(timestamp);
    const minutes = date.getHours() * 60 + date.getMinutes();
    return (minutes / 1440) * 2 * Math.PI;
  });
  const averageSine =
    angles.reduce((total, angle) => total + Math.sin(angle), 0) / angles.length;
  const averageCosine =
    angles.reduce((total, angle) => total + Math.cos(angle), 0) / angles.length;
  const angle = Math.atan2(averageSine, averageCosine);
  const minutes =
    Math.round(
      (((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 1440,
    ) % 1440;
  const date = new Date(2026, 0, 1, Math.floor(minutes / 60), minutes % 60);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
