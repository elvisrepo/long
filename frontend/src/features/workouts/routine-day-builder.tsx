import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import { setLabel, type RunAction } from "./workout-navigation";

type Quantity = "weight" | "reps" | "distance" | "duration_seconds";

export function RoutineDayBuilder({
  day,
  busy,
  run,
}: {
  day: api.RoutineDay;
  busy: boolean;
  run: RunAction;
}) {
  const owner = useMeQuery().data?.email;
  const catalog = useQuery({
    queryKey: ["workouts", owner, "catalog"],
    queryFn: api.getWorkoutCatalog,
    enabled: !!owner,
  });
  const [itemId, setItemId] = useState("");
  const [setId, setSetId] = useState("");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "routine-exercises" | "routine-sets";
    id: string;
  }>();
  const item = day.exercises.find((i) => i.id === itemId) ?? day.exercises[0];
  const editing = item?.sets.find((s) => s.id === setId);
  const execute = (action: () => Promise<void>) => {
    setError("");
    run(async () => {
      try {
        await action();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Template change failed.",
        );
        throw cause;
      }
    });
  };
  const fields: { name: Quantity; label: string; min: number; step: string }[] =
    !item
      ? []
      : item.tracking_type === "duration"
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
  return (
    <section className="workout-stack" aria-label="Routine exercises">
      <h3>Exercises & planned sets</h3>
      <p>Blank quantities are unknown. Changes affect this template only.</p>
      {catalog.isPending ? (
        <p role="status">Loading exercises…</p>
      ) : catalog.isError ? (
        <>
          <p role="alert">Exercises couldn't load.</p>
          <button onClick={() => void catalog.refetch()}>
            Retry exercises
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            execute(async () => {
              const saved = await api.addRoutineExercise(
                day.id,
                String(fd.get("exercise")),
              );
              setItemId(saved.id);
              setSetId("");
            });
          }}
        >
          <label>
            Add an exercise
            <select name="exercise" required disabled={busy} defaultValue="">
              <option value="" disabled>
                Choose exercise…
              </option>
              {catalog.data.exercises
                .filter(
                  (e) =>
                    e.is_active &&
                    catalog.data.categories.some(
                      (c) => c.id === e.category_id && c.is_active,
                    ),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={busy}>Add exercise to day</button>
        </form>
      )}
      {!day.exercises.length && (
        <p>
          No exercises yet. Use All exercises to create or initialize your
          library.
        </p>
      )}
      <div className="workout-actions">
        {day.exercises.map((i) => (
          <button
            key={i.id}
            disabled={busy}
            aria-pressed={i.id === item?.id}
            onClick={() => {
              setItemId(i.id);
              setSetId("");
              setConfirm(undefined);
            }}
          >
            {i.exercise_name}
          </button>
        ))}
      </div>
      {item && (
        <div className="workout-inset">
          <h3>{item.exercise_name}</h3>
          <form
            key={`order:${item.id}:${item.display_order}`}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              execute(async () => {
                await api.reorderRoutineExercise(
                  item.id,
                  Number(fd.get("order")),
                  String(fd.get("group")),
                );
              });
            }}
          >
            <label>
              Exercise order
              <input
                name="order"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                required
                defaultValue={item.display_order}
                disabled={busy}
              />
            </label>
            <label>
              Superset / circuit name
              <input
                name="group"
                maxLength={120}
                defaultValue={item.group_name ?? ""}
                disabled={busy}
              />
            </label>
            <small>
              Matching names link exercises within this day. Blank removes the
              group.
            </small>
            <button disabled={busy}>Save exercise order</button>
          </form>
          <div className="workout-stack">
            {item.sets.map((s, n) => (
              <button
                key={s.id}
                disabled={busy}
                aria-pressed={s.id === editing?.id}
                onClick={() => setSetId(s.id === setId ? "" : s.id)}
              >
                Set {n + 1}: {setLabel(item, s)}
              </button>
            ))}
          </div>
          <form
            key={`${item.id}:${editing?.id ?? "new"}:${JSON.stringify(editing)}:${version}`}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const data: Partial<Omit<api.RoutineSet, "id">> = {
                display_order: Number(fd.get("order")),
              };
              for (const field of fields) {
                const value = String(fd.get(field.name) ?? "");
                Object.assign(data, {
                  [field.name]:
                    value === ""
                      ? null
                      : field.name === "weight" || field.name === "distance"
                        ? value
                        : Number(value),
                });
              }
              execute(async () => {
                await api.saveRoutineSet(item.id, editing?.id, data);
                setSetId("");
                setVersion((value) => value + 1);
              });
            }}
          >
            <h4>{editing ? "Edit planned set" : "Add planned set"}</h4>
            <div className="workout-set-fields">
              {fields.map((f) => (
                <label key={f.name}>
                  {f.label}
                  <input
                    name={f.name}
                    type="number"
                    min={f.min}
                    step={f.step}
                    defaultValue={editing?.[f.name] ?? ""}
                    disabled={busy}
                  />
                </label>
              ))}
            </div>
            <label>
              Set order
              <input
                name="order"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                required
                defaultValue={
                  editing?.display_order ??
                  Math.max(0, ...item.sets.map((s) => s.display_order)) + 10
                }
                disabled={busy}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              {editing ? "Update planned set" : "Add planned set"}
            </button>
          </form>
          <div className="workout-actions">
            {editing && (
              <>
                <button disabled={busy} onClick={() => setSetId("")}>
                  Cancel set edit
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    setConfirm({ kind: "routine-sets", id: editing.id })
                  }
                >
                  Remove planned set
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() =>
                setConfirm({ kind: "routine-exercises", id: item.id })
              }
            >
              Remove exercise from day
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="workout-context">
          <p>
            Remove{" "}
            {confirm.kind === "routine-exercises"
              ? "this exercise and its planned sets"
              : "this planned set"}
            ? Existing workouts are kept.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              execute(async () => {
                await api.removeRoutineItem(confirm.kind, confirm.id);
                setConfirm(undefined);
                setSetId("");
              })
            }
          >
            Confirm template removal
          </button>
          <button disabled={busy} onClick={() => setConfirm(undefined)}>
            Keep template item
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
