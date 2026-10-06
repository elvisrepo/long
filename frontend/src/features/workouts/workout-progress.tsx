import { useEffect, useRef, useState } from "react";
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
import { RecordHistory } from "./record-history";

export function WorkoutProgress({
  owner,
  date,
  exerciseId,
  catalog,
  navigate,
  showExerciseSelector = true,
}: {
  owner: string;
  date: string;
  exerciseId?: string;
  catalog: api.WorkoutCatalog;
  navigate: NavigateWorkout;
  showExerciseSelector?: boolean;
}) {
  const [days, setDays] = useState(90);
  const [metric, setMetric] = useState<ProgressMetric | null>(null);
  const [reps, setReps] = useState(5);
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
    ],
    queryFn: () => getAllTimeProgress(exerciseId!, date, selectedMetric, reps),
    enabled: !!exerciseId && days === 0,
  });
  const query = days === 0 ? allTimeQuery : windowQuery;
  const displayedOptions =
    days === 0
      ? progressMetrics([...types, ...(allTimeQuery.data?.types ?? [])])
      : options;
  const series =
    days === 0
      ? (allTimeQuery.data?.series ?? [])
      : windowQuery.data && exerciseId
        ? progressSeries(windowQuery.data, exerciseId, selectedMetric, reps)
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
    <section className="workout-card">
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
        {selectedMetric === "max_weight_reps" && (
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
        <label>
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
      <p>
        {days === 0
          ? `All recorded training through ${date}. Completed sets only; saved types and units stay separate.`
          : `${from} – ${date}. Completed sets only; saved types and units stay separate. These are records within this window, not all-time records.`}
      </p>
      {selectedMetric === "personal_records" && (
        <p className="workout-note">
          Personal records here are actual strength loads by rep count. Cardio
          and timed exercise bests are available through their distance and
          duration graphs.
        </p>
      )}
      {selectedMetric === "estimated_1rm" && (
        <p className="workout-note">
          Estimate only: Epley load × (1 + reps / 30); one rep uses the recorded
          load. Only positive loads with 1–10 reps are included. Higher-rep sets
          are excluded because their estimates are less dependable. This is not
          a measured maximum and does not account for reps left in reserve; an
          easy set can underestimate your capability.
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
          Volume = recorded load × reps, not body weight. Max volume is one set;
          workout volume totals this exercise within each session. Same-day
          sessions stay separate.
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
              key={`${exerciseId}:${from}:${date}:${selectedMetric}:${reps}:${s.key}`}
              series={s}
              recordsOnly={selectedMetric === "personal_records"}
              allTime={days === 0}
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
              onOpenDate={(date) => navigate({ view: "home", date })}
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
  onHistory,
  onOpenSource,
  onOpenDate,
}: {
  series: ProgressSeries;
  recordsOnly: boolean;
  allTime?: boolean;
  onHistory?: (reps: number) => void;
  onOpenSource?: (record: ProgressSeries["records"][number]) => void;
  onOpenDate: (date: string) => void;
}) {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
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
  const roughStep = max / 8;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step =
    [1, 2, 5, 10].find((n) => n * magnitude >= roughStep)! * magnitude;
  const tickCount = Math.ceil(max / step);
  const axisMax = tickCount * step;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Number((i * step).toPrecision(12)),
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
        `${xMax === xMin ? (80 + xRight) / 2 : 80 + ((Date.parse(p.date) - xMin) / (xMax - xMin)) * (xRight - 80)},${160 - (p.value / axisMax) * 140}`,
    )
    .join(" ");
  return (
    <section className="workout-inset chart-surface">
      <h3>
        {series.title} · {series.unit}
      </h3>
      {!recordsOnly && (
        <svg
          className="workout-progress-chart"
          ref={chartRef}
          viewBox={`0 0 ${chartWidth} 190`}
          role="img"
          aria-label={`${series.title} by training date; exact values in table below`}
        >
          {ticks.map((tick) => {
            const y = 160 - (tick / axisMax) * 140;
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
          <path d={`M80 20V160H${xRight}`} fill="none" stroke="var(--chart-axis)" />
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
          {series.points.map((p, n) => {
            const [x, y] = points.split(" ")[n].split(",");
            return (
              <g
                key={`${p.date}:${n}`}
                className="workout-progress-point"
                onClick={() => setSelectedPoint(n)}
              >
                <circle cx={x} cy={y} r="12" fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={selectedPoint === n ? "6" : "4"}
                  fill="var(--chart-line)"
                />
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
          <label>
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
          {selected && (
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
                {allTime && series.records.some((record) => record.source) && (
                  <td>
                    {r.source && (
                      <>
                        <p>
                          {Number(r.source.weight)} {r.unit} × {r.source.reps}{" "}
                          reps
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
    </section>
  );
}
