import { useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function RoutineOrderDialog({
  kind,
  parentId,
  items,
  busy,
  run,
  onClose,
}: {
  kind: "days" | "exercises";
  parentId: string;
  items: { id: string; name: string }[];
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(items);
  const [original] = useState(() => items.map((row) => row.id));
  const [error, setError] = useState("");
  const drag = useRef<{
    id: string;
    before: typeof rows;
    target?: string;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  function move(id: string, target: string) {
    setRows((current) => {
      const from = current.findIndex((row) => row.id === id);
      const to = current.findIndex((row) => row.id === target);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }
  function cancelDrag() {
    if (drag.current) setRows(drag.current.before);
    drag.current = null;
    setDragging(null);
  }
  return (
    <Modal labelledBy="routine-order-title" busy={busy} onClose={onClose}>
      <h2 id="routine-order-title">Reorder routine {kind}</h2>
      <p>
        Drag a handle or use the arrows. Save applies this order to the routine
        only; existing workouts stay unchanged.
      </p>
      <ol className="workout-sortable-list">
        {rows.map((row, index) => {
          const label = `${row.name} (${kind === "days" ? "day" : "exercise"} ${index + 1})`;
          return (
            <li
              key={row.id}
              data-routine-order-id={row.id}
              className={dragging === row.id ? "is-dragging" : ""}
            >
              <button
                type="button"
                className="workout-category-drag"
                aria-label={`Drag ${label}`}
                disabled={busy}
                onPointerDown={(event) => {
                  if (event.button !== 0 || drag.current) return;
                  drag.current = { id: row.id, before: rows };
                  setDragging(row.id);
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  const target = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-routine-order-id]")
                    ?.dataset.routineOrderId;
                  if (target) drag.current.target = target;
                }}
                onPointerUp={() => {
                  if (drag.current?.target)
                    move(drag.current.id, drag.current.target);
                  drag.current = null;
                  setDragging(null);
                }}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
              >
                ⠿
              </button>
              <span>{row.name}</span>
              <button
                type="button"
                disabled={busy || index === 0}
                aria-label={`Move ${label} up`}
                onClick={() => move(row.id, rows[index - 1].id)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === rows.length - 1}
                aria-label={`Move ${label} down`}
                onClick={() => move(row.id, rows[index + 1].id)}
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert">{error}</p>}
      <div className="workout-actions">
        <button disabled={busy} onClick={onClose}>
          Cancel reordering
        </button>
        <button
          disabled={busy || !!dragging}
          onClick={() => {
            setError("");
            run(async () => {
              try {
                await api.reorderRoutineItems(
                  kind,
                  parentId,
                  rows.map((row) => row.id),
                  original,
                );
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not save this order.",
                );
                throw cause;
              }
            });
          }}
        >
          Save order
        </button>
      </div>
    </Modal>
  );
}
