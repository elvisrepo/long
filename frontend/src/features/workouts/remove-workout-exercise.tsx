import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function RemoveWorkoutExercise({
  item,
  finished,
  busy,
  run,
  onRemoved,
}: {
  item: api.WorkoutExercise;
  finished: boolean;
  busy: boolean;
  run: RunAction;
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = busy || pending;
  return (
    <>
      <button
        className="workout-danger"
        disabled={disabled || finished}
        title={
          finished ? "Reopen the workout before removing exercises" : undefined
        }
        aria-label={`Remove ${item.exercise_name} from workout`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Remove exercise
      </button>
      {open && (
        <Modal
          labelledBy={`remove-workout-exercise-${item.id}`}
          busy={disabled}
          onClose={() => setOpen(false)}
        >
          <h2 id={`remove-workout-exercise-${item.id}`}>
            Remove {item.exercise_name}?
          </h2>
          <p>
            This permanently removes this entry and its sets from this workout
            only. Your library exercise and other workouts are kept.
          </p>
          {error && (
            <p role="alert" className="workout-error">
              {error}
            </p>
          )}
          <div className="workout-actions">
            <button
              disabled={disabled || finished}
              className="workout-danger"
              onClick={() => {
                setPending(true);
                setError("");
                run(async () => {
                  try {
                    await api.deleteWorkoutItem("session-exercises", item.id);
                    setOpen(false);
                    onRemoved?.();
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Exercise couldn't be removed. Please retry.",
                    );
                  } finally {
                    setPending(false);
                  }
                });
              }}
            >
              Confirm exercise removal
            </button>
            <button disabled={disabled} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
