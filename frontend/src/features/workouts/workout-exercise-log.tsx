import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { setLabel, type RunAction } from "./workout-navigation";

type DragMotion = {
  id: string;
  offset: number;
  shifts: Record<string, number>;
  dragging: boolean;
};
type DragSession = {
  id: string;
  target: string;
  order: string[];
  startY: number;
  boxes: { id: string; top: number; height: number }[];
  gap: number;
  motion: DragMotion;
};

export function WorkoutExerciseLog({
  workout: w,
  busy,
  run,
  onOpen,
  selecting = false,
  navigation = false,
  currentExerciseId,
  onDone,
}: {
  workout: api.Workout;
  busy: boolean;
  run: RunAction;
  onOpen: (id: string) => void;
  selecting?: boolean;
  navigation?: boolean;
  currentExerciseId?: string;
  onDone?: () => void;
}) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [motion, setMotion] = useState<DragMotion | null>(null);
  const [savedOrder, setSavedOrder] = useState<{
    base: string;
    items: api.WorkoutExercise[];
  } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef<string | null>(null);
  const drag = useRef<DragSession | null>(null);
  const mode = active || selecting || navigation;
  const locked = busy || pending;
  const serverOrder = w.exercises.map((item) => item.id).join(",");
  const exercises =
    savedOrder?.base === serverOrder ? savedOrder.items : w.exercises;
  const selectedItems = exercises.filter((item) => selected.has(item.id));
  const ids = exercises.map((item) => item.id);
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  useEffect(() => {
    if (!navigation) return;
    const element = list.current!;
    const preventScroll = (event: TouchEvent) => {
      if (drag.current) event.preventDefault();
    };
    element.addEventListener("touchmove", preventScroll, { passive: false });
    return () => element.removeEventListener("touchmove", preventScroll);
  }, [navigation]);
  function cancelHold() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }
  function finish() {
    cancelHold();
    setActive(false);
    setSelected(new Set());
    setError("");
    setMotion(null);
    drag.current = null;
    onDone?.();
  }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function beginHold(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (locked || w.is_finished || (mode && !navigation) || event.button > 0)
      return;
    cancelHold();
    origin.current = { x: event.clientX, y: event.clientY };
    const element = event.currentTarget;
    const pointer = {
      button: event.button,
      clientY: event.clientY,
      pointerId: event.pointerId,
      currentTarget: element,
      preventDefault: () => {},
    };
    hold.current = setTimeout(() => {
      if (navigation) startDrag(pointer, id);
      else {
        setActive(true);
        setSelected(new Set([id]));
      }
      suppressClick.current = id;
    }, 500);
  }
  function animationDelay() {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    return new Promise<void>((resolve) =>
      window.setTimeout(resolve, reduced ? 0 : 180),
    );
  }
  function reorder(
    id: string,
    destination: string,
    expected = ids,
    settling?: DragMotion,
  ) {
    if (locked || w.is_finished || id === destination) {
      if (settling) {
        const resting = { ...settling, dragging: false };
        setMotion(resting);
        void animationDelay().then(() =>
          setMotion((current) => (current === resting ? null : current)),
        );
      }
      return;
    }
    const next = expected.filter((value) => value !== id);
    next.splice(expected.indexOf(destination), 0, id);
    setPending(true);
    setError("");
    const landed = settling ? animationDelay() : Promise.resolve();
    run(async () => {
      try {
        const saved = await api.actOnWorkoutExercises(w.id, {
          action: "reorder",
          exercise_ids: next,
          expected_order: expected,
        });
        await landed;
        setSavedOrder({ base: serverOrder, items: saved.exercises });
        setMotion(null);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Order couldn't be saved. Refresh and retry.",
        );
        if (settling) {
          setMotion({ ...settling, shifts: {}, offset: 0, dragging: false });
          await animationDelay();
        }
        setMotion(null);
      } finally {
        setPending(false);
      }
    });
  }
  function startDrag(
    event: Pick<
      PointerEvent<HTMLButtonElement>,
      "button" | "clientY" | "pointerId" | "currentTarget" | "preventDefault"
    >,
    id: string,
  ) {
    if (locked || event.button > 0) return;
    event.preventDefault();
    const boxes = Array.from(
      list.current!.querySelectorAll<HTMLElement>("[data-exercise-id]"),
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.exerciseId!,
        top: rect.top,
        height: rect.height,
      };
    });
    const initial = { id, offset: 0, shifts: {}, dragging: true };
    drag.current = {
      id,
      target: id,
      order: ids,
      startY: event.clientY,
      boxes,
      gap: boxes.length > 1 ? boxes[1].top - boxes[0].top - boxes[0].height : 0,
      motion: initial,
    };
    setMotion(initial);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    const offset = event.clientY - current.startY;
    const source = current.boxes.find((box) => box.id === current.id)!;
    const center = source.top + source.height / 2 + offset;
    const others = current.boxes.filter((box) => box.id !== current.id);
    const index = others.filter(
      (box) => center > box.top + box.height / 2,
    ).length;
    const projected = others.map((box) => box.id);
    projected.splice(index, 0, current.id);
    current.target = current.order[projected.indexOf(current.id)];
    const shifts: Record<string, number> = {};
    let top = current.boxes[0].top;
    for (const id of projected) {
      const box = current.boxes.find((box) => box.id === id)!;
      shifts[id] = top - box.top;
      top += box.height + current.gap;
    }
    current.motion = { id: current.id, offset, shifts, dragging: true };
    setMotion(current.motion);
  }
  function drop() {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const settling = { ...current.motion, dragging: false };
    setMotion(settling);
    reorder(current.id, current.target, current.order, settling);
  }
  return (
    <div
      className={`workout-exercise-log${navigation ? " workout-navigation-log" : ""}`}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          mode &&
          !navigation &&
          !locked &&
          !confirm
        ) {
          event.preventDefault();
          finish();
        }
      }}
    >
      {mode && !navigation && (
        <div
          role="toolbar"
          aria-label="Selected exercises"
          className="workout-selection-toolbar"
        >
          <strong>
            {selectedItems.length}{" "}
            {selectedItems.length === 1 ? "exercise" : "exercises"} selected
          </strong>
          <button
            disabled={locked || w.is_finished}
            onClick={() =>
              setSelected(
                new Set(selectedItems.length === ids.length ? [] : ids),
              )
            }
          >
            {selectedItems.length === ids.length
              ? "Clear selection"
              : "Select all"}
          </button>
          <button
            className="workout-danger"
            disabled={locked || w.is_finished || !selectedItems.length}
            onClick={() => {
              setError("");
              setConfirm(true);
            }}
          >
            Delete selected
          </button>
          <button disabled={locked} onClick={finish}>
            Done
          </button>
        </div>
      )}
      {mode && !navigation && (
        <p className="workout-note">
          Tap to select · Drag a handle to reorder · Focus a handle and use ↑ /
          ↓
        </p>
      )}
      {error && !confirm && <p role="alert">{error}</p>}
      {pending && <p role="status">Saving workout…</p>}
      <div className="workout-home-exercises" ref={list}>
        {exercises.map((item) => (
          <div
            key={item.id}
            data-exercise-id={item.id}
            className={`workout-home-exercise${item.group_name ? " workout-group-mark" : ""}${(navigation ? currentExerciseId === item.id : mode && selected.has(item.id)) ? " is-selected" : ""}${motion?.dragging && motion.id === item.id ? " is-dragging" : ""}${motion && !motion.dragging ? " is-settling" : ""}`}
            style={{
              borderInlineStartColor: item.group_name
                ? (item.group_colour ?? "#007f68")
                : undefined,
              transform: motion
                ? `translate3d(0, ${motion.dragging && motion.id === item.id ? motion.offset : (motion.shifts[item.id] ?? 0)}px, 0)${motion.dragging && motion.id === item.id ? " scale(1.015)" : ""}`
                : undefined,
              transition: motion ? undefined : "none",
              zIndex: motion?.id === item.id ? 2 : undefined,
            }}
          >
            <button
              className="workout-home-exercise-link"
              aria-label={`${navigation ? "Switch to" : mode ? "Select" : "Open"} ${item.exercise_name}`}
              aria-pressed={
                navigation
                  ? currentExerciseId === item.id
                  : mode
                    ? selected.has(item.id)
                    : undefined
              }
              aria-describedby={navigation ? undefined : `home-sets-${item.id}`}
              disabled={locked}
              onPointerDown={(event) => beginHold(event, item.id)}
              onPointerUp={() => {
                cancelHold();
                if (navigation && drag.current) drop();
              }}
              onPointerCancel={() => {
                cancelHold();
                if (navigation) {
                  drag.current = null;
                  setMotion(null);
                }
              }}
              onPointerLeave={() => {
                if (!drag.current) cancelHold();
              }}
              onPointerMove={(event) => {
                if (navigation && drag.current) {
                  moveDrag(event);
                  return;
                }
                if (
                  Math.hypot(
                    event.clientX - origin.current.x,
                    event.clientY - origin.current.y,
                  ) > 10
                )
                  cancelHold();
              }}
              onContextMenu={(event) => {
                if (navigation) {
                  event.preventDefault();
                  return;
                }
                if (!locked && !w.is_finished) {
                  event.preventDefault();
                  setActive(true);
                  setSelected((current) => new Set([...current, item.id]));
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "F10" &&
                  event.shiftKey &&
                  !w.is_finished &&
                  !locked
                ) {
                  event.preventDefault();
                  if (navigation) {
                    event.currentTarget.parentElement
                      ?.querySelector<HTMLButtonElement>(".workout-drag-handle")
                      ?.focus();
                    return;
                  }
                  setActive(true);
                  setSelected(new Set([item.id]));
                }
              }}
              onClick={() => {
                cancelHold();
                const held = suppressClick.current;
                suppressClick.current = null;
                if (held === item.id) return;
                if (navigation) onOpen(item.id);
                else if (mode) toggle(item.id);
                else onOpen(item.id);
              }}
            >
              {navigation ? (
                <>
                  <strong>{item.exercise_name}</strong>
                  <small>
                    {item.sets.length} {item.sets.length === 1 ? "set" : "sets"}
                  </small>
                </>
              ) : (
                <>
                  <span className="workout-home-exercise-heading">
                    <strong>{item.exercise_name}</strong>
                  </span>
                  {item.group_name && (
                    <span className="workout-badge">{item.group_name}</span>
                  )}
                  <span
                    id={`home-sets-${item.id}`}
                    className="workout-home-sets"
                  >
                    {item.sets.map((set, i) => (
                      <span
                        className={`workout-home-set-row${item.tracking_type === "strength" ? " is-strength" : ""}`}
                        key={set.id}
                      >
                        <span className="visually-hidden">Set {i + 1}</span>
                        {item.tracking_type === "strength" ? (
                          <>
                            <strong>
                              {set.weight == null ? "—" : Number(set.weight)}{" "}
                              <small>{item.weight_unit}</small>
                            </strong>
                            <span>
                              <b>{set.reps ?? "—"}</b> <small>reps</small>
                            </span>
                          </>
                        ) : (
                          <strong>{setLabel(item, set)}</strong>
                        )}
                        <span
                          className={`visually-hidden workout-home-set-status workout-status--${set.is_completed ? "completed" : "planned"}`}
                        >
                          {set.is_completed ? "Completed" : "Planned"}
                        </span>
                        {set.comment && (
                          <span className="visually-hidden workout-home-set-comment">
                            {set.comment}
                          </span>
                        )}
                      </span>
                    ))}
                    {!item.sets.length && (
                      <span className="workout-note">No sets yet</span>
                    )}
                  </span>
                </>
              )}
            </button>
            {mode && (
              <button
                className="workout-drag-handle"
                aria-label={`Reorder ${item.exercise_name}`}
                disabled={locked || w.is_finished}
                title="Drag to reorder, or use arrow keys"
                onPointerDown={(event) => startDrag(event, item.id)}
                onPointerMove={moveDrag}
                onPointerUp={drop}
                onPointerCancel={() => {
                  drag.current = null;
                  setMotion(null);
                }}
                onLostPointerCapture={() => {
                  if (drag.current) {
                    drag.current = null;
                    setMotion(null);
                  }
                }}
                onKeyDown={(event) => {
                  const index = ids.indexOf(item.id);
                  const destination =
                    index +
                    (event.key === "ArrowUp"
                      ? -1
                      : event.key === "ArrowDown"
                        ? 1
                        : 0);
                  if (destination !== index) {
                    event.preventDefault();
                    if (ids[destination]) reorder(item.id, ids[destination]);
                  }
                }}
              >
                <span aria-hidden="true">↕</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {confirm && (
        <Modal
          labelledBy={`delete-exercises-${w.id}`}
          busy={locked}
          onClose={() => setConfirm(false)}
        >
          <h2 id={`delete-exercises-${w.id}`}>Delete selected exercises?</h2>
          <p>
            Remove {selectedItems.length}{" "}
            {selectedItems.length === 1 ? "exercise" : "exercises"} and all
            their sets from this workout? Your library and other workouts are
            kept.
          </p>
          <ul>
            {selectedItems.map((item) => (
              <li key={item.id}>
                {item.exercise_name} · {item.sets.length} sets
              </li>
            ))}
          </ul>
          {error && <p role="alert">{error}</p>}
          <div className="workout-actions">
            <button
              className="workout-danger"
              disabled={locked || !selectedItems.length || w.is_finished}
              onClick={() => {
                setPending(true);
                setError("");
                run(async () => {
                  try {
                    await api.actOnWorkoutExercises(w.id, {
                      action: "delete",
                      exercise_ids: selectedItems.map((item) => item.id),
                    });
                    setConfirm(false);
                    finish();
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Exercises couldn't be deleted. Please retry.",
                    );
                  } finally {
                    setPending(false);
                  }
                });
              }}
            >
              Confirm exercise deletion
            </button>
            <button disabled={locked} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
