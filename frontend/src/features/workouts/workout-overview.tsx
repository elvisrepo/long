import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "./workout-api";
import { setLabel, shiftDay, type NavigateWorkout } from "./workout-navigation";
import { WorkoutProgress } from "./workout-progress";
import { ExerciseGoals } from "./exercise-goals";

function Statistics({
  owner,
  date,
  exerciseId,
  navigate,
}: {
  owner: string;
  date: string;
  exerciseId: string;
  navigate: NavigateWorkout;
}) {
  const query = useQuery({
    queryKey: ["workouts", owner, "statistics", exerciseId, date],
    queryFn: () => api.getExerciseStats(exerciseId, date),
  });
  return (
    <section className="workout-stack">
      <p>
        Completed sets only, through {date}. Saved exercise types and units stay
        separate. Volume is recorded load × reps, not body weight.
      </p>
      {query.isPending ? (
        <p role="status">Loading exercise statistics…</p>
      ) : query.isError ? (
        <div>
          <p role="alert">Exercise statistics couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry statistics</button>
        </div>
      ) : query.data.groups.length ? (
        query.data.groups.map((group) => (
          <section
            className="workout-card"
            key={`${group.tracking_type}:${group.weight_unit}:${group.distance_unit}`}
          >
            <h3>
              {group.tracking_type} · {group.weight_unit} ·{" "}
              {group.distance_unit}
            </h3>
            <dl className="workout-statistics">
              <dt>Completed sessions</dt>
              <dd>{group.session_count}</dd>
              <dt>Completed sets</dt>
              <dd>{group.set_count}</dd>
              {group.reps_total !== null && (
                <>
                  <dt>Total reps</dt>
                  <dd>{group.reps_total}</dd>
                </>
              )}
              {group.volume_total !== null && (
                <>
                  <dt>Total recorded volume</dt>
                  <dd>
                    {Number(group.volume_total)} {group.weight_unit}·reps
                  </dd>
                </>
              )}
              {group.distance_total !== null && (
                <>
                  <dt>Total distance</dt>
                  <dd>
                    {Number(group.distance_total)} {group.distance_unit}
                  </dd>
                </>
              )}
              {group.duration_seconds_total !== null && (
                <>
                  <dt>Total duration</dt>
                  <dd>{group.duration_seconds_total} sec</dd>
                </>
              )}
            </dl>
            <div className="workout-actions">
              <button
                onClick={() =>
                  navigate({ view: "home", date: group.first_date })
                }
              >
                First training: {group.first_date}
              </button>
              <button
                onClick={() =>
                  navigate({ view: "home", date: group.last_date })
                }
              >
                Last training: {group.last_date}
              </button>
            </div>
          </section>
        ))
      ) : (
        <p>No completed sets through this date.</p>
      )}
    </section>
  );
}

export function WorkoutOverview({
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
  const [tab, setTab] = useState("Statistics");
  const exercise = catalog.exercises.find((e) => e.id === exerciseId);
  return (
    <section className="workout-stack">
      <label>
        Overview exercise
        <select
          value={exerciseId ?? ""}
          onChange={(e) =>
            navigate({
              view: "overview",
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
      {exercise && <h2>{exercise.name}</h2>}
      <nav className="workout-tabs" aria-label="Exercise overview sections">
        {["Statistics", "History", "Graphs", "Records", "Goals"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {!exerciseId ? (
        <p>Choose an exercise to review.</p>
      ) : tab === "Statistics" ? (
        <Statistics
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          navigate={navigate}
        />
      ) : tab === "History" ? (
        <ExerciseHistory
          key={`${exerciseId}:${date}`}
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          navigate={navigate}
        />
      ) : tab === "Goals" ? (
        exercise ? (
          <ExerciseGoals
            key={exerciseId}
            owner={owner}
            date={date}
            exercise={exercise}
            canCreate={
              exercise.is_active &&
              catalog.categories.some(
                (c) => c.id === exercise.category_id && c.is_active,
              )
            }
            navigate={navigate}
          />
        ) : (
          <p role="alert">Exercise is unavailable.</p>
        )
      ) : (
        <WorkoutProgress
          key={`${exerciseId}:${tab}`}
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          catalog={catalog}
          navigate={(next) =>
            navigate({
              ...next,
              view: next.view === "progress" ? "overview" : next.view,
            })
          }
          initialMetric={tab === "Records" ? "personal_records" : null}
          initialDays={tab === "Records" ? 0 : 90}
        />
      )}
    </section>
  );
}

function ExerciseHistory({
  owner,
  date,
  exerciseId,
  navigate,
}: {
  owner: string;
  date: string;
  exerciseId: string;
  navigate: NavigateWorkout;
}) {
  const [offset, setOffset] = useState(0);
  const from = shiftDay(date, -89);
  const query = useQuery({
    queryKey: [
      "workouts",
      owner,
      "overview-history",
      exerciseId,
      from,
      date,
      offset,
    ],
    queryFn: () => api.getWorkoutPage(from, date, offset, exerciseId),
  });
  if (query.isPending) return <p role="status">Loading exercise history…</p>;
  if (query.isError)
    return (
      <div>
        <p role="alert">Exercise history couldn't load.</p>
        <button onClick={() => void query.refetch()}>Retry history</button>
      </div>
    );
  return (
    <div className="workout-stack">
      <p>
        {from} – {date} · {query.data.count} sessions. Planned sets are shown,
        but do not count toward statistics or goals.
      </p>
      {!query.data.results.length && (
        <p>
          No sessions in this range. Choose an earlier tracking date for older
          history.
        </p>
      )}
      {query.data.results.map((w) => (
        <section className="workout-card" key={w.id}>
          <h3>
            {w.performed_on} · {w.name}
          </h3>
          {w.exercises
            .filter((i) => i.exercise_id === exerciseId)
            .map((i) => (
              <div key={i.id}>
                {i.sets.map((s) => (
                  <div key={s.id}>
                    <p>
                      {setLabel(i, s)} ·{" "}
                      {s.is_completed ? "Completed" : "Planned"}
                    </p>
                    {s.comment && <p>{s.comment}</p>}
                  </div>
                ))}
                {!i.sets.length && <p>No sets recorded.</p>}
                <button
                  onClick={() =>
                    navigate({
                      view: "training",
                      date: w.performed_on,
                      session: w.id,
                      exercise: i.id,
                    })
                  }
                >
                  Open exercise
                </button>
              </div>
            ))}
        </section>
      ))}
      <div className="workout-actions">
        <button
          disabled={!query.data.previous}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous history page
        </button>
        <button
          disabled={!query.data.next}
          onClick={() => setOffset(offset + 100)}
        >
          Next history page
        </button>
      </div>
    </div>
  );
}
