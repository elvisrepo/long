import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function HistorySetEditor({
  item,
  set,
  busy,
  run,
  onClose,
}: {
  item: api.WorkoutExercise;
  set: api.WorkoutSet;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const locked = busy || pending;
  const fields: {
    name: "weight" | "reps" | "distance" | "duration_seconds";
    label: string;
    max: number;
    min: number;
    step: string;
    required: boolean;
  }[] =
    item.tracking_type === "cardio"
      ? [
          {
            name: "distance",
            label: `Distance (${item.distance_unit})`,
            min: 0.001,
            max: 9999999.999,
            step: ".001",
            required: true,
          },
          {
            name: "duration_seconds",
            label: "Duration (seconds)",
            min: 1,
            max: 2147483647,
            step: "1",
            required: true,
          },
        ]
      : item.tracking_type === "duration"
        ? [
            {
              name: "duration_seconds",
              label: "Duration (seconds)",
              min: 1,
              max: 2147483647,
              step: "1",
              required: true,
            },
          ]
        : [
            {
              name: "weight",
              label: `Weight (${item.weight_unit})`,
              min: 0,
              max: 9999999.999,
              step: ".001",
              required: item.tracking_type === "strength",
            },
            {
              name: "reps",
              label: "Reps",
              min: 1,
              max: 100000,
              step: "1",
              required: true,
            },
          ];
  return (
    <Modal labelledBy="history-edit-title" busy={locked} onClose={onClose}>
      <h2 id="history-edit-title">Edit set</h2>
      {error && <p role="alert">{error}</p>}
      <form
        className="workout-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget),
            changes: api.SetInput = {
              comment: String(data.get("comment") ?? ""),
            };
          for (const field of fields) {
            const value = String(data.get(field.name) ?? "").trim();
            if (field.name === "weight" || field.name === "distance")
              changes[field.name] = value || null;
            else changes[field.name] = value ? Number(value) : null;
          }
          setPending(true);
          setError("");
          run(async () => {
            try {
              await api.saveWorkoutSet(item.id, set.id, changes);
              onClose();
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Set could not save.",
              );
            } finally {
              setPending(false);
            }
          });
        }}
      >
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            <input
              name={field.name}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              defaultValue={set[field.name] ?? ""}
              required={set.is_completed && field.required}
              disabled={locked}
            />
          </label>
        ))}
        <label>
          Comment
          <textarea
            name="comment"
            maxLength={2000}
            defaultValue={set.comment}
            disabled={locked}
          />
        </label>
        <small>
          Completion stays {set.is_completed ? "completed" : "planned"}.
        </small>
        <div className="workout-actions">
          <button className="primary-button" disabled={locked}>
            Save changes
          </button>
          <button type="button" disabled={locked} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
