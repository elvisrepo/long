import { useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";
import { RoutineExercisePicker } from "./routine-exercise-picker";
import { RoutineSetEditor } from "./routine-set-editor";
import { RoutineGroupDialog } from "./routine-group-dialog";
import { RoutineOrderDialog } from "./routine-order-dialog";

type Editor =
  | { kind: "sets" | "group" | "actions" | "remove"; item: api.RoutineExercise }
  | { kind: "picker" }
  | { kind: "order" };
export function RoutineDayBuilder({
  day,
  busy,
  run,
  editing,
  onDayDetails,
  onStart,
  onOpenLibrary,
  initialPicker = false,
}: {
  day: api.RoutineDay;
  busy: boolean;
  run: RunAction;
  editing: boolean;
  onDayDetails: () => void;
  onStart: () => void;
  onOpenLibrary?: () => void;
  initialPicker?: boolean;
}) {
  const [editor, setEditor] = useState<Editor | undefined>(
    initialPicker ? { kind: "picker" } : undefined,
  );
  const [error, setError] = useState("");
  const skipClick = useRef(false);
  const drag = useRef<{ id: string; target?: string } | null>(null);
  const item =
    editor && "item" in editor
      ? (day.exercises.find((row) => row.id === editor.item.id) ?? editor.item)
      : undefined;
  function drop() {
    const current = drag.current;
    drag.current = null;
    if (!current?.target || current.target === current.id) return;
    skipClick.current = true;
    const before = day.exercises.map((row) => row.id);
    const next = [...before];
    const from = next.indexOf(current.id);
    const to = next.indexOf(current.target);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    run(async () => {
      await api.reorderRoutineItems("exercises", day.id, next, before);
    });
  }
  return (
    <section className="routine-day" aria-label={`${day.name} day`}>
      <header className="routine-day-header">
        <h2>{day.name}</h2>
        {editing ? (
          <>
            <button
              aria-label={`Add exercise to ${day.name}`}
              disabled={busy}
              onClick={() => setEditor({ kind: "picker" })}
            >
              ＋
            </button>
            <button
              aria-label={`Edit ${day.name} day details`}
              disabled={busy}
              onClick={onDayDetails}
            >
              ⋯
            </button>
          </>
        ) : (
          <button
            className="routine-start"
            aria-label={`Start ${day.name}`}
            disabled={busy || !day.exercises.length}
            onClick={onStart}
          >
            Start
          </button>
        )}
      </header>
      {!day.exercises.length && (
        <div className="routine-empty-day">
          <p>No exercises yet.</p>
          {editing && (
            <button
              disabled={busy}
              onClick={() => setEditor({ kind: "picker" })}
            >
              Add exercises
            </button>
          )}
        </div>
      )}
      {day.exercises.map((row) => (
        <div
          key={row.id}
          className={`routine-exercise-row${row.group_name ? " has-group" : ""}`}
          data-routine-row-id={row.id}
          style={
            row.group_name
              ? { borderInlineStartColor: row.group_colour ?? "#007f68" }
              : undefined
          }
        >
          {editing ? (
            <button
              className="routine-exercise-name"
              disabled={busy}
              aria-label={`Options for ${row.exercise_name}`}
              onClick={() => setEditor({ kind: "actions", item: row })}
            >
              <span>{row.exercise_name}</span>
              <small>
                {row.sets.length
                  ? `${row.sets.length} ${row.sets.length === 1 ? "set" : "sets"}`
                  : "No predefined sets"}
                {row.group_name ? ` · ${row.group_name}` : ""}
              </small>
            </button>
          ) : (
            <div className="routine-exercise-name">
              <span>{row.exercise_name}</span>
              <small>
                {row.sets.length
                  ? `${row.sets.length} ${row.sets.length === 1 ? "set" : "sets"}`
                  : "No predefined sets"}
                {row.group_name ? ` · ${row.group_name}` : ""}
              </small>
            </div>
          )}
          {editing && (
            <>
              <button
                disabled={busy}
                aria-label={`Remove ${row.exercise_name} from ${day.name}`}
                onClick={() => setEditor({ kind: "remove", item: row })}
              >
                ×
              </button>
              <button
                className="routine-drag-handle"
                disabled={busy}
                aria-label={`Reorder ${row.exercise_name}`}
                title="Drag, or open ordering controls"
                onClick={() => {
                  if (skipClick.current) {
                    skipClick.current = false;
                    return;
                  }
                  setEditor({ kind: "order" });
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  skipClick.current = false;
                  drag.current = { id: row.id };
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (drag.current) {
                    const target = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest<HTMLElement>("[data-routine-row-id]")
                      ?.dataset.routineRowId;
                    if (target) drag.current.target = target;
                  }
                }}
                onPointerUp={drop}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
              >
                ⠿
              </button>
            </>
          )}
        </div>
      ))}
      {editor?.kind === "picker" && (
        <Modal
          labelledBy={`picker-${day.id}`}
          className="routine-dialog"
          busy={busy}
          onClose={() => setEditor(undefined)}
        >
          <header className="routine-dialog-header">
            <h2 id={`picker-${day.id}`}>Add exercise</h2>
            <p>{day.name}</p>
          </header>
          <div className="routine-dialog-body">
            <RoutineExercisePicker
              dayId={day.id}
              busy={busy}
              run={run}
              onOpenLibrary={onOpenLibrary}
              onAdded={(saved) => setEditor({ kind: "sets", item: saved })}
            />
          </div>
          <footer className="routine-dialog-footer">
            <button disabled={busy} onClick={() => setEditor(undefined)}>
              Done
            </button>
          </footer>
        </Modal>
      )}
      {editor?.kind === "sets" && item && (
        <RoutineSetEditor
          key={item.id}
          item={item}
          busy={busy}
          run={run}
          onClose={() => setEditor(undefined)}
        />
      )}
      {editor?.kind === "group" && item && (
        <RoutineGroupDialog
          item={item}
          day={day}
          busy={busy}
          run={run}
          onClose={() => setEditor(undefined)}
        />
      )}
      {editor?.kind === "actions" && item && (
        <Modal
          labelledBy="routine-exercise-actions"
          onClose={() => setEditor(undefined)}
        >
          <h2 id="routine-exercise-actions">{item.exercise_name}</h2>
          <div className="routine-action-list">
            <button onClick={() => setEditor({ kind: "sets", item })}>
              Edit predefined sets
            </button>
            <button onClick={() => setEditor({ kind: "group", item })}>
              Add to group
            </button>
            <button onClick={() => setEditor(undefined)}>Cancel</button>
          </div>
        </Modal>
      )}
      {editor?.kind === "remove" && item && (
        <Modal
          labelledBy="routine-remove-exercise"
          busy={busy}
          onClose={() => {
            setEditor(undefined);
            setError("");
          }}
        >
          <h2 id="routine-remove-exercise">Remove {item.exercise_name}?</h2>
          <p>
            Remove this exercise and its predefined sets from {day.name}?
            Existing workouts are kept.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="workout-actions">
            <button
              disabled={busy}
              onClick={() => {
                setEditor(undefined);
                setError("");
              }}
            >
              Keep exercise
            </button>
            <button
              className="workout-danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  try {
                    await api.removeRoutineItem("routine-exercises", item.id);
                    setEditor(undefined);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not remove exercise.",
                    );
                    throw cause;
                  }
                })
              }
            >
              Confirm template removal
            </button>
          </div>
        </Modal>
      )}
      {editor?.kind === "order" && (
        <RoutineOrderDialog
          kind="exercises"
          parentId={day.id}
          items={day.exercises.map((row) => ({
            id: row.id,
            name: row.exercise_name,
          }))}
          busy={busy}
          run={run}
          onClose={() => setEditor(undefined)}
        />
      )}
    </section>
  );
}
