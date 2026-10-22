import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "./workout-api";
import {
  defaultMetric,
  formatProgressValue,
  progressMetrics,
  progressSeries,
  type ProgressMetric,
  type ProgressSeries,
} from "./workout-analysis";
import { shiftDay, type NavigateWorkout } from "./workout-navigation";
import { getAllTimeProgress } from "./workout-all-time";
import { WorkoutPreview } from "./workout-preview";
import { shareGraph } from "./graph-share";
import { useEstimateLimit } from "./use-estimate-limit";
import { RecordHistory } from "./record-history";

export function WorkoutProgress({
  owner,
  date,
  exerciseId,
  catalog,
  navigate,
  showExerciseSelector = true,
  compact = false,
  initialMetric = null,
  initialReps = 5,
  initialDays,
}: {
  owner: string;
  date: string;
  exerciseId?: string;
  catalog: api.WorkoutCatalog;
  navigate: NavigateWorkout;
  showExerciseSelector?: boolean;
  compact?: boolean;
  initialMetric?: ProgressMetric | null;
  initialReps?: number;
  initialDays?: number;
}) {
  const [days, setDays] = useState(initialDays ?? (compact ? 30 : 90));
  const [preview, setPreview] = useState<{ date: string; id?: string } | null>(
    null,
  );
  const [repLimit, setRepLimit] = useEstimateLimit(exerciseId);
  const [metric, setMetric] = useState<ProgressMetric | null>(initialMetric);
  const [reps, setReps] = useState(initialReps);
  const [history, setHistory] = useState<{
    reps: number;
    weight_unit: string;
    distance_unit: string;
  } | null>(null);
  const from = days === 0 ? "" : shiftDay(date, 1 - days);
  const windowQuery = useQuery({
    queryKey: ["workouts", owner, "progress", exerciseId, from, date],
    queryFn: () => api.getWorkoutRange(from, date, exerciseId),
    enabled: !!exerciseId && days !== 0,
  });
  const libraryType = catalog.exercises.find(
    (exercise) => exercise.id === exerciseId,
  )?.tracking_type;
  const savedTypes =
    windowQuery.data?.flatMap((workout) =>
      workout.exercises
        .filter((item) => item.exercise_id === exerciseId)
        .map((item) => item.tracking_type),
    ) ?? [];
  const types = savedTypes.length ? savedTypes : [libraryType ?? "strength"];
  const options = progressMetrics(types);
  const preferredMetric = catalog.exercises.find(
    (exercise) => exercise.id === exerciseId,
  )?.default_graph;
  const selectedMetric =
    metric && (days === 0 || options.some((option) => option.value === metric))
      ? metric
      : preferredMetric &&
          options.some((option) => option.value === preferredMetric)
        ? (preferredMetric as ProgressMetric)
        : compact && types[0] === "strength"
          ? "estimated_1rm"
          : defaultMetric(types[0]);
  const allTimeQuery = useQuery({
    queryKey: [
      "workouts",
      owner,
      "all-time-progress",
      exerciseId,
      date,
      selectedMetric,
      reps,
      repLimit,
      compact,
    ],
    queryFn: () =>
      getAllTimeProgress(
        exerciseId!,
        date,
        selectedMetric,
        reps,
        ...(compact || repLimit !== 10
          ? [{ repLimit, perWorkout: compact }]
          : []),
      ),
    enabled:
      !!exerciseId &&
      (days === 0 || (compact && selectedMetric === "rep_maxes")),
  });
  const summaryMode = days === 0 || (compact && selectedMetric === "rep_maxes");
  const query = summaryMode ? allTimeQuery : windowQuery;
  const displayedOptions =
    days === 0
      ? progressMetrics([...types, ...(allTimeQuery.data?.types ?? [])])
      : options;
  const series = summaryMode
    ? (allTimeQuery.data?.series ?? [])
        .map((series) => ({
          ...series,
          points:
            days === 0
              ? series.points
              : series.points.filter((point) => point.date >= from),
        }))
        .filter(
          (series) =>
            series.points.length || selectedMetric === "personal_records",
        )
    : windowQuery.data && exerciseId
      ? progressSeries(windowQuery.data, exerciseId, selectedMetric, reps, {
          repLimit,
          perWorkout: compact,
        })
      : [];
  const completedDates = new Set(
    windowQuery.data
      ?.filter((w) =>
        w.exercises.some(
          (i) =>
            i.exercise_id === exerciseId && i.sets.some((s) => s.is_completed),
        ),
      )
      .map((w) => w.performed_on),
  );
  const plannedDates = [
    ...new Set(
      windowQuery.data
        ?.filter(
          (w) =>
            !completedDates.has(w.performed_on) &&
            w.exercises.some(
              (i) =>
                i.exercise_id === exerciseId &&
                i.sets.some((s) => !s.is_completed),
            ),
        )
        .map((w) => w.performed_on),
    ),
  ].sort();
  return (
    <section
      className={`workout-card${compact ? " workout-progress-compact" : ""}`}
    >
      {preview && (
        <WorkoutPreview
          owner={owner}
          date={preview.date}
          workoutId={preview.id}
          navigate={navigate}
          onClose={() => setPreview(null)}
        />
      )}
      <div className="workout-filters workout-progress-filters">
        {showExerciseSelector && (
          <label>
            Progress exercise
            <select
              value={exerciseId ?? ""}
              onChange={(e) => {
                setMetric(null);
                navigate({
                  view: "progress",
                  date,
                  exercise: e.target.value || undefined,
                });
              }}
            >
              <option value="">Choose exercise…</option>
              {catalog.exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.is_active ? "" : " (archived)"}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Graph
          <select
            aria-label="Graph"
            value={selectedMetric}
            onChange={(event) => {
              const selected = event.target.value as ProgressMetric;
              setMetric(selected);
            }}
          >
            {selectedMetric === "personal_records" &&
              !displayedOptions.some(
                (option) => option.value === "personal_records",
              ) && (
                <option value="personal_records">
                  Personal records (saved strength sets)
                </option>
              )}
            {displayedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {(selectedMetric === "max_weight_reps" ||
          selectedMetric === "rep_maxes") && (
          <label>
            Rep count
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              value={reps}
              onChange={(event) => setReps(Number(event.target.value))}
            />
          </label>
        )}
        <label className={compact ? "visually-hidden" : undefined}>
          Progress window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days</option>
            <option value={0}>All time</option>
          </select>
        </label>
      </div>
      {compact && (
        <div className="workout-graph-periods">
          {[
            [30, "1m"],
            [90, "3m"],
            [180, "6m"],
            [365, "1y"],
            [0, "All"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={days === value}
              onClick={() => setDays(Number(value))}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <details
        className="workout-graph-information"
        open={!compact ? true : undefined}
      >
        <summary>About this graph</summary>
        <div className="workout-progress-scope">
          <span className="workout-badge workout-status workout-status--completed">
            Completed sets only
          </span>
          <p>
            {days === 0
              ? `All recorded training through ${date}; saved types and units stay separate.`
              : `${from} – ${date}. Saved types and units stay separate. These are records within this window, not all-time records.`}
          </p>
        </div>
        {selectedMetric === "personal_records" && (
          <p className="workout-note">
            Personal records here are actual strength loads by rep count. Cardio
            and timed exercise bests are available through their distance and
            duration graphs.
          </p>
        )}
        {selectedMetric === "estimated_1rm" && (
          <p className="workout-note">
            Estimate only: Epley load × (1 + reps / 30); one rep uses the
            recorded load. Only positive loads with 1–{repLimit} reps are
            included. Higher-rep sets are excluded because their estimates are
            less dependable. This is not a measured maximum and does not account
            for reps left in reserve; an easy set can underestimate your
            capability.
          </p>
        )}
        {(selectedMetric === "max_speed" || selectedMetric === "best_pace") && (
          <p className="workout-note">
            Speed = distance ÷ time in hours. Pace = time in minutes ÷ distance,
            shown as minutes:seconds per km or mile; lower pace is faster. Each
            date uses its fastest eligible set, not a workout average. Only
            completed cardio sets with positive distance and time are included.
            Comparisons do not adjust for route, terrain or interval length.
          </p>
        )}
        {(selectedMetric === "max_volume" ||
          selectedMetric === "workout_volume") && (
          <p className="workout-note">
            Volume = recorded load × reps, not body weight. Max volume is one
            set; workout volume totals this exercise within each session.
            Same-day sessions stay separate.
          </p>
        )}
        {selectedMetric === "workout_reps" && (
          <p className="workout-note">
            Completed reps for this exercise in each workout, not the whole
            workout. Same-day sessions stay separate.
          </p>
        )}
        {days !== 0 && query.isSuccess && plannedDates.length > 0 && (
          <p className="workout-note">
            Not plotted: {plannedDates.join(", ")} — only planned sets for this
            exercise. Mark performed sets completed to include them.
          </p>
        )}
      </details>
      {selectedMetric === "estimated_1rm" && !compact && (
        <label className="workout-estimate-limit">
          Estimated 1RM rep limit
          <select
            aria-label="Estimated 1RM rep limit"
            value={repLimit}
            onChange={(event) => setRepLimit(Number(event.target.value))}
          >
            {Array.from({ length: 30 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {!exerciseId ? (
        <p>Select an exercise to review its progress.</p>
      ) : query.isPending ? (
        <p role="status">Loading progress…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Progress couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry progress</button>
        </>
      ) : !series.length ? (
        <p>
          {days === 0
            ? `No eligible completed sets for this graph through ${date}.`
            : completedDates.size === 0
              ? "No completed sets recorded in this window."
              : `No eligible completed sets for this graph${selectedMetric === "max_weight_reps" ? ` at ${reps} reps` : ""} in this window.`}
        </p>
      ) : (
        <div className="workout-stack">
          {series.map((s) => (
            <ProgressCard
              key={`${exerciseId}:${from}:${date}:${selectedMetric}:${reps}:${repLimit}:${s.key}`}
              series={s}
              recordsOnly={selectedMetric === "personal_records"}
              allTime={days === 0}
              compact={compact}
              exerciseName={
                catalog.exercises.find((exercise) => exercise.id === exerciseId)
                  ?.name ?? ""
              }
              repLimit={
                selectedMetric === "estimated_1rm" ? repLimit : undefined
              }
              onRepLimit={setRepLimit}
              onHistory={(reps) =>
                setHistory({
                  reps,
                  weight_unit: s.key.split(":")[1],
                  distance_unit: s.key.split(":")[2],
                })
              }
              onOpenSource={(record) =>
                record.source &&
                navigate({
                  view: "training",
                  date: record.date,
                  session: record.source.workout_id,
                  exercise: record.source.item_id,
                })
              }
              onOpenDate={(date, id) => setPreview({ date, id })}
            />
          ))}
        </div>
      )}
      {history && exerciseId && (
        <RecordHistory
          owner={owner}
          exerciseId={exerciseId}
          date={date}
          filter={history}
          navigate={navigate}
          onGraph={() => {
            setMetric("rep_maxes");
            setReps(history.reps);
            setDays(0);
            setHistory(null);
          }}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  );
}
function ProgressCard({
  series,
  recordsOnly,
  allTime = false,
  compact = false,
  exerciseName = "",
  repLimit,
  onRepLimit,
  onHistory,
  onOpenSource,
  onOpenDate,
}: {
  series: ProgressSeries;
  recordsOnly: boolean;
  allTime?: boolean;
  compact?: boolean;
  exerciseName?: string;
  repLimit?: number;
  onRepLimit?: (value: number) => void;
  onHistory?: (reps: number) => void;
  onOpenSource?: (record: ProgressSeries["records"][number]) => void;
  onOpenDate: (date: string, workoutId?: string) => void;
}) {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replaceAll(":", "");
  const [showPoints, setShowPoints] = useState(true);
  const [trend, setTrend] = useState(false);
  const [fromZero, setFromZero] = useState(!compact);
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [chartWidth, setChartWidth] = useState(600);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const resize = () => {
      const width = chart.getBoundingClientRect().width;
      if (width > 0) setChartWidth(Math.max(160, width));
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const selected =
    selectedPoint === null ? undefined : series.points[selectedPoint];
  const values = series.points.map((p) => p.value);
  const max = Math.max(...values, 0) || 10;
  const low = fromZero
    ? 0
    : Math.max(
        0,
        Math.min(...values) - Math.max(1, (max - Math.min(...values)) * 0.1),
      );
  const roughStep = (max - low || 10) / 8;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step =
    [1, 2, 5, 10].find((n) => n * magnitude >= roughStep)! * magnitude;
  const axisMin = Math.floor(low / step) * step;
  const tickCount = Math.max(1, Math.ceil((max - axisMin) / step));
  const axisMax = axisMin + tickCount * step;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Number((axisMin + i * step).toPrecision(12)),
  );
  const xMin = series.points.length ? Date.parse(series.points[0].date) : 0,
    xMax = series.points.length ? Date.parse(series.points.at(-1)!.date) : 0;
  const xRight = chartWidth - 20;
  const dateLabel = (date: string) =>
    chartWidth < 400
      ? new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : date;
  const points = series.points
    .map(
      (p) =>
        `${xMax === xMin ? (80 + xRight) / 2 : 80 + ((Date.parse(p.date) - xMin) / (xMax - xMin)) * (xRight - 80)},${160 - ((p.value - axisMin) / (axisMax - axisMin)) * 140}`,
    )
    .join(" ");
  return (
    <section className="workout-inset chart-surface">
      <h3>
        {series.title} · {series.unit}
      </h3>
      {!recordsOnly && (
        <details className="workout-graph-options">
          <summary aria-label="Graph options" title="Graph options">
            <span aria-hidden="true">⋮</span>
            <span className="visually-hidden">Graph options</span>
          </summary>
          {compact && repLimit !== undefined && (
            <label>
              Estimated 1RM rep limit
              <select
                aria-label="Estimated 1RM rep limit"
                value={repLimit}
                onChange={(event) => onRepLimit?.(Number(event.target.value))}
              >
                {Array.from({ length: 30 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="workout-check">
            <input
              type="checkbox"
              checked={showPoints}
              onChange={(event) => setShowPoints(event.target.checked)}
            />
            Graph points
          </label>
          <label className="workout-check">
            <input
              type="checkbox"
              checked={trend}
              onChange={(event) => setTrend(event.target.checked)}
            />
            Trend line
          </label>
          <label className="workout-check">
            <input
              type="checkbox"
              checked={fromZero}
              onChange={(event) => setFromZero(event.target.checked)}
            />
            Y-axis from 0
          </label>
          <button
            disabled={sharing}
            onClick={async () => {
              setSharing(true);
              try {
                setShareMessage(
                  await shareGraph(
                    chartRef.current!,
                    `${exerciseName ? exerciseName + " · " : ""}${series.title}`,
                  ),
                );
              } catch (error) {
                setShareMessage(
                  error instanceof Error
                    ? error.message
                    : "Graph could not share.",
                );
              } finally {
                setSharing(false);
              }
            }}
          >
            Share graph
          </button>
          {shareMessage && <p role="status">{shareMessage}</p>}
        </details>
      )}
      {!recordsOnly && (
        <svg
          className="workout-progress-chart"
          ref={chartRef}
          viewBox={`0 0 ${chartWidth} 190`}
          role="img"
          aria-label={`${series.title} by training date; exact values in table below`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="80" y="20" width={xRight - 80} height="140" />
            </clipPath>
          </defs>
          {ticks.map((tick) => {
            const y = 160 - ((tick - axisMin) / (axisMax - axisMin)) * 140;
            return (
              <g key={tick}>
                <line
                  x1="80"
                  x2={xRight}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-grid)"
                />
                <text
                  x="70"
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--text-dim)"
                  fontSize="12"
                >
                  {series.unit.startsWith("min/")
                    ? formatProgressValue(tick, series.unit)
                    : `${tick.toLocaleString("en-GB", { maximumFractionDigits: 6 })} ${series.unit}`}
                </text>
              </g>
            );
          })}
          <path
            d={`M80 20V160H${xRight}`}
            fill="none"
            stroke="var(--chart-axis)"
          />
          <polygon
            points={`${points.split(" ")[0].split(",")[0]},160 ${points} ${points.split(" ").at(-1)!.split(",")[0]},160`}
            fill="var(--chart-fill)"
          />
          <polyline
            points={points}
            fill="none"
            stroke="var(--chart-line)"
            strokeWidth="3"
          />
          {trend &&
            series.points.length > 1 &&
            (() => {
              const coordinates = points
                .split(" ")
                .map((point) => point.split(",").map(Number));
              const meanX =
                  coordinates.reduce((sum, point) => sum + point[0], 0) /
                  coordinates.length,
                meanY =
                  coordinates.reduce((sum, point) => sum + point[1], 0) /
                  coordinates.length;
              const denominator = coordinates.reduce(
                (sum, point) => sum + (point[0] - meanX) ** 2,
                0,
              );
              const slope = denominator
                ? coordinates.reduce(
                    (sum, point) =>
                      sum + (point[0] - meanX) * (point[1] - meanY),
                    0,
                  ) / denominator
                : 0;
              return (
                <line
                  clipPath={`url(#${clipId})`}
                  data-testid="graph-trend-line"
                  x1={80}
                  y1={meanY + slope * (80 - meanX)}
                  x2={xRight}
                  y2={meanY + slope * (xRight - meanX)}
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                />
              );
            })()}
          {series.points.map((p, n) => {
            const [x, y] = points.split(" ")[n].split(",");
            return (
              <g
                key={`${p.date}:${n}`}
                className="workout-progress-point"
                onClick={() => setSelectedPoint(n)}
              >
                <circle
                  data-testid="graph-hit-target"
                  cx={x}
                  cy={y}
                  r="12"
                  fill="transparent"
                />
                {(showPoints || selectedPoint === n) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={selectedPoint === n ? "6" : "4"}
                    fill="var(--chart-line)"
                  />
                )}
                <title>
                  {p.date}
                  {p.session ? ` · ${p.session}` : ""}:{" "}
                  {formatProgressValue(p.value, series.unit)}
                </title>
              </g>
            );
          })}
          <text x="80" y="187" fill="var(--text-dim)" fontSize="11">
            {dateLabel(series.points[0].date)}
          </text>
          <text
            x={xRight}
            y="187"
            textAnchor="end"
            fill="var(--text-dim)"
            fontSize="11"
          >
            {dateLabel(series.points.at(-1)!.date)}
          </text>
        </svg>
      )}
      {!recordsOnly && (
        <>
          <div className="workout-graph-point-navigation">
            <button
              aria-label="Previous graph point"
              disabled={selectedPoint === 0 || !series.points.length}
              onClick={() =>
                setSelectedPoint(
                  selectedPoint === null
                    ? series.points.length - 1
                    : Math.max(0, selectedPoint - 1),
                )
              }
            >
              ‹
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                selected && onOpenDate(selected.date, selected.workoutId)
              }
            >
              {selected
                ? `${formatProgressValue(selected.value, series.unit)}${selected.source ? ` (${Number(selected.source.weight)} ${series.unit} × ${selected.source.reps} reps)` : ""} · ${selected.date}`
                : "Tap a point for details"}
            </button>
            <button
              aria-label="Next graph point"
              disabled={
                selectedPoint === series.points.length - 1 ||
                !series.points.length
              }
              onClick={() =>
                setSelectedPoint(
                  selectedPoint === null
                    ? 0
                    : Math.min(series.points.length - 1, selectedPoint + 1),
                )
              }
            >
              ›
            </button>
          </div>
          <label className={compact ? "visually-hidden" : undefined}>
            Graph point details
            <select
              value={selectedPoint ?? ""}
              onChange={(event) =>
                setSelectedPoint(
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
            >
              <option value="">Tap a graph point or select a date…</option>
              {series.points.map((point, index) => (
                <option key={index} value={index}>
                  {point.date}
                  {point.session ? ` · ${point.session}` : ""}:{" "}
                  {formatProgressValue(point.value, series.unit)}
                </option>
              ))}
            </select>
          </label>
          {selected && !compact && (
            <section
              aria-label="Selected training point"
              className="workout-inset"
            >
              <p>
                {selected.date}
                {selected.session ? ` · ${selected.session}` : ""}:{" "}
                {formatProgressValue(selected.value, series.unit)}
              </p>
              {selected.source && (
                <p>
                  Source set: {Number(selected.source.weight)} {series.unit} ×{" "}
                  {selected.source.reps}{" "}
                  {selected.source.reps === 1 ? "rep" : "reps"}
                </p>
              )}
              <button onClick={() => onOpenDate(selected.date)}>
                View workouts on this date
              </button>
            </section>
          )}
        </>
      )}
      <details
        open={!compact ? true : undefined}
        className="workout-graph-values"
      >
        <summary>Records and values</summary>
        <h4>
          {allTime
            ? "All-time bests through the selected date"
            : "Observed records in this window"}
        </h4>
        <div className="workout-table-wrap">
          <table className="workout-progress-table">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Value</th>
                <th scope="col">Recorded on</th>
                {allTime && series.records.some((record) => record.source) && (
                  <th scope="col">Source / History</th>
                )}
              </tr>
            </thead>
            <tbody>
              {series.records.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{formatProgressValue(r.value, r.unit)}</td>
                  <td>{r.date}</td>
                  {allTime &&
                    series.records.some((record) => record.source) && (
                      <td>
                        {r.source && (
                          <>
                            <p>
                              {Number(r.source.weight)} {r.unit} ×{" "}
                              {r.source.reps} reps
                            </p>
                            <button onClick={() => onOpenSource?.(r)}>
                              Open source exercise
                            </button>
                            <button
                              aria-label={`PR history for ${r.label} (${r.unit})`}
                              onClick={() => onHistory?.(r.source!.reps!)}
                            >
                              PR history
                            </button>
                          </>
                        )}
                      </td>
                    )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!recordsOnly && (
          <details>
            <summary>
              {series.points.some((point) => point.session)
                ? "Workout chart values"
                : "Daily chart values"}
            </summary>
            <div className="workout-table-wrap">
              <table className="workout-progress-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {series.points.some((point) => point.session) && (
                      <th scope="col">Session</th>
                    )}
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {series.points.map((p, index) => (
                    <tr key={`${p.date}:${index}`}>
                      <td>{p.date}</td>
                      {p.session && <td>{p.session}</td>}
                      <td>{formatProgressValue(p.value, series.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </details>
    </section>
  );
}
