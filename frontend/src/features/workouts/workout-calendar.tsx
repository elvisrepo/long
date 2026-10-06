import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { getWorkoutRange, type Workout } from "./workout-api";
import { localDay, shiftDay, type NavigateWorkout } from "./workout-navigation";

export function WorkoutCalendar({
  owner,
  date,
  busy,
  navigate,
  renderSelectedDay,
}: {
  owner: string;
  date: string;
  busy: boolean;
  navigate: NavigateWorkout;
  renderSelectedDay?: (sessions: Workout[]) => ReactNode;
}) {
  const first = date.slice(0, 7) + "-01";
  const next = new Date(first + "T12:00:00");
  next.setMonth(next.getMonth() + 1);
  const last = shiftDay(localDay(next), -1);
  const query = useQuery({
    queryKey: ["workouts", owner, "month", first],
    queryFn: () => getWorkoutRange(first, last),
  });
  const [exercise, setExercise] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"all" | "training" | "planned">("all");
  const entries = query.data?.flatMap((workout) => workout.exercises) ?? [];
  const exercises = new Map<string, string>();
  for (const item of entries) {
    if (!exercises.has(item.exercise_id))
      exercises.set(item.exercise_id, item.exercise_name);
  }
  if (exercise) exercises.set(exercise.id, exercise.name);
  const categories = new Set(entries.map((item) => item.category_name));
  if (category) categories.add(category);
  const narrowed = !!exercise || !!category;
  const filtered =
    query.data?.flatMap((workout) => {
      const items = workout.exercises.filter(
        (item) =>
          (!exercise || item.exercise_id === exercise.id) &&
          (!category || item.category_name === category),
      );
      if (narrowed && !items.length) return [];
      const training = narrowed
        ? items.some((item) => item.sets.some((set) => set.is_completed))
        : workout.completed_set_count > 0;
      if (
        (status === "training" && !training) ||
        (status === "planned" && training)
      )
        return [];
      return [{ workout, training }];
    }) ?? [];
  const activeFilters = narrowed || status !== "all";
  const locked = busy || query.isFetching;
  const days = Number(last.slice(-2));
  const leading = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const previous = new Date(first + "T12:00:00");
  previous.setMonth(previous.getMonth() - 1);
  return (
    <section className="workout-card">
      <div className="workout-card-heading workout-calendar-heading">
        <button
          aria-label="Previous month"
          disabled={busy || query.isFetching}
          onClick={() =>
            navigate({ view: "calendar", date: localDay(previous) })
          }
        >
          ←
        </button>
        <h2>
          {new Date(first + "T12:00:00").toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          aria-label="Next month"
          disabled={busy || query.isFetching}
          onClick={() => navigate({ view: "calendar", date: localDay(next) })}
        >
          →
        </button>
      </div>
      <div
        className="workout-toolbar workout-calendar-filters"
        aria-label="Calendar filters"
      >
        <label>
          Calendar exercise
          <select
            disabled={locked}
            value={exercise?.id ?? ""}
            onChange={(event) =>
              setExercise(
                event.target.value
                  ? {
                      id: event.target.value,
                      name: exercises.get(event.target.value)!,
                    }
                  : null,
              )
            }
          >
            <option value="">All exercises</option>
            {[...exercises]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Calendar category
          <select
            disabled={locked}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All saved categories</option>
            {[...categories].sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Calendar status
          <select
            disabled={locked}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">All workouts</option>
            <option value="training">Completed training</option>
            <option value="planned">Planned only / empty drafts</option>
          </select>
        </label>
        <button
          disabled={locked || !activeFilters}
          onClick={() => {
            setExercise(null);
            setCategory("");
            setStatus("all");
          }}
        >
          Reset filters
        </button>
      </div>
      <p className="workout-note">
        Choices come from this month's recorded workouts, including archived
        exercise history. Categories use saved names. Status reflects matching
        exercise entries. Filters only locate workouts; opening or copying one
        still includes its full exercise list.
      </p>
      {query.isPending ? (
        <p role="status">Loading month…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Month couldn't load. No empty history is assumed.</p>
          <button onClick={() => void query.refetch()}>Retry month</button>
        </>
      ) : (
        <>
          <div
            className="workout-calendar-key"
            role="group"
            aria-label="Workout status key"
          >
            <div>
              <span className="workout-calendar-key-marker training">T</span>
              <span>
                <strong>Completed training</strong>
                <small>At least one completed set</small>
              </span>
            </div>
            <div>
              <span className="workout-calendar-key-marker planned">P</span>
              <span>
                <strong>Planned</strong>
                <small>No completed sets, including empty drafts</small>
              </span>
            </div>
          </div>
          <p role="status">
            {filtered.length} matching{" "}
            {filtered.length === 1 ? "session" : "sessions"} in this month.
          </p>
          {activeFilters && !filtered.length && (
            <p>No workouts match these filters in this month.</p>
          )}
          <div className="workout-calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: leading }, (_, n) => (
              <span key={`empty-${n}`} />
            ))}
            {Array.from({ length: days }, (_, n) => {
              const day = first.slice(0, 8) + String(n + 1).padStart(2, "0");
              const sessions = filtered.filter(
                (row) => row.workout.performed_on === day,
              );
              const trained = sessions.filter((row) => row.training).length;
              const planned = sessions.length - trained;
              return (
                <button
                  key={day}
                  disabled={busy}
                  aria-pressed={date === day}
                  aria-label={`${day}: ${trained} training session${trained === 1 ? "" : "s"}, ${planned} planned session${planned === 1 ? "" : "s"}`}
                  onClick={() => navigate({ view: "home", date: day })}
                >
                  <span>{n + 1}</span>
                  {(trained > 0 || planned > 0) && (
                    <small title="Completed training and planned sessions">
                      {trained > 0 && (
                        <span className="workout-calendar-count training">
                          T{trained}
                        </span>
                      )}
                      {trained > 0 && planned > 0 && " · "}
                      {planned > 0 && (
                        <span className="workout-calendar-count planned">
                          P{planned}
                        </span>
                      )}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          {renderSelectedDay?.(
            filtered
              .filter((row) => row.workout.performed_on === date)
              .map((row) => row.workout),
          )}
        </>
      )}
    </section>
  );
}
