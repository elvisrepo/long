import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function RoutineActions({
  routine,
  busy,
  onEdit,
  onCopy,
  onDelete,
  onOrder,
  onArchive,
}: {
  routine: api.WorkoutRoutine;
  busy: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onOrder: () => void;
  onArchive: () => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <details
      ref={root}
      className="workout-routine-menu"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Routine actions for ${routine.name}`}>⋮</summary>
      <div className="workout-routine-menu-items">
        {[
          { label: "Edit routine", action: onEdit },
          { label: "Copy routine", action: onCopy },
          {
            label: "Reorder days",
            action: onOrder,
            disabled: !routine.is_active || routine.days.length < 2,
          },
          {
            label: routine.is_active ? "Archive routine" : "Restore routine",
            action: onArchive,
          },
          { label: "Delete routine", action: onDelete, danger: true },
        ].map(({ label, action, disabled, danger }) => (
          <button
            key={label}
            type="button"
            disabled={busy || disabled}
            className={danger ? "workout-danger" : undefined}
            onClick={() => {
              if (root.current) {
                root.current.open = false;
                root.current.querySelector("summary")?.focus();
              }
              action();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function RoutineCopyDialog({
  routine,
  busy,
  run,
  onClose,
  onCopied,
}: {
  routine: api.WorkoutRoutine;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
  onCopied?: (routine: api.WorkoutRoutine) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Modal labelledBy="routine-copy-title" busy={busy} onClose={onClose}>
      <h2 id="routine-copy-title">Copy routine</h2>
      <p>
        Copy {routine.name}, including its days, exercises, groups and
        predefined sets. Your original plan stays unchanged. No workout is
        started.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = String(
            new FormData(event.currentTarget).get("name"),
          ).trim();
          setError("");
          run(async () => {
            try {
              const copied = await api.copyWorkoutRoutine(routine.id, name);
              onCopied?.(copied);
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not copy the routine.",
              );
              throw cause;
            }
          });
        }}
      >
        <label>
          Copy name
          <input
            name="name"
            defaultValue={routine.name.slice(0, 115) + " copy"}
            required
            maxLength={120}
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="workout-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>Create copy</button>
        </div>
      </form>
    </Modal>
  );
}

export function RoutineDeleteDialog({
  routine,
  busy,
  run,
  onClose,
}: {
  routine: api.WorkoutRoutine;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <Modal labelledBy="routine-delete-title" busy={busy} onClose={onClose}>
      <h2 id="routine-delete-title">Delete {routine.name}?</h2>
      <p>
        This permanently deletes the routine and its {routine.days.length} saved
        day templates, exercises and predefined sets. Existing workouts are
        kept. Archive the routine instead if you may want to use it again.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="workout-actions">
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="workout-danger"
          disabled={busy}
          onClick={() => {
            setError("");
            run(async () => {
              try {
                await api.deleteWorkoutRoutine(routine.id);
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not delete the routine.",
                );
                throw cause;
              }
            });
          }}
        >
          Confirm delete routine
        </button>
      </div>
    </Modal>
  );
}
