import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAllRecords, getAllTimeProgress } from "./workout-all-time";
import { useEstimateLimit } from "./use-estimate-limit";
import { RecordHistory } from "./record-history";
import { WorkoutPreview } from "./workout-preview";
import type { NavigateWorkout } from "./workout-navigation";
import type { PersonalRecordRow } from "./workout-api";
export function ExerciseRecords({
  owner,
  date,
  exerciseId,
  navigate,
  onGraph,
}: {
  owner: string;
  date: string;
  exerciseId: string;
  navigate: NavigateWorkout;
  onGraph: (reps: number) => void;
}) {
  const [mode, setMode] = useState<"actual" | "estimated">("actual");
  const [repLimit, setRepLimit] = useEstimateLimit(exerciseId);
  const [history, setHistory] = useState<{
    reps: number;
    weight_unit: string;
    distance_unit: string;
  } | null>(null);
  const [preview, setPreview] = useState<{ date: string; id: string } | null>(
    null,
  );
  const actual = useQuery({
    queryKey: ["workouts", owner, "actual-records", exerciseId, date],
    queryFn: () => getAllRecords(exerciseId, date),
    enabled: mode === "actual",
  });
  const estimates = useQuery({
    queryKey: [
      "workouts",
      owner,
      "estimated-records",
      exerciseId,
      date,
      repLimit,
    ],
    queryFn: () =>
      getAllTimeProgress(exerciseId, date, "estimated_1rm", 5, {
        repLimit,
        perWorkout: true,
      }),
    enabled: mode === "estimated",
  });
  const groups = new Map<string, PersonalRecordRow[]>();
  for (const record of actual.data ?? []) {
    const key = `${record.weight_unit}:${record.distance_unit}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const query = mode === "actual" ? actual : estimates;
  return (
    <div className="workout-records-screen">
      <div className="workout-tabs" aria-label="Record type">
        <button
          aria-pressed={mode === "estimated"}
          onClick={() => setMode("estimated")}
        >
          Estimated
        </button>
        <button
          aria-pressed={mode === "actual"}
          onClick={() => setMode("actual")}
        >
          Actual
        </button>
      </div>
      {mode === "estimated" && (
        <details>
          <summary>Estimate settings</summary>
          <label>
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
          <small>
            Epley estimates from positive completed loads with 1–{repLimit}{" "}
            reps. Estimated loads are not observed records.
          </small>
        </details>
      )}
      {query.isPending ? (
        <p role="status">Loading records…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Records couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry records</button>
        </>
      ) : mode === "actual" ? (
        groups.size ? (
          [...groups].map(([key, rows]) => {
            const counts = [
              ...new Set([
                ...Array.from({ length: 15 }, (_, i) => i + 1),
                ...rows.map((row) => row.reps),
              ]),
            ].sort((a, b) => a - b);
            return (
              <section key={key}>
                {groups.size > 1 && <h3>{key.replace(":", " · ")}</h3>}
                <div className="workout-record-list">
                  {counts.map((reps) => {
                    const observed = rows.find((row) => row.reps === reps),
                      best = rows
                        .filter((row) => row.reps >= reps)
                        .sort(
                          (a, b) =>
                            Number(b.value) - Number(a.value) ||
                            b.reps - a.reps,
                        )[0];
                    return (
                      <div
                        key={reps}
                        className={
                          best && best.reps !== reps ? "is-inferred" : ""
                        }
                      >
                        <span>{reps}RM</span>
                        {best ? (
                          <button
                            aria-label={`${reps}RM ${best.reps === reps ? "record" : "inferred"}: ${Number(best.value)} ${best.weight_unit}`}
                            onClick={() =>
                              setHistory({
                                reps: best.reps,
                                weight_unit: best.weight_unit,
                                distance_unit: best.distance_unit,
                              })
                            }
                          >
                            <strong>
                              {Number(best.value)} {best.weight_unit}
                            </strong>
                            <small>{best.date}</small>
                            {best.reps !== reps && (
                              <small>Inferred from {best.reps} reps</small>
                            )}
                          </button>
                        ) : (
                          <span className="workout-note">—</span>
                        )}
                        {observed && best?.reps !== reps && (
                          <button
                            className="workout-record-observed"
                            onClick={() =>
                              setHistory({
                                reps,
                                weight_unit: observed.weight_unit,
                                distance_unit: observed.distance_unit,
                              })
                            }
                          >
                            Observed: {Number(observed.value)}{" "}
                            {observed.weight_unit}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <p>No completed strength records through this date.</p>
        )
      ) : estimates.data?.series.length ? (
        estimates.data.series.map((series) => {
          const best = series.points.reduce((a, b) =>
            b.value > a.value ? b : a,
          );
          return (
            <section key={series.key}>
              <h3>{series.unit}</h3>
              <div className="workout-record-list">
                {Array.from({ length: 15 }, (_, index) => {
                  const reps = index + 1,
                    value =
                      reps === 1 ? best.value : best.value / (1 + reps / 30);
                  return (
                    <div key={reps}>
                      <span>{reps}RM</span>
                      <button
                        onClick={() => setPreview({ date: best.date, id: "" })}
                      >
                        <strong>
                          {value.toFixed(1)} {series.unit}
                        </strong>
                        <small>{best.date} · estimated</small>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      ) : (
        <p>No eligible completed lifts for this estimate.</p>
      )}
      {history && (
        <RecordHistory
          newestFirst
          owner={owner}
          exerciseId={exerciseId}
          date={date}
          filter={history}
          navigate={navigate}
          onGraph={() => {
            onGraph(history.reps);
            setHistory(null);
          }}
          onClose={() => setHistory(null)}
        />
      )}
      {preview && (
        <WorkoutPreview
          owner={owner}
          date={preview.date}
          workoutId={preview.id || undefined}
          navigate={navigate}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
