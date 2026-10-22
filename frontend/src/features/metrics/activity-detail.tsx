import { calendarDate } from "./activity-calendar";
import { useState, type ReactNode } from "react";
import type { MetricEntry } from "./metric-entries-api";
import {
  formatMetricEntrySource,
  formatMetricValueWithUnit,
} from "./metric-entry-formatters";
import { MetricTrendChart } from "./metric-trend-chart";

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function ActivityTrend({
  metricSlug = "distance",
  entries,
  dates,
  timeZone,
  controls,
  loading,
  failed,
}: {
  metricSlug?: "distance" | "steps";
  entries: MetricEntry[];
  dates: string[];
  timeZone: string;
  controls: ReactNode;
  loading: boolean;
  failed: boolean;
}) {
  const isSteps = metricSlug === "steps";
  const metricName = isSteps ? "Steps" : "Distance";
  const weekly = isSteps && dates.length >= 90;
  const title = weekly ? "Weekly steps" : `Daily ${metricName.toLowerCase()}`;
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <section className="trend-card activity-trend" aria-label={title}>
      <div className="entries-toolbar">
        <div>
          <h2>{title}</h2>
          <p className="activity-range-dates">
            {displayDate(dates[0])} – {displayDate(dates.at(-1)!)}
          </p>
        </div>
        {controls}
      </div>
      {loading ? (
        <p role="status">Loading {title.toLowerCase()}...</p>
      ) : failed ? (
        <p role="alert">{title} failed to load.</p>
      ) : (
        <>
          <div className="activity-summary">
            <article>
              <p>{isSteps ? "Recorded steps" : "Recorded total"}</p>
              <strong>
                {entries.length
                  ? isSteps
                    ? new Intl.NumberFormat("en-US").format(total)
                    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(total)} km`
                  : "—"}
              </strong>
              <small>Recorded days only</small>
            </article>
            <article>
              <p>Daily average</p>
              <strong>
                {entries.length
                  ? isSteps
                    ? new Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 0,
                      }).format(total / entries.length)
                    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(total / entries.length)} km`
                  : "—"}
              </strong>
              <small>Missing days excluded</small>
            </article>
            <article>
              <p>Days recorded</p>
              <strong>
                {entries.length} / {dates.length}
              </strong>
              <small>In selected range</small>
            </article>
          </div>
          <MetricTrendChart
            entries={entries}
            metricName={metricName}
            metricSlug={metricSlug}
            unit={isSteps ? "steps" : "km"}
            weekly={weekly}
            calendarDates={dates}
          />
          <p className="activity-explanation">
            {weekly
              ? "Weekly totals · weeks start Monday; edge weeks and recorded days may be partial."
              : "Daily totals · recorded days may be partial."}{" "}
            {timeZone}. Blank periods mean no data, not zero{" "}
            {isSteps ? "steps" : "distance"}.
          </p>
        </>
      )}
    </section>
  );
}

export function ActivityHistory({
  metricSlug = "distance",
  weekly = false,
  entries,
  loading,
  failed,
  timeZone,
  sourceRecords,
  rawCount,
}: {
  metricSlug?: "distance" | "steps";
  entries: MetricEntry[];
  loading: boolean;
  failed: boolean;
  timeZone: string;
  weekly?: boolean;
  sourceRecords: ReactNode;
  rawCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="entries-card activity-history"
      aria-label={`Daily ${metricSlug} history`}
    >
      <div className="entries-toolbar">
        <div>
          <h2>Daily history</h2>
          <p className="activity-range-dates">
            {weekly
              ? "Daily totals behind the weekly bars · newest first"
              : "Same totals as the chart · newest first"}
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading daily history...</p>
      ) : failed ? (
        <p role="alert">Daily history failed to load.</p>
      ) : entries.length === 0 ? (
        <p>No recorded days in this range.</p>
      ) : (
        <>
          <div className="activity-day-list">
            {(expanded ? entries : entries.slice(0, 5)).map((entry) => (
              <article
                className="activity-day"
                key={entry.local_date ?? entry.id}
              >
                <div>
                  <time
                    dateTime={
                      entry.local_date ??
                      calendarDate(entry.recorded_at, timeZone)
                    }
                  >
                    {displayDate(
                      entry.local_date ??
                        calendarDate(entry.recorded_at, timeZone),
                    )}
                  </time>
                  <small>
                    {formatMetricEntrySource(entry.source)} · daily total
                  </small>
                </div>
                <strong>
                  {metricSlug === "steps"
                    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(entry.value)} steps`
                    : formatMetricValueWithUnit(entry.value, "distance", "km")}
                </strong>
              </article>
            ))}
          </div>
          {entries.length > 5 ? (
            <button
              className="metrics-secondary-action entry-history-toggle"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show fewer days"
                : `Show all ${entries.length} recorded days`}
            </button>
          ) : null}
        </>
      )}
      <details className="activity-source-records">
        <summary>
          Source records ·{" "}
          {rawCount === 50 ? "latest 50 loaded" : `${rawCount} loaded`}
        </summary>
        <p className="activity-explanation">
          Individual records, not daily totals. Daily summaries use
          source-selection rules; do not add these records to the totals above.
          Source timestamps are shown in UTC. Only manual records can be edited
          or deleted here.
        </p>
        {sourceRecords}
      </details>
    </section>
  );
}
