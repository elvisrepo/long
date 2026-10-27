import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/modal";
import {
  getWorkoutRange,
  type Workout,
  type ExerciseCategory,
  type Exercise,
} from "./workout-api";
import {
  localDay,
  shiftDay,
  dayLabel,
  type NavigateWorkout,
} from "./workout-navigation";
import { WorkoutPreview } from "./workout-preview";
import { WorkoutDayDetails } from "./workout-read-content";
import { CalendarFilterDialog } from "./calendar-filter-dialog";
import { CalendarWorkoutList } from "./calendar-workout-list";
import {
  emptyCalendarFilters,
  filterCalendarWorkouts,
  calendarHasFilters,
  type CalendarFilters,
} from "./calendar-filters";
import {
  defaultCalendarDisplay,
  readCalendarDisplay,
  saveCalendarDisplay,
  useWideCalendar,
  type CalendarDisplay,
} from "./calendar-display";
interface CalendarProps {
  compact?: boolean;
  categories?: ExerciseCategory[];
  exercises?: Exercise[];
  owner: string;
  date: string;
  busy: boolean;
  navigate: NavigateWorkout;
  renderSelectedDay?: (sessions: Workout[]) => ReactNode;
}
export function WorkoutCalendar(props: CalendarProps) {
  return <CalendarWorkspace key={props.owner} {...props} />;
}
function CalendarWorkspace({
  owner,
  date,
  busy,
  navigate,
  renderSelectedDay,
  compact = false,
  categories: definitions = [],
  exercises: library = [],
}: CalendarProps) {
  const first = date.slice(0, 7) + "-01";
  const monthDate = new Date(first + "T12:00:00");
  const nextDate = new Date(monthDate);
  nextDate.setMonth(nextDate.getMonth() + 1);
  const last = shiftDay(localDay(nextDate), -1);
  const previousDate = new Date(monthDate);
  previousDate.setMonth(previousDate.getMonth() - 1);
  const monthName = monthDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const query = useQuery({
    queryKey: ["workouts", owner, "month", first],
    queryFn: () => getWorkoutRange(first, last),
  });
  const [filters, setFilters] = useState<CalendarFilters>(emptyCalendarFilters);
  const [display, setDisplay] = useState<CalendarDisplay>(() =>
    compact ? defaultCalendarDisplay() : readCalendarDisplay(owner),
  );
  const [dialog, setDialog] = useState<
    "filters" | "display" | "info" | "month" | null
  >(null);
  const [jump, setJump] = useState(first.slice(0, 7));
  const [inspected, setInspected] = useState<{
    date: string;
    id?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{ date: string; id?: string } | null>(
    null,
  );
  const wide = useWideCalendar();
  const panel = !compact && !renderSelectedDay && display.panel && wide;
  const selected: { date: string; id?: string } =
    inspected &&
    inspected.date.slice(0, 7) === first.slice(0, 7) &&
    !compact &&
    !renderSelectedDay
      ? inspected
      : { date };
  const selectedDate = selected.date;
  const locked = busy || query.isFetching;
  const matches = filterCalendarWorkouts(query.data ?? [], filters);
  const dates = [
    ...new Set(matches.map((match) => match.workout.performed_on)),
  ].sort();
  const previous = dates.filter((day) => day < selectedDate).at(-1);
  const next = dates.find((day) => day > selectedDate);
  const colour = (name: string) =>
    definitions.find((row) => row.name === name)?.colour ?? "#81909c";
  const entries = query.data?.flatMap((workout) => workout.exercises) ?? [];
  const exercises = new Map<string, string>();
  for (const item of entries)
    if (!exercises.has(item.exercise_id))
      exercises.set(item.exercise_id, item.exercise_name);
  for (const item of library)
    if (!exercises.has(item.id)) exercises.set(item.id, item.name);
  if (filters.exercise)
    exercises.set(filters.exercise.id, filters.exercise.name);
  const weightUnits = new Map<string, "kg" | "lb">();
  const performanceExercises = new Set<string>();
  for (const item of library) {
    if (item.weight_unit === "kg" || item.weight_unit === "lb")
      weightUnits.set(item.id, item.weight_unit);
    if (
      item.tracking_type === "strength" ||
      item.tracking_type === "bodyweight"
    )
      performanceExercises.add(item.id);
  }
  const recordedUnits = new Map<string, Set<string>>();
  for (const item of entries) {
    const units = recordedUnits.get(item.exercise_id) ?? new Set<string>();
    units.add(item.weight_unit);
    recordedUnits.set(item.exercise_id, units);
    if (
      item.tracking_type === "strength" ||
      item.tracking_type === "bodyweight"
    )
      performanceExercises.add(item.exercise_id);
  }
  for (const [id, units] of recordedUnits)
    if (units.size === 1) {
      const unit = [...units][0];
      if (unit === "kg" || unit === "lb") weightUnits.set(id, unit);
    }
  const categories = [
    ...new Set([
      ...definitions.map((row) => row.name),
      ...entries.map((item) => item.category_name),
      ...filters.categories,
    ]),
  ].sort();
  const completedCategoryNames = [
    ...new Set(
      entries
        .filter((item) => item.sets.some((row) => row.is_completed))
        .map((item) => item.category_name),
    ),
  ].sort();
  const active = calendarHasFilters(filters);
  function preference(value: Partial<CalendarDisplay>) {
    const updated = { ...display, ...value };
    setDisplay(updated);
    if (!compact) saveCalendarDisplay(owner, updated);
  }
  function changeMonth(target: string) {
    setPreview(null);
    setInspected(null);
    navigate({ view: "calendar", date: target });
  }
  function inspect(day: string, id?: string) {
    if (compact || renderSelectedDay) {
      navigate({ view: "home", date: day });
      return;
    }
    setInspected({ date: day, id });
    if (!panel) setPreview({ date: day, id });
  }
  function selectDay(day: string) {
    const found = matches.some((match) => match.workout.performed_on === day);
    if (!compact && !renderSelectedDay && found) inspect(day);
    else navigate({ view: "home", date: day });
  }
  const navigation = {
    label: `Matching workout days · ${monthName}`,
    previous: previous ? () => inspect(previous) : undefined,
    next: next ? () => inspect(next) : undefined,
  };
  const days = Number(last.slice(-2));
  const leading = (monthDate.getDay() + 6) % 7;
  const today = localDay(new Date());
  const symbol = { gte: "≥", gt: ">", eq: "=", lte: "≤", lt: "<" };
  const chip = (label: string, remove: () => void) => (
    <button
      key={label}
      className="calendar-filter-chip"
      aria-label={`Remove ${label} filter`}
      disabled={locked}
      onClick={remove}
    >
      {label} <span aria-hidden="true">×</span>
    </button>
  );
  const grid = (
    <div className="workout-calendar-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
        <small key={day}>{day}</small>
      ))}
      {Array.from({ length: leading }, (_, index) => (
        <span key={`empty-${index}`} />
      ))}
      {Array.from({ length: days }, (_, index) => {
        const day = first.slice(0, 8) + String(index + 1).padStart(2, "0");
        const sessions = matches.filter(
            (match) => match.workout.performed_on === day,
          ),
          trained = sessions.filter((match) => match.training).length,
          planned = sessions.length - trained;
        const names = [
          ...new Set(sessions.flatMap((match) => match.categoryNames)),
        ].sort();
        return (
          <button
            key={day}
            className="calendar-date"
            disabled={locked}
            aria-pressed={selectedDate === day}
            aria-current={today === day ? "date" : undefined}
            aria-label={`${day}: ${trained} training session${trained === 1 ? "" : "s"}, ${planned} planned session${planned === 1 ? "" : "s"}`}
            aria-description={
              !compact && names.length
                ? `Completed categories: ${names.join(", ")}`
                : undefined
            }
            onClick={() => selectDay(day)}
          >
            <span>{index + 1}</span>
            {(trained > 0 || planned > 0) && (
              <small title="Completed training and planned sessions">
                {trained > 0 && (
                  <span className="workout-calendar-count training">
                    {compact ? "●" : `T${trained}`}
                  </span>
                )}
                {trained > 0 && planned > 0 && !compact && " · "}
                {planned > 0 && (
                  <span className="workout-calendar-count planned">
                    {compact ? "●" : `P${planned}`}
                  </span>
                )}
              </small>
            )}
            {!compact && display.dots && names.length > 0 && (
              <span
                className="workout-calendar-category-dots"
                aria-hidden="true"
              >
                {names.map((name) => (
                  <span
                    key={name}
                    title={`${name} category`}
                    style={{ backgroundColor: colour(name) }}
                  />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
  return (
    <section
      className={
        compact ? "workout-card workout-calendar-compact" : "calendar-workspace"
      }
      aria-label="Workout calendar"
    >
      {!compact && <h1 className="visually-hidden">Workout calendar</h1>}
      {preview && (
        <WorkoutPreview
          owner={owner}
          date={preview.date}
          workoutId={preview.id}
          navigate={navigate}
          onClose={() => setPreview(null)}
          navigation={navigation}
        />
      )}
      <header className="calendar-month-toolbar">
        <button
          aria-label="Previous month"
          disabled={locked}
          onClick={() => changeMonth(localDay(previousDate))}
        >
          ←
        </button>
        <h2 aria-label={monthName}>
          {compact ? (
            monthName
          ) : (
            <button
              aria-label="Choose calendar month"
              disabled={locked}
              onClick={() => {
                setJump(first.slice(0, 7));
                setDialog("month");
              }}
            >
              {monthName}
            </button>
          )}
        </h2>
        <button
          aria-label="Next month"
          disabled={locked}
          onClick={() => changeMonth(localDay(nextDate))}
        >
          →
        </button>
      </header>
      {!compact && (
        <>
          <div className="calendar-toolbar">
            <div
              className="calendar-view-switch"
              role="group"
              aria-label="Calendar view"
            >
              <button
                aria-label="Month view"
                aria-pressed={display.mode === "month"}
                onClick={() => preference({ mode: "month" })}
              >
                Month
              </button>
              <button
                aria-label="List view"
                aria-pressed={display.mode === "list"}
                onClick={() => preference({ mode: "list" })}
              >
                List
              </button>
            </div>
            <button disabled={locked} onClick={() => changeMonth(today)}>
              Today
            </button>
            <button
              aria-label="Calendar filters"
              disabled={locked}
              onClick={() => setDialog("filters")}
            >
              Filters
              {active && (
                <span className="calendar-active-marker" aria-label="active">
                  {" "}
                  ·
                </span>
              )}
            </button>
            <button
              aria-label="Calendar display options"
              title="Display options"
              onClick={() => setDialog("display")}
            >
              ⋯
            </button>
          </div>
          {active && (
            <div
              className="calendar-active-filters"
              aria-label="Active calendar filters"
            >
              {filters.exercise &&
                chip(filters.exercise.name, () =>
                  setFilters({
                    ...filters,
                    exercise: null,
                    weight: { operator: "gte", value: "" },
                    reps: { operator: "gte", value: "" },
                  }),
                )}
              {filters.categories.map((name) =>
                chip(name, () =>
                  setFilters({
                    ...filters,
                    categories: filters.categories.filter(
                      (value) => value !== name,
                    ),
                  }),
                ),
              )}
              {filters.categories.length > 1 && (
                <small>Match {filters.categoryMode}</small>
              )}
              {filters.status !== "all" &&
                chip(
                  filters.status === "training"
                    ? "Completed training"
                    : "Planned",
                  () => setFilters({ ...filters, status: "all" }),
                )}
              {filters.weight.value &&
                chip(
                  `Weight ${symbol[filters.weight.operator]} ${filters.weight.value} ${filters.weightUnit}`,
                  () =>
                    setFilters({
                      ...filters,
                      weight: { operator: "gte", value: "" },
                    }),
                )}
              {filters.reps.value &&
                chip(
                  `Reps ${symbol[filters.reps.operator]} ${filters.reps.value}`,
                  () =>
                    setFilters({
                      ...filters,
                      reps: { operator: "gte", value: "" },
                    }),
                )}
              <button
                className="calendar-clear-filters"
                disabled={locked}
                onClick={() => setFilters(emptyCalendarFilters())}
              >
                Reset filters
              </button>
            </div>
          )}
        </>
      )}
      {query.isPending ? (
        <p role="status">Loading month…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Month couldn't load. No empty history is assumed.</p>
          <button onClick={() => void query.refetch()}>Retry month</button>
        </>
      ) : (
        <>
          <div className={`calendar-layout${panel ? " has-panel" : ""}`}>
            <div className="calendar-main">
              {compact || display.mode === "month" ? (
                grid
              ) : (
                <CalendarWorkoutList
                  matches={matches}
                  display={display}
                  colour={colour}
                  selected={selected.id}
                  busy={locked}
                  onSelect={(workout) =>
                    inspect(workout.performed_on, workout.id)
                  }
                />
              )}
              {active && !matches.length && (
                <p>No workouts match these filters in this month.</p>
              )}
              {!active && !matches.length && !compact && (
                <p>No workouts recorded in this month.</p>
              )}
              {!compact && (
                <>
                  <div className="calendar-workout-navigation">
                    <button
                      aria-label="Previous matching workout day"
                      disabled={locked || !previous}
                      onClick={() => previous && inspect(previous)}
                    >
                      ←
                    </button>
                    <button
                      aria-label="Show matching workouts as list"
                      className="calendar-month-count"
                      onClick={() => preference({ mode: "list" })}
                    >
                      <span role="status">
                        {matches.length} matching{" "}
                        {matches.length === 1 ? "session" : "sessions"} in this
                        month.
                      </span>
                    </button>
                    <button
                      aria-label="Next matching workout day"
                      disabled={locked || !next}
                      onClick={() => next && inspect(next)}
                    >
                      →
                    </button>
                  </div>
                  <div
                    className="calendar-status-key"
                    role="group"
                    aria-label="Workout status key"
                  >
                    <span>
                      <b>T</b> Completed training
                    </span>
                    <span>
                      <b>P</b> Planned
                    </span>
                  </div>
                </>
              )}
            </div>
            {panel && (
              <aside
                className="calendar-workout-panel"
                aria-label="Selected workout details"
              >
                <header>
                  <h3>{dayLabel(selectedDate)}</h3>
                  <small>Full day preview</small>
                </header>
                {matches.some(
                  (match) => match.workout.performed_on === selectedDate,
                ) ? (
                  <>
                    <WorkoutDayDetails
                      owner={owner}
                      date={selectedDate}
                      workoutId={selected.id}
                      navigate={navigate}
                    />
                    <button
                      onClick={() =>
                        navigate({
                          view: "home",
                          date: selectedDate,
                          ...(selected.id ? { session: selected.id } : {}),
                        })
                      }
                    >
                      Go to workout
                    </button>
                  </>
                ) : (
                  <p>Select a marked date to inspect its workouts.</p>
                )}
              </aside>
            )}
          </div>
          {renderSelectedDay?.(
            matches
              .filter((match) => match.workout.performed_on === date)
              .map((match) => match.workout),
          )}
        </>
      )}
      {dialog === "filters" && (
        <CalendarFilterDialog
          filters={filters}
          weightUnits={weightUnits}
          performanceExercises={performanceExercises}
          exercises={exercises}
          categories={categories}
          colour={colour}
          busy={locked}
          onApply={setFilters}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "display" && (
        <Modal
          labelledBy="calendar-display-title"
          className="calendar-dialog"
          onClose={() => setDialog(null)}
        >
          <header className="calendar-dialog-header">
            <h2 id="calendar-display-title">Calendar display</h2>
          </header>
          <div className="calendar-dialog-body calendar-display-options">
            {(
              [
                ["dots", "Category dots"],
                ["categoryNames", "Category names in list"],
                ["sets", "Set details in list"],
                ["panel", "Workout panel"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={display[key]}
                  onChange={(event) =>
                    preference({ [key]: event.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
            <p className="calendar-help">
              The workout panel is shown on wide screens. Phones keep the
              workout popup. Display choices are remembered for this account on
              this device.
            </p>
          </div>
          <footer className="calendar-dialog-footer">
            <button onClick={() => setDialog("info")}>Calendar info</button>
            <button onClick={() => setDialog(null)}>Done</button>
          </footer>
        </Modal>
      )}
      {dialog === "info" && (
        <Modal
          labelledBy="calendar-info-title"
          className="calendar-dialog"
          onClose={() => setDialog(null)}
        >
          <header className="calendar-dialog-header">
            <h2 id="calendar-info-title">Calendar info</h2>
          </header>
          <div className="calendar-dialog-body">
            <p>
              Month and List show the same displayed month and filters. Arrows
              below the calendar move between matching workout days in this
              month.
            </p>
            <p>
              T means at least one completed matching set. P means no completed
              matching sets, including empty drafts. Category dots in the month
              show completed categories; list dots identify each exercise's
              saved category.
            </p>
            <p>
              Categories use saved names. Any/All matches categories within one
              workout; exercise/category choices must also intersect. Filters
              locate workouts without trimming their exercise lists. Full-day
              previews include all sessions on that date.
            </p>
            <div
              className="workout-calendar-category-key"
              role="group"
              aria-label="Category colour key"
            >
              {completedCategoryNames.map((name) => (
                <span key={name}>
                  <i
                    className="workout-category-colour"
                    aria-hidden="true"
                    style={{ backgroundColor: colour(name) }}
                  />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <footer className="calendar-dialog-footer">
            <button onClick={() => setDialog(null)}>Close info</button>
          </footer>
        </Modal>
      )}
      {dialog === "month" && (
        <Modal
          labelledBy="calendar-month-title"
          className="calendar-dialog"
          busy={locked}
          onClose={() => setDialog(null)}
        >
          <header className="calendar-dialog-header">
            <h2 id="calendar-month-title">Choose month</h2>
          </header>
          <form
            className="calendar-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(jump)) {
                setDialog(null);
                changeMonth(jump + "-01");
              }
            }}
          >
            <div className="calendar-dialog-body">
              <label>
                Calendar month
                <input
                  type="month"
                  required
                  value={jump}
                  onChange={(event) => setJump(event.target.value)}
                />
              </label>
            </div>
            <footer className="calendar-dialog-footer">
              <button type="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="primary-button">Go to month</button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
