import type { SleepInsightsPoint } from "./sleep-insights-api";

export function SleepInsightsChart({
  series,
  targetMinutes,
}: {
  series: SleepInsightsPoint[];
  targetMinutes: number;
}) {
  const scaleMaximum = Math.max(
    720,
    targetMinutes,
    ...series.map((point) => point.duration_minutes ?? 0),
  );
  const targetPosition = (targetMinutes / scaleMaximum) * 100;

  return (
    <div
      aria-label="Nightly sleep duration compared with the selected target"
      className="sleep-insights-chart"
      role="img"
    >
      <div
        aria-hidden="true"
        className="sleep-target-line"
        style={{ bottom: `${targetPosition}%` }}
      />
      <span
        aria-hidden="true"
        className="sleep-target-label"
        style={{ bottom: `${targetPosition}%` }}
      >
        target
      </span>
      {series.map((point) => {
        const duration = point.duration_minutes;
        const height = duration === null ? 0 : (duration / scaleMaximum) * 100;

        return (
          <div className="sleep-night" key={point.date}>
            <div className="sleep-night-bar-area">
              {duration === null ? (
                <span className="sleep-night-missing" title="No sleep record" />
              ) : (
                <span
                  className={
                    duration < targetMinutes
                      ? "sleep-night-bar sleep-night-bar-short"
                      : "sleep-night-bar"
                  }
                  style={{ height: `${height}%` }}
                  title={`${formatMinutes(duration)} sleep`}
                />
              )}
            </div>
            <span>{formatWeekday(point.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatWeekday(date: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
