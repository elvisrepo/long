import { useState } from "react";
import { Modal } from "../../components/modal";
import { copyWorkout, type Workout } from "./workout-api";
import { WorkoutCalendar } from "./workout-calendar";
import {
  dayLabel,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

export function CopyWorkoutPicker({
  owner,
  destination,
  busy,
  run,
  navigate,
  onClose,
}: {
  owner: string;
  destination: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
  onClose: () => void;
}) {
  const [sourceDate, setSourceDate] = useState(destination);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || pending;
  function copy(source: Workout) {
    if (locked) return;
    setPending(true);
    setError("");
    run(async () => {
      try {
        await copyWorkout(source.id, destination);
        onClose();
        navigate({ view: "home", date: destination });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Workout couldn't be copied. Please try again.",
        );
      } finally {
        setPending(false);
      }
    });
  }
  return (
    <Modal labelledBy="copy-workout-title" busy={locked} onClose={onClose}>
      <h2 id="copy-workout-title">Select the workout you would like to copy</h2>
      <p>
        Copy to {dayLabel(destination)}. Sets will be planned; the original
        workout stays unchanged.
      </p>
      <WorkoutCalendar
        owner={owner}
        date={sourceDate}
        busy={locked}
        navigate={(next) => {
          if (next.date) {
            setSourceDate(next.date);
            setError("");
          }
        }}
        renderSelectedDay={(sessions) => (
          <div className="workout-stack">
            <h3>{dayLabel(sourceDate)}</h3>
            {sessions.length === 0 && (
              <p>
                No workouts on this day. Choose a marked date or browse another
                month.
              </p>
            )}
            {sessions.map((session) => (
              <section className="workout-card" key={session.id}>
                <h3>{session.name || "Workout"}</h3>
                <p>
                  {session.exercises.length}{" "}
                  {session.exercises.length === 1 ? "exercise" : "exercises"} ·{" "}
                  {session.completed_set_count} completed{" "}
                  {session.completed_set_count === 1 ? "set" : "sets"}
                </p>
                <p>
                  {session.exercises
                    .map((exercise) => exercise.exercise_name)
                    .join(", ") || "No exercises"}
                </p>
                <button
                  className="primary-button"
                  disabled={locked || session.exercises.length === 0}
                  onClick={() => copy(session)}
                  aria-label={`Copy ${session.name || "Workout"} to ${destination}`}
                >
                  Copy this workout
                </button>
              </section>
            ))}
          </div>
        )}
      />
      {pending && <p role="status">Copying workout…</p>}
      {error && <p role="alert">{error}</p>}
      <button disabled={locked} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
