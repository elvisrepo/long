import { useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

type Quantity = "weight" | "reps" | "distance" | "duration_seconds";
type Draft = Record<Quantity, string> & { key: string };
const blank = { weight: "", reps: "", distance: "", duration_seconds: "" };
export function RoutineSetEditor({
  item,
  busy,
  run,
  onClose,
}: {
  item: api.RoutineExercise;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const serial = useRef(0);
  const [original] = useState(item.sets);
  const [rows, setRows] = useState<Draft[]>(() =>
    item.sets.map((row) => ({
      key: row.id,
      weight: row.weight ?? "",
      reps: row.reps === null ? "" : String(row.reps),
      distance: row.distance ?? "",
      duration_seconds:
        row.duration_seconds === null ? "" : String(row.duration_seconds),
    })),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ key: string; target?: string } | null>(null);
  const locked = busy || saving;
  const fields: { name: Quantity; label: string; min: number; step: string }[] =
    item.tracking_type === "duration"
      ? [
          {
            name: "duration_seconds",
            label: "Duration (seconds)",
            min: 1,
            step: "1",
          },
        ]
      : item.tracking_type === "cardio"
        ? [
            {
              name: "distance",
              label: `Distance (${item.distance_unit})`,
              min: 0.001,
              step: ".001",
            },
            {
              name: "duration_seconds",
              label: "Duration (seconds)",
              min: 1,
              step: "1",
            },
          ]
        : [
            {
              name: "weight",
              label: `Weight (${item.weight_unit})`,
              min: 0,
              step: ".001",
            },
            { name: "reps", label: "Reps", min: 1, step: "1" },
          ];
  function move(key: string, target: string) {
    setRows((current) => {
      const next = [...current];
      const from = next.findIndex((row) => row.key === key);
      const to = next.findIndex((row) => row.key === target);
      if (from < 0 || to < 0) return current;
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }
  return (
    <Modal
      labelledBy="routine-presets-title"
      className="routine-dialog"
      busy={locked}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-presets-title">Predefined sets</h2>
        <p>{item.exercise_name}</p>
      </header>
      <form
        className="routine-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          setSaving(true);
          run(async () => {
            try {
              await api.replaceRoutineSets(
                item.id,
                rows.map((row) => ({
                  weight: row.weight === "" ? null : row.weight,
                  reps: row.reps === "" ? null : Number(row.reps),
                  distance: row.distance === "" ? null : row.distance,
                  duration_seconds:
                    row.duration_seconds === ""
                      ? null
                      : Number(row.duration_seconds),
                })),
                original,
              );
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save predefined sets.",
              );
              throw cause;
            } finally {
              setSaving(false);
            }
          });
        }}
      >
        <div className="routine-dialog-body">
          {!rows.length && (
            <p>
              No predefined sets. Add sets now, or record them during your
              workout.
            </p>
          )}
          <div className="routine-preset-list">
            {rows.map((row, index) => (
              <div
                className="routine-preset-row"
                key={row.key}
                data-preset-key={row.key}
                style={{
                  gridTemplateColumns: `44px repeat(${fields.length}, minmax(0,1fr)) 44px`,
                }}
              >
                <button
                  type="button"
                  className="routine-drag-handle"
                  aria-label={`Reorder set ${index + 1}`}
                  title="Drag, or use Arrow Up / Down"
                  disabled={locked}
                  onKeyDown={(event) => {
                    const target =
                      event.key === "ArrowUp"
                        ? rows[index - 1]
                        : event.key === "ArrowDown"
                          ? rows[index + 1]
                          : undefined;
                    if (target) {
                      event.preventDefault();
                      move(row.key, target.key);
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    drag.current = { key: row.key };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (drag.current) {
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-preset-key]")
                        ?.dataset.presetKey;
                      if (target) drag.current.target = target;
                    }
                  }}
                  onPointerUp={() => {
                    if (drag.current?.target)
                      move(drag.current.key, drag.current.target);
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                >
                  {index + 1}
                  <span aria-hidden="true">⠿</span>
                </button>
                {fields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    <input
                      aria-label={`Set ${index + 1} ${field.label.toLowerCase()}`}
                      type="number"
                      min={field.min}
                      step={field.step}
                      placeholder="—"
                      value={row[field.name]}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((saved) =>
                            saved.key === row.key
                              ? { ...saved, [field.name]: event.target.value }
                              : saved,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  aria-label={`Remove set ${index + 1}`}
                  disabled={locked}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((saved) => saved.key !== row.key),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="routine-text-button"
            aria-label="Add set"
            disabled={locked || rows.length >= 1000}
            onClick={() =>
              setRows((current) => [
                ...current,
                { ...blank, key: `new-${++serial.current}` },
              ])
            }
          >
            ＋ <span>Add set</span>
          </button>
          <details className="routine-help">
            <summary>How blank fields work</summary>
            <p>
              Blank fields stay unknown. When starting, you can choose to fill
              them from earlier completed sets. Fixed values, including zero
              weight, stay fixed. Drag set numbers or use Arrow Up / Down to
              reorder.
            </p>
          </details>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="routine-dialog-footer">
          <button type="button" disabled={locked} onClick={onClose}>
            {!original.length && !rows.length ? "No predefined sets" : "Cancel"}
          </button>
          <button
            className="primary-button"
            aria-label="Save predefined sets"
            disabled={locked}
          >
            Save
          </button>
        </footer>
      </form>
    </Modal>
  );
}
