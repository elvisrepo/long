import { useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { dayLabel, setLabel, type NavigateWorkout } from "./workout-navigation";
import { historyWorkoutStats } from "./history-stats";
import { useState } from "react";
export function WorkoutPreview({
  owner,
  date,
  workoutId,
  navigate,
  onClose,
}: {
  owner: string;
  date: string;
  workoutId?: string;
  navigate: NavigateWorkout;
  onClose: () => void;
}) {
  const [exercise, setExercise] = useState<api.WorkoutExercise | null>(null);
  const query = useQuery({
    queryKey: ["workouts", owner, "preview", date, workoutId],
    queryFn: async () =>
      workoutId
        ? [await api.getWorkout(workoutId)]
        : (await api.getWorkoutRange(date, date)).filter(
            (workout) => workout.performed_on === date,
          ),
  });
  return (
    <Modal
      labelledBy="workout-preview-title"
      className="workout-preview-modal"
      onClose={onClose}
    >
      <h2 id="workout-preview-title">{dayLabel(date)}</h2>
      {query.isPending ? (
        <p role="status">Loading workout…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Workout could not load.</p>
          <button onClick={() => void query.refetch()}>Retry workout</button>
        </>
      ) : exercise ? (
        <>
          <h3>{exercise.exercise_name}</h3>
          {historyWorkoutStats([exercise])
            .flatMap((group) => group.stats)
            .map((stat) => (
              <p key={stat.label}>
                <strong>{stat.label}</strong>
                <br />
                {stat.value}
              </p>
            ))}
          <button
            onClick={() => {
              onClose();
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
        </>
      ) : query.data.length ? (
        <div className="workout-preview-list">
          {query.data.map((workout) => (
            <section key={workout.id}>
              {query.data.length > 1 && <h3>{workout.name}</h3>}
              {workout.exercises.map((item) => (
                <button
                  key={item.id}
                  className="workout-preview-exercise"
                  onClick={() => setExercise(item)}
                >
                  <strong>{item.exercise_name}</strong>
                  {item.sets.map((set) => (
                    <span key={set.id}>
                      {setLabel(item, set)}
                      {!set.is_completed && " · Planned"}
                      {set.comment && <small>{set.comment}</small>}
                    </span>
                  ))}
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p>No workouts on this date.</p>
      )}
      <div className="workout-actions">
        <button onClick={onClose}>Close</button>
        <button
          onClick={() => {
            onClose();
            navigate({
              view: "home",
              date,
              ...(workoutId ? { session: workoutId } : {}),
            });
          }}
        >
          Go to workout
        </button>
      </div>
    </Modal>
  );
}
