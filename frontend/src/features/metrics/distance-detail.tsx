import { calendarDate } from "./distance-calendar";
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

export function DistanceTrend({
  entries,
  dates,
  timeZone,
  controls,
  loading,
  failed,
}: {
  entries: MetricEntry[];
  dates: string[];
  timeZone: string;
  controls: ReactNode;
  loading: boolean;
  failed: boolean;
}) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <section className="trend-card distance-trend" aria-label="Daily distance">
      <div className="entries-toolbar">
        <div>
          <h2>Daily distance</h2>
          <p className="distance-range-dates">
            {displayDate(dates[0])} – {displayDate(dates.at(-1)!)}
          </p>
        </div>
        {controls}
      </div>
      {loading ? (
        <p role="status">Loading daily distance...</p>
      ) : failed ? (
        <p role="alert">Daily distance failed to load.</p>
      ) : (
        <>
          <div className="distance-summary">
            <article>
              <p>Recorded total</p>
              <strong>
                {entries.length
                  ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(total)} km`
                  : "—"}
              </strong>
              <small>Recorded days only</small>
            </article>
            <article>
              <p>Daily average</p>
              <strong>
                {entries.length
                  ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(total / entries.length)} km`
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
            metricName="Distance"
            metricSlug="distance"
            unit="km"
            calendarDates={dates}
          />
          <p className="distance-explanation">
            Daily totals · {timeZone}. Blank dates mean no data, not zero
            distance. Recorded days may be partial.
          </p>
        </>
      )}
    </section>
  );
}

export function DistanceHistory({
  entries,
  loading,
  failed,
  timeZone,
  sourceRecords,
  rawCount,
}: {
  entries: MetricEntry[];
  loading: boolean;
  failed: boolean;
  timeZone: string;
  sourceRecords: ReactNode;
  rawCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="entries-card distance-history"
      aria-label="Daily distance history"
    >
      <div className="entries-toolbar">
        <div>
          <h2>Daily history</h2>
          <p className="distance-range-dates">
            Same totals as the chart · newest first
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
          <div className="distance-day-list">
            {(expanded ? entries : entries.slice(0, 5)).map((entry) => (
              <article
                className="distance-day"
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
                  {formatMetricValueWithUnit(entry.value, "distance", "km")}
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
      <details className="distance-source-records">
        <summary>
          Source records ·{" "}
          {rawCount === 50 ? "latest 50 loaded" : `${rawCount} loaded`}
        </summary>
        <p className="distance-explanation">
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
