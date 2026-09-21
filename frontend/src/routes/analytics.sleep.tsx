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
  const [draftTargetMinutes, setDraftTargetMinutes] = useState<number | null>(
    null,
  );
  const preferenceQuery = useSleepTargetPreferenceQuery();
  const updatePreferenceMutation = useUpdateSleepTargetPreferenceMutation();
  const savedTargetMinutes =
    preferenceQuery.data?.target_minutes ?? DEFAULT_TARGET_MINUTES;
  const targetMinutes = draftTargetMinutes ?? savedTargetMinutes;
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
    try {
      await updatePreferenceMutation.mutateAsync(targetMinutes);
      setDraftTargetMinutes(null);
    } catch {
      // The mutation exposes its safe error message in the form below.
    }
  }

  return (
    <section className="sleep-insights-screen">
      <nav aria-label="Breadcrumb" className="metric-detail-breadcrumb">
        <Link to="/metrics/$slug" params={{ slug: "sleep_duration" }}>
          sleep_duration
        </Link>
        <span aria-hidden="true">/</span>
        <span>insights</span>
      </nav>

      <div className="metric-detail-hero">
        <div>
          <p className="eyebrow">Pro Insights · Sleep</p>
          <h1 className="dashboard-title">Sleep Insights</h1>
          <p className="weight-steps-subtitle">
            Your recent duration, timing, and estimated shortfall across seven
            nights.
          </p>
        </div>
        <span className="status-pill">Pro · Analytics</span>
      </div>

      <section
        className="sleep-insights-card"
        aria-label="Seven-night sleep insights"
      >
        <div className="sleep-target-control">
          <label htmlFor="sleep-target">Nightly sleep target</label>
          <input
            aria-describedby="sleep-target-help"
            id="sleep-target"
            max="23:59"
            min="01:00"
            onChange={(event) => {
              const minutes = parseDurationInput(event.target.value);
              if (minutes !== null) {
                setDraftTargetMinutes(minutes);
              }
            }}
            type="time"
            value={formatDurationInput(targetMinutes)}
          />
          <button
            disabled={
              updatePreferenceMutation.isPending ||
              targetMinutes === savedTargetMinutes
            }
            onClick={() => void saveTarget()}
            type="button"
          >
            {updatePreferenceMutation.isPending ? "Saving…" : "Save target"}
          </button>
          <p id="sleep-target-help">
            Default 7h 30m. Preview changes immediately, then save the target to
            your account. It is not a medical prescription.
          </p>
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

        {analytics.summary.tracked_nights === 0 ? (
          <div className="empty-state">
            <h2>No Sleep data in the last seven nights</h2>
            <p>Sync or log Sleep Duration, then return here.</p>
          </div>
        ) : (
          <>
            <div className="sleep-shortfall-summary">
              <div>
                <p className="meta-label">Estimated 7-day sleep shortfall</p>
                <p className="sleep-shortfall-value">
                  {formatMinutes(analytics.summary.total_shortfall_minutes)}
                </p>
                <p className="weight-steps-note">
                  Calculated from {analytics.summary.tracked_nights} of 7
                  nights. Longer nights do not subtract from shorter nights.
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
            <SleepInsightsSummary
              series={analytics.series}
              summary={analytics.summary}
            />
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
        <p className="meta-label">Average bedtime · local time</p>
        <p className="weight-steps-summary-value">
          {formatAverageClockTime(periodStarts)}
        </p>
      </article>
      <article>
        <p className="meta-label">Average wake time · local time</p>
        <p className="weight-steps-summary-value">
          {formatAverageClockTime(wakeTimes)}
        </p>
      </article>
      <article>
        <p className="meta-label">Worst tracked night</p>
        <p className="weight-steps-summary-value">
          {summary.worst_night
            ? `${formatDate(summary.worst_night.date)} · ${formatMinutes(summary.worst_night.duration_minutes)}`
            : "—"}
        </p>
      </article>
      <article>
        <p className="meta-label">Nights under target</p>
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

function parseDurationInput(value: string): number | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 60 && totalMinutes <= 1439 ? totalMinutes : null;
}

function formatDurationInput(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
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
