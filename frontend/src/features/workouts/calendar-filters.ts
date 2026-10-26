import type { Workout, WorkoutExercise } from "./workout-api";
export type Comparison = "gte" | "gt" | "eq" | "lte" | "lt";
export interface CalendarRule {
  operator: Comparison;
  value: string;
}
export interface CalendarFilters {
  exercise: { id: string; name: string } | null;
  categories: string[];
  categoryMode: "any" | "all";
  status: "all" | "training" | "planned";
  weight: CalendarRule;
  weightUnit: "kg" | "lb";
  reps: CalendarRule;
}
export interface CalendarMatch {
  workout: Workout;
  training: boolean;
  categoryNames: string[];
}
export const emptyCalendarFilters = (): CalendarFilters => ({
  exercise: null,
  categories: [],
  categoryMode: "any",
  status: "all",
  weight: { operator: "gte", value: "" },
  weightUnit: "kg",
  reps: { operator: "gte", value: "" },
});
export const calendarHasRules = (filters: CalendarFilters) =>
  !!filters.weight.value.trim() || !!filters.reps.value.trim();
export const calendarHasFilters = (filters: CalendarFilters) =>
  !!filters.exercise ||
  filters.categories.length > 0 ||
  filters.status !== "all" ||
  calendarHasRules(filters);
function decimal(value: string): bigint | null {
  const normalized = value.trim().replace(/^\./, "0.");
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}
function integer(value: string): bigint | null {
  if (!/^\d{1,10}$/.test(value.trim())) return null;
  const result = BigInt(value.trim());
  return result >= 1n && result <= 2147483647n ? result : null;
}
export function validateCalendarFilters(
  filters: CalendarFilters,
): string | null {
  if (calendarHasRules(filters) && filters.status === "planned")
    return "Performance conditions search completed sets. Clear them to filter planned entries.";
  if (calendarHasRules(filters) && !filters.exercise)
    return "Choose an exercise before adding performance conditions.";
  if (filters.weight.value.trim() && decimal(filters.weight.value) === null)
    return "Weight must be non-negative, with at most three decimal places.";
  if (filters.reps.value.trim() && integer(filters.reps.value) === null)
    return "Reps must be a positive whole number.";
  return null;
}
function compare(
  actual: bigint | null,
  expected: bigint | null,
  operator: Comparison,
): boolean {
  if (actual === null || expected === null) return false;
  switch (operator) {
    case "gte":
      return actual >= expected;
    case "gt":
      return actual > expected;
    case "eq":
      return actual === expected;
    case "lte":
      return actual <= expected;
    case "lt":
      return actual < expected;
  }
}
function matchesRules(
  item: WorkoutExercise,
  filters: CalendarFilters,
): boolean {
  if (item.tracking_type !== "strength" && item.tracking_type !== "bodyweight")
    return false;
  const weight = filters.weight.value.trim(),
    reps = filters.reps.value.trim();
  if (weight && item.weight_unit !== filters.weightUnit) return false;
  return item.sets.some(
    (row) =>
      row.is_completed &&
      (!weight ||
        compare(
          row.weight === null ? null : decimal(row.weight),
          decimal(weight),
          filters.weight.operator,
        )) &&
      (!reps ||
        compare(
          row.reps === null ? null : integer(String(row.reps)),
          integer(reps),
          filters.reps.operator,
        )),
  );
}
export function filterCalendarWorkouts(
  workouts: Workout[],
  filters: CalendarFilters,
): CalendarMatch[] {
  if (validateCalendarFilters(filters)) return [];
  const narrowed = !!filters.exercise || filters.categories.length > 0;
  const performance = calendarHasRules(filters);
  return workouts.flatMap((workout) => {
    if (filters.categories.length && filters.categoryMode === "all") {
      const names = new Set(
        workout.exercises.map((item) => item.category_name),
      );
      if (!filters.categories.every((name) => names.has(name))) return [];
    }
    let items = workout.exercises.filter(
      (item) =>
        (!filters.exercise || item.exercise_id === filters.exercise.id) &&
        (!filters.categories.length ||
          filters.categories.includes(item.category_name)),
    );
    if (narrowed && !items.length) return [];
    if (performance) {
      items = items.filter((item) => matchesRules(item, filters));
      if (!items.length) return [];
    }
    const training =
      performance ||
      (narrowed
        ? items.some((item) => item.sets.some((row) => row.is_completed))
        : workout.completed_set_count > 0);
    if (
      (filters.status === "training" && !training) ||
      (filters.status === "planned" && training)
    )
      return [];
    return [
      {
        workout,
        training,
        categoryNames: [
          ...new Set(
            items
              .filter((item) => item.sets.some((row) => row.is_completed))
              .map((item) => item.category_name),
          ),
        ].sort(),
      },
    ];
  });
}
