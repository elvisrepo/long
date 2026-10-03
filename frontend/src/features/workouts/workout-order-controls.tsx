import { useState } from "react";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function WorkoutOrderControls({
  kind,
  id,
  label,
  index,
  count,
  disabled,
  run,
}: {
  kind: "session-exercises" | "sets";
  id: string;
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  run: RunAction;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <div
      className="workout-order-controls"
      role="group"
      aria-label={`Order ${label}`}
    >
      <div className="workout-actions">
        {(["up", "down"] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={`Move ${label} ${direction}`}
            disabled={
              disabled ||
              pending ||
              (direction === "up" ? index === 0 : index === count - 1)
            }
            onClick={() => {
              setPending(true);
              setError("");
              setMessage("");
              run(async () => {
                try {
                  await api.moveWorkoutItem(kind, id, direction);
                  setMessage(`Moved ${label} ${direction}.`);
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Order couldn't be saved. Please retry.",
                  );
                } finally {
                  setPending(false);
                }
              });
            }}
          >
            {direction === "up" ? "↑ Move up" : "↓ Move down"}
          </button>
        ))}
      </div>
      <span role="status" className="workout-note">
        {message}
      </span>
      {error && (
        <p role="alert" className="workout-error">
          {error}
        </p>
      )}
    </div>
  );
}
