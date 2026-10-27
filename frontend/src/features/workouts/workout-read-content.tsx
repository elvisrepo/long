import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "./workout-api";
import { setLabel, type NavigateWorkout } from "./workout-navigation";
import { historyWorkoutStats } from "./history-stats";

export function WorkoutSetValues({
  item,
  row,
}: {
  item: api.WorkoutExercise;
  row: api.WorkoutSet;
}) {
  const values =
    item.tracking_type === "duration"
      ? [`${row.duration_seconds ?? "—"} sec`]
      : item.tracking_type === "cardio"
        ? [
            `${row.distance === null ? "—" : Number(row.distance)} ${item.distance_unit}`,
            `${row.duration_seconds ?? "—"} sec`,
          ]
        : [
            `${row.weight === null ? "—" : Number(row.weight)} ${item.weight_unit}`,
            `${row.reps ?? "—"} reps`,
          ];
  return (
    <span
      className="workout-read-set"
      aria-label={`${setLabel(item, row)}${row.is_completed ? "" : " · Planned"}`}
    >
      <span className="workout-read-quantities">
        {values.map((value, index) => (
          <span key={index}>{value}</span>
        ))}
      </span>
      {!row.is_completed && (
        <small className="workout-read-planned">Planned</small>
      )}
      {row.comment && (
        <small className="workout-read-comment">{row.comment}</small>
      )}
    </span>
  );
}
export function WorkoutReadContent({
  workouts,
  date,
  navigate,
  onNavigate,
}: {
  workouts: api.Workout[];
  date: string;
  navigate: NavigateWorkout;
  onNavigate?: () => void;
}) {
  const [exercise, setExercise] = useState<api.WorkoutExercise | null>(null);
  if (exercise)
    return (
      <section className="workout-read-stats">
        <h3>{exercise.exercise_name}</h3>
        <dl>
          {historyWorkoutStats([exercise])
            .flatMap((group) => group.stats)
            .map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
        </dl>
        <button
          onClick={() => {
            onNavigate?.();
            navigate({
              view: "overview",
              date,
              exercise: exercise.exercise_id,
              section: "history",
            });
          }}
        >
          View exercise overview
        </button>
        <button onClick={() => setExercise(null)}>
          Back to workout preview
        </button>
      </section>
    );
  if (!workouts.length) return <p>No workouts on this date.</p>;
  return (
    <div className="workout-read-content">
      {workouts.map((workout) => (
        <section key={workout.id}>
          {workout.name && (
            <h3 className="workout-read-session-name">{workout.name}</h3>
          )}
          {!workout.exercises.length && <p>Empty workout draft.</p>}
          {workout.exercises.map((item) => (
            <button
              key={item.id}
              type="button"
              className="workout-preview-exercise"
              onClick={() => setExercise(item)}
            >
              <strong>{item.exercise_name}</strong>
              {!item.sets.length && <small>No sets</small>}
              {item.sets.map((row) => (
                <WorkoutSetValues key={row.id} item={item} row={row} />
              ))}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
export function WorkoutDayDetails({
  owner,
  date,
  workoutId,
  navigate,
  onNavigate,
}: {
  owner: string;
  date: string;
  workoutId?: string;
  navigate: NavigateWorkout;
  onNavigate?: () => void;
}) {
  const query = useQuery({
    queryKey: ["workouts", owner, "preview", date, workoutId],
    queryFn: async () =>
      workoutId
        ? [await api.getWorkout(workoutId)]
        : (await api.getWorkoutRange(date, date)).filter(
            (workout) => workout.performed_on === date,
          ),
  });
  if (query.isPending) return <p role="status">Loading workout…</p>;
  if (query.isError)
    return (
      <>
        <p role="alert">Workout could not load.</p>
        <button onClick={() => void query.refetch()}>Retry workout</button>
      </>
    );
  return (
    <WorkoutReadContent
      key={`${date}:${workoutId ?? "all"}`}
      workouts={query.data}
      date={date}
      navigate={navigate}
      onNavigate={onNavigate}
    />
  );
}
