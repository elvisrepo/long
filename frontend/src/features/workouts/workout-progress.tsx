import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "./workout-api";
import { progressSeries, type ProgressSeries } from "./workout-analysis";
import { shiftDay, type NavigateWorkout } from "./workout-navigation";

export function WorkoutProgress({
  owner,
  date,
  exerciseId,
  catalog,
  navigate,
}: {
  owner: string;
  date: string;
  exerciseId?: string;
  catalog: api.WorkoutCatalog;
  navigate: NavigateWorkout;
}) {
  const [days, setDays] = useState(90);
  const from = shiftDay(date, 1 - days);
  const query = useQuery({
    queryKey: ["workouts", owner, "progress", exerciseId, from, date],
    queryFn: () => api.getWorkoutRange(from, date, exerciseId),
    enabled: !!exerciseId,
  });
  const series =
    query.data && exerciseId ? progressSeries(query.data, exerciseId) : [];
  return (
    <section className="workout-card">
      <div className="workout-filters">
        <label>
          Progress exercise
          <select
            value={exerciseId ?? ""}
            onChange={(e) =>
              navigate({
                view: "progress",
                date,
                exercise: e.target.value || undefined,
              })
            }
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
        <label>
          Progress window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
        </label>
      </div>
      <p>
        {from} – {date}. Completed sets only; saved types and units stay
        separate. These are records within this window, not all-time records.
      </p>
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
        <p>No completed sets recorded in this window.</p>
      ) : (
        <div className="workout-stack">
          {series.map((s) => (
            <ProgressCard key={s.key} series={s} />
          ))}
        </div>
      )}
    </section>
  );
}
function ProgressCard({ series }: { series: ProgressSeries }) {
  const values = series.points.map((p) => p.value);
  const min = Math.min(...values),
    max = Math.max(...values);
  const xMin = Date.parse(series.points[0].date),
    xMax = Date.parse(series.points.at(-1)!.date);
  const points = series.points
    .map(
      (p) =>
        `${20 + ((Date.parse(p.date) - xMin) / (xMax - xMin || 1)) * 560},${160 - ((p.value - min) / (max - min || 1)) * 130}`,
    )
    .join(" ");
  return (
    <section className="workout-inset">
      <h3>
        {series.title} · {series.unit}
      </h3>
      {series.points.length > 1 && (
        <svg
          className="workout-progress-chart"
          viewBox="0 0 600 190"
          role="img"
          aria-label={`${series.title} by training date; exact values in table below`}
        >
          <path d="M20 15V170H580" fill="none" stroke="var(--border)" />
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
          />
          {series.points.map((p, n) => {
            const [x, y] = points.split(" ")[n].split(",");
            return (
              <circle key={p.date} cx={x} cy={y} r="4" fill="var(--accent)">
                <title>
                  {p.date}: {p.value} {series.unit}
                </title>
              </circle>
            );
          })}
          <text x="20" y="187" fill="var(--text-dim)" fontSize="11">
            {series.points[0].date}
          </text>
          <text
            x="580"
            y="187"
            textAnchor="end"
            fill="var(--text-dim)"
            fontSize="11"
          >
            {series.points.at(-1)!.date}
          </text>
        </svg>
      )}
      <h4>Observed records in this window</h4>
      <div className="workout-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Value</th>
              <th scope="col">Recorded on</th>
            </tr>
          </thead>
          <tbody>
            {series.records.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>
                  {r.value} {r.unit}
                </td>
                <td>{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Daily chart values</summary>
        <div className="workout-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Highest value</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>
                    {p.value} {series.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
