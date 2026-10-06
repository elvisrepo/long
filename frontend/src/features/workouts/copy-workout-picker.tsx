import { useState } from "react";
import { Modal } from "../../components/modal";
import { type Workout } from "./workout-api";
import { CopyWorkoutDialog } from "./copy-workout-dialog";
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
  const [source, setSource] = useState<Workout | null>(null);
  const locked = busy;
  if (source)
    return (
      <CopyWorkoutDialog
        source={source}
        destination={destination}
        busy={busy}
        run={run}
        navigate={navigate}
        onClose={onClose}
        onBack={() => setSource(null)}
      />
    );
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
          }
        }}
        renderSelectedDay={(sessions) => (
          <div className="workout-stack">
            <h3>{dayLabel(sourceDate)}</h3>
            {sessions.length === 0 && (
              <p>
                No matching workouts on this day. Choose a marked date, reset
                filters or browse another month.
              </p>
            )}
            {sessions.map((session) => (
              <section className="workout-card" key={session.id}>
                <h3>{session.name || "Workout"}</h3>
                <p>
                  Full workout: {session.exercises.length}{" "}
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
                  onClick={() => setSource(session)}
                  aria-label={`Copy ${session.name || "Workout"} to ${destination}`}
                >
                  Select this workout
                </button>
              </section>
            ))}
          </div>
        )}
      />
      <button disabled={locked} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
