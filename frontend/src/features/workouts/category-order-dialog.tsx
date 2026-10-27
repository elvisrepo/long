import { useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function CategoryOrderDialog({
  categories,
  initialMode,
  busy,
  run,
  onClose,
}: {
  categories: api.ExerciseCategory[];
  initialMode: "alphabetical" | "manual";
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(categories);
  const [original] = useState(() => categories.map((row) => row.id));
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<{ id: string; before: api.ExerciseCategory[] } | null>(
    null,
  );
  const shown =
    mode === "alphabetical"
      ? [...rows].sort(
          (a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
            a.id.localeCompare(b.id),
        )
      : rows;
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
  return (
    <Modal labelledBy="category-order-title" busy={busy} onClose={onClose}>
      <h2 id="category-order-title">Reorder categories</h2>
      <fieldset className="workout-category-sort-mode">
        <legend>Order</legend>
        <label className="workout-check">
          <input
            type="radio"
            name="category-order"
            checked={mode === "alphabetical"}
            disabled={busy}
            onChange={() => setMode("alphabetical")}
          />
          Alphabetical
        </label>
        <label className="workout-check">
          <input
            type="radio"
            name="category-order"
            checked={mode === "manual"}
            disabled={busy}
            onChange={() => setMode("manual")}
          />
          Manual
        </label>
      </fieldset>
      <p className="workout-note">
        Choose Manual to drag a handle or use the arrows. Archived categories
        are included.
      </p>
      <ol className="workout-category-order-list">
        {shown.map((row, index) => (
          <li
            key={row.id}
            data-category-id={row.id}
            className={dragging === row.id ? "is-dragging" : ""}
          >
            <button
              type="button"
              className="workout-category-drag"
              aria-label={`Drag ${row.name}`}
              disabled={busy || mode !== "manual"}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                drag.current = { id: row.id, before: rows };
                setDragging(row.id);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-category-id]")
                  ?.dataset.categoryId;
                if (target) move(drag.current.id, target);
              }}
              onPointerUp={() => {
                drag.current = null;
                setDragging(null);
              }}
              onPointerCancel={() => {
                if (drag.current) setRows(drag.current.before);
                drag.current = null;
                setDragging(null);
              }}
              onLostPointerCapture={() => {
                if (drag.current) setRows(drag.current.before);
                drag.current = null;
                setDragging(null);
              }}
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <span>
              {row.name}
              {!row.is_active && <small> · Archived</small>}
            </span>
            <button
              type="button"
              aria-label={`Move ${row.name} up`}
              disabled={busy || mode !== "manual" || index === 0}
              onClick={() => move(row.id, rows[index - 1].id)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${row.name} down`}
              disabled={busy || mode !== "manual" || index === shown.length - 1}
              onClick={() => move(row.id, rows[index + 1].id)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="workout-error">
          {error}
        </p>
      )}
      <div className="workout-actions">
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={busy || !!dragging}
          onClick={() =>
            run(async () => {
              setError("");
              try {
                await api.reorderCategories(
                  mode,
                  shown.map((row) => row.id),
                  original,
                );
                onClose();
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Category order could not be saved.",
                );
                throw reason;
              }
            })
          }
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
