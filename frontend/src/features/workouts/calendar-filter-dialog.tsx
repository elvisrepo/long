import { useState } from "react";
import { Modal } from "../../components/modal";
import {
  emptyCalendarFilters,
  calendarHasRules,
  validateCalendarFilters,
  type CalendarFilters,
  type Comparison,
} from "./calendar-filters";
const comparisons: [Comparison, string][] = [
  ["gte", "At least"],
  ["gt", "More than"],
  ["eq", "Exactly"],
  ["lte", "At most"],
  ["lt", "Less than"],
];
export function CalendarFilterDialog({
  filters,
  exercises,
  categories,
  colour,
  busy,
  weightUnits,
  performanceExercises,
  onApply,
  onClose,
}: {
  filters: CalendarFilters;
  exercises: Map<string, string>;
  weightUnits?: Map<string, "kg" | "lb">;
  performanceExercises?: Set<string>;
  categories: string[];
  colour: (name: string) => string;
  busy: boolean;
  onApply: (filters: CalendarFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CalendarFilters>(() => ({
    ...filters,
    categories: [...filters.categories],
    weight: { ...filters.weight },
    reps: { ...filters.reps },
  }));
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const supportsRules =
    !!draft.exercise &&
    (!performanceExercises ||
      performanceExercises.has(draft.exercise.id) ||
      calendarHasRules(draft));
  return (
    <Modal
      labelledBy="calendar-filters-title"
      className="calendar-dialog"
      busy={busy}
      onClose={onClose}
    >
      <header className="calendar-dialog-header">
        <h2 id="calendar-filters-title">Calendar filters</h2>
      </header>
      <form
        className="calendar-dialog-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const error = validateCalendarFilters(draft);
          setError(error ?? "");
          if (!error) {
            onApply(draft);
            onClose();
          }
        }}
      >
        <div className="calendar-dialog-body">
          <label>
            Search exercises
            <input
              value={search}
              disabled={busy}
              maxLength={120}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Exercise
            <select
              aria-label="Calendar exercise"
              value={draft.exercise?.id ?? ""}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value;
                setDraft({
                  ...draft,
                  exercise: id ? { id, name: exercises.get(id)! } : null,
                  weightUnit: weightUnits?.get(id) ?? "kg",
                  weight: { operator: "gte", value: "" },
                  reps: { operator: "gte", value: "" },
                });
              }}
            >
              <option value="">All exercises</option>
              {[...exercises]
                .filter(
                  ([id, name]) =>
                    id === draft.exercise?.id ||
                    search
                      .trim()
                      .toLowerCase()
                      .split(/\s+/)
                      .every((term) => name.toLowerCase().includes(term)),
                )
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="calendar-category-choices" disabled={busy}>
            <legend>Categories</legend>
            {categories.length ? (
              categories.map((name) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={draft.categories.includes(name)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        categories: event.target.checked
                          ? [...draft.categories, name]
                          : draft.categories.filter((value) => value !== name),
                      })
                    }
                  />
                  <i
                    className="workout-category-colour"
                    aria-hidden="true"
                    style={{ background: colour(name) }}
                  />
                  <span>{name}</span>
                </label>
              ))
            ) : (
              <p>No saved categories in this view.</p>
            )}
          </fieldset>
          <label>
            Match categories
            <select
              value={draft.categoryMode}
              disabled={busy || draft.categories.length < 2}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  categoryMode: event.target.value as "any" | "all",
                })
              }
            >
              <option value="any">Any selected category</option>
              <option value="all">
                All selected categories in one workout
              </option>
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Calendar status"
              value={draft.status}
              disabled={busy}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as CalendarFilters["status"],
                })
              }
            >
              <option value="all">All workouts</option>
              <option value="training">Completed training</option>
              <option value="planned">Planned only / empty drafts</option>
            </select>
          </label>
          {supportsRules && (
            <fieldset
              className="calendar-performance-rules"
              disabled={busy || !draft.exercise}
            >
              <legend>Completed-set conditions</legend>
              <p>
                Weight and reps must match the same completed
                strength/bodyweight set.
              </p>
              {(
                [
                  ["weight", "Weight"],
                  ["reps", "Reps"],
                ] as const
              ).map(([key, label]) => (
                <div className="calendar-rule" key={key}>
                  <label>
                    {label}
                    <select
                      aria-label={`${label} comparison`}
                      value={draft[key].operator}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [key]: {
                            ...draft[key],
                            operator: event.target.value as Comparison,
                          },
                        })
                      }
                    >
                      {comparisons.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="visually-hidden">{label} value</span>
                    <input
                      aria-label={`${label} value`}
                      type="number"
                      step={key === "weight" ? ".001" : "1"}
                      min={key === "weight" ? 0 : 1}
                      placeholder="Any"
                      value={draft[key].value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [key]: { ...draft[key], value: event.target.value },
                        })
                      }
                    />
                  </label>
                  {key === "weight" && (
                    <label>
                      Unit
                      <select
                        aria-label="Weight unit"
                        value={draft.weightUnit}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            weightUnit: event.target.value as "kg" | "lb",
                          })
                        }
                      >
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
          )}
          {!supportsRules && (
            <p className="calendar-help">
              Choose a recorded strength/bodyweight exercise to use weight and
              rep conditions.
            </p>
          )}
          <p className="calendar-help">
            Filters locate workouts. Previews retain their full exercise lists.
            Category names come from saved history.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="calendar-dialog-footer">
          <button
            type="button"
            aria-label="Reset filters"
            disabled={busy}
            onClick={() => {
              onApply(emptyCalendarFilters());
              onClose();
            }}
          >
            Reset
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            aria-label="Apply filters"
            disabled={busy}
          >
            Apply
          </button>
        </footer>
      </form>
    </Modal>
  );
}
