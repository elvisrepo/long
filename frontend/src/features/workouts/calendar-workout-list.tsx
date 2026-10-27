import type { CalendarMatch } from "./calendar-filters";
import type { CalendarDisplay } from "./calendar-display";
import type { Workout } from "./workout-api";
import { dayLabel } from "./workout-navigation";
import { WorkoutSetValues } from "./workout-read-content";
export function CalendarWorkoutList({
  matches,
  display,
  colour,
  selected,
  busy,
  onSelect,
}: {
  matches: CalendarMatch[];
  display: CalendarDisplay;
  colour: (name: string) => string;
  selected?: string;
  busy: boolean;
  onSelect: (workout: Workout) => void;
}) {
  return (
    <div className="calendar-workout-list">
      {[...matches]
        .sort(
          (a, b) =>
            b.workout.performed_on.localeCompare(a.workout.performed_on) ||
            a.workout.id.localeCompare(b.workout.id),
        )
        .map(({ workout, training }) => (
          <button
            key={workout.id}
            className="calendar-list-workout"
            aria-label={`Preview ${workout.name || "workout"} on ${workout.performed_on}`}
            aria-pressed={selected === workout.id}
            disabled={busy}
            onClick={() => onSelect(workout)}
          >
            <span className="calendar-list-heading">
              <strong>{dayLabel(workout.performed_on)}</strong>
              <small>{training ? "Completed training" : "Planned"}</small>
            </span>
            <span className="calendar-list-session-name">
              {workout.name || "Workout"}
            </span>
            {!workout.exercises.length && <small>Empty draft</small>}
            {workout.exercises.map((item) => (
              <span key={item.id} className="calendar-list-exercise">
                {display.dots && (
                  <i
                    className="workout-category-colour"
                    aria-hidden="true"
                    style={{ background: colour(item.category_name) }}
                  />
                )}
                <span>
                  <span>{item.exercise_name}</span>
                  <small>
                    {item.sets.length} {item.sets.length === 1 ? "set" : "sets"}
                    {item.sets.length > 0 &&
                    !item.sets.some((row) => row.is_completed)
                      ? " · Planned"
                      : ""}
                  </small>
                  {display.sets &&
                    item.sets.map((row) => (
                      <WorkoutSetValues key={row.id} item={item} row={row} />
                    ))}
                </span>
              </span>
            ))}
            {display.categoryNames && (
              <span className="calendar-list-categories">
                {[
                  ...new Set(
                    workout.exercises.map((item) => item.category_name),
                  ),
                ].map((name) => (
                  <small key={name}>
                    <i
                      className="workout-category-colour"
                      aria-hidden="true"
                      style={{ background: colour(name) }}
                    />
                    {name}
                  </small>
                ))}
              </span>
            )}
          </button>
        ))}
    </div>
  );
}
