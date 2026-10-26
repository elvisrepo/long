import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

export function RoutineExercisePicker({
  dayId,
  busy,
  run,
  onAdded,
  onOpenLibrary,
}: {
  dayId: string;
  busy: boolean;
  run: RunAction;
  onAdded: (item: api.RoutineExercise) => void;
  onOpenLibrary?: () => void;
}) {
  const owner = useMeQuery().data?.email;
  const catalog = useQuery({
    queryKey: ["workouts", owner, "catalog"],
    queryFn: api.getWorkoutCatalog,
    enabled: !!owner,
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<api.Exercise | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState<api.TrackingType>("strength");
  const categories =
    catalog.data?.categories.filter((row) => row.is_active) ?? [];
  if (catalog.data?.preferences?.category_order !== "manual")
    categories.sort((a, b) => a.name.localeCompare(b.name));
  const terms = search.toLowerCase().trim().split(/\s+/);
  const exercises =
    catalog.data?.exercises.filter(
      (row) =>
        row.is_active &&
        categories.some((c) => c.id === row.category_id) &&
        (!category || row.category_id === category) &&
        terms.every((term) => row.name.toLowerCase().includes(term)),
    ) ?? [];
  const locked = busy || catalog.isFetching;
  const execute = (action: () => Promise<void>) => {
    setError("");
    run(async () => {
      try {
        await action();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Exercise could not be added.",
        );
        throw cause;
      }
    });
  };
  return (
    <section aria-label="Choose routine exercises" className="workout-stack">
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
        <>
          {!creating ? (
            <>
              <div className="workout-fields">
                <label>
                  <span aria-hidden="true">Search exercises</span>
                  <input
                    aria-label="Search routine exercises"
                    value={search}
                    maxLength={120}
                    disabled={locked}
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                    placeholder="Bench, squat, running…"
                  />
                </label>
                <label>
                  <span aria-hidden="true">Category</span>
                  <select
                    aria-label="Routine exercise category"
                    value={category}
                    disabled={locked}
                    onChange={(event) => {
                      setCategory(event.target.value);
                    }}
                  >
                    <option value="">All categories</option>
                    {categories.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="routine-picker-list">
                {exercises.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className="routine-picker-row"
                    disabled={locked}
                    aria-label={`Add ${row.name}`}
                    onClick={() =>
                      execute(async () => {
                        const saved = await api.addRoutineExercise(
                          dayId,
                          row.id,
                        );
                        onAdded(saved);
                      })
                    }
                  >
                    <span>
                      {row.name}
                      <small>
                        {
                          categories.find(
                            (category) => category.id === row.category_id,
                          )?.name
                        }
                      </small>
                    </span>
                    <span aria-hidden="true">＋</span>
                  </button>
                ))}
              </div>
              {!exercises.length && (
                <p role="status">No exercises match these filters.</p>
              )}
              <button
                type="button"
                className="routine-text-button"
                aria-label="New exercise"
                disabled={locked || !categories.length}
                onClick={() => {
                  setCreating(true);
                  setCreated(null);
                  setError("");
                }}
              >
                ＋ New exercise
              </button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const fd = new FormData(event.currentTarget);
                execute(async () => {
                  let exercise = created;
                  if (!exercise) {
                    exercise = await api.saveExercise(undefined, {
                      name: String(fd.get("name")).trim(),
                      category_id: String(fd.get("category")),
                      tracking_type: type,
                      weight_unit: (fd.get("weight-unit") ?? "kg") as
                        | "kg"
                        | "lb",
                      distance_unit: (fd.get("distance-unit") ?? "km") as
                        | "km"
                        | "mi",
                    });
                    setCreated(exercise);
                  }
                  const saved = await api.addRoutineExercise(
                    dayId,
                    exercise.id,
                  );
                  onAdded(saved);
                  setCreating(false);
                  setCreated(null);
                });
              }}
            >
              <h4>Create an exercise</h4>
              <label>
                New exercise name
                <input
                  name="name"
                  required
                  maxLength={120}
                  disabled={locked || !!created}
                />
              </label>
              <label>
                New exercise category
                <select
                  name="category"
                  defaultValue={category || categories[0]?.id}
                  disabled={locked || !!created}
                  required
                >
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tracking type
                <select
                  value={type}
                  disabled={locked || !!created}
                  onChange={(event) =>
                    setType(event.target.value as api.TrackingType)
                  }
                >
                  <option value="strength">Weight + reps</option>
                  <option value="bodyweight">Reps · optional load</option>
                  <option value="cardio">Distance + time</option>
                  <option value="duration">Time</option>
                </select>
              </label>
              {(type === "strength" || type === "bodyweight") && (
                <label>
                  Weight unit
                  <select name="weight-unit" disabled={locked || !!created}>
                    <option>kg</option>
                    <option>lb</option>
                  </select>
                </label>
              )}
              {type === "cardio" && (
                <label>
                  Distance unit
                  <select name="distance-unit" disabled={locked || !!created}>
                    <option>km</option>
                    <option>mi</option>
                  </select>
                </label>
              )}
              {created && (
                <p>
                  The exercise was created. Retry adding it to this day; no
                  duplicate will be created. Cancelling keeps it in your
                  library.
                </p>
              )}
              <div className="workout-actions">
                <button disabled={locked}>
                  {created
                    ? "Retry adding exercise"
                    : "Create and add exercise"}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setCreating(false);
                    setCreated(null);
                    setError("");
                  }}
                >
                  Cancel new exercise
                </button>
              </div>
            </form>
          )}
          {!categories.length && (
            <p>
              Create a category in All exercises before adding new exercises.
            </p>
          )}
          {onOpenLibrary && !exercises.length && (
            <button type="button" disabled={locked} onClick={onOpenLibrary}>
              Open exercise library
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
