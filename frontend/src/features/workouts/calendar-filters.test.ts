import { expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "./workout-api";
import {
  emptyCalendarFilters,
  filterCalendarWorkouts,
} from "./calendar-filters";
const row = (
  weight: string | null,
  reps: number | null,
  completed = true,
): WorkoutSet => ({
  id: `${weight}-${reps}`,
  weight,
  reps,
  is_completed: completed,
  distance: null,
  duration_seconds: null,
  comment: "",
  display_order: 10,
});
const item = (
  id: string,
  category: string,
  sets: WorkoutSet[],
  unit = "kg",
): WorkoutExercise => ({
  id,
  exercise_id: id,
  exercise_name: id,
  category_name: category,
  tracking_type: "strength",
  weight_unit: unit,
  distance_unit: "km",
  display_order: 10,
  sets,
});
const workout = (id: string, exercises: WorkoutExercise[]): Workout => ({
  id,
  name: id,
  performed_on: "2026-10-26",
  notes: "",
  is_finished: false,
  created_at: "",
  completed_set_count: exercises
    .flatMap((i) => i.sets)
    .filter((s) => s.is_completed).length,
  exercises,
});
it("requires weight and reps on the same completed set in the selected saved units", () => {
  const filters = {
    ...emptyCalendarFilters(),
    exercise: { id: "bench", name: "Bench" },
    weight: { operator: "gte" as const, value: "100" },
    reps: { operator: "gte" as const, value: "5" },
  };
  const sessions = [
    workout("split", [item("bench", "Chest", [row("100", 2), row("60", 5)])]),
    workout("planned", [item("bench", "Chest", [row("100", 5, false)])]),
    workout("unknown", [item("bench", "Chest", [row(null, 5)])]),
    workout("pounds", [item("bench", "Chest", [row("100", 5)], "lb")]),
    workout("match", [item("bench", "Chest", [row("100.000", 5)])]),
  ];
  expect(
    filterCalendarWorkouts(sessions, filters).map((match) => match.workout.id),
  ).toEqual(["match"]);
});
it("matches all categories within one session and intersects exercise/category choices", () => {
  const sessions = [
    workout("chest", [item("bench", "Chest", [row("60", 8)])]),
    workout("arms", [item("dip", "Triceps", [row("20", 8)])]),
    workout("both", [
      item("bench", "Chest", [row("60", 8)]),
      item("dip", "Triceps", [row("20", 8)]),
    ]),
  ];
  const filters = {
    ...emptyCalendarFilters(),
    categories: ["Chest", "Triceps"],
    categoryMode: "all" as const,
  };
  expect(
    filterCalendarWorkouts(sessions, filters).map((match) => match.workout.id),
  ).toEqual(["both"]);
  expect(
    filterCalendarWorkouts(sessions, { ...filters, categoryMode: "any" }).map(
      (match) => match.workout.id,
    ),
  ).toEqual(["chest", "arms", "both"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      categories: ["Triceps"],
      exercise: { id: "bench", name: "Bench" },
    }),
  ).toEqual([]);
});
it("compares decimals exactly, distinguishes unknown from zero, and rejects invalid predicates", () => {
  const sessions = [
    workout("zero", [item("bench", "Chest", [row("0.000", 8)])]),
    workout("unknown", [item("bench", "Chest", [row(null, 8)])]),
    workout("decimal", [item("bench", "Chest", [row("0.100", 8)])]),
  ];
  const filters = {
    ...emptyCalendarFilters(),
    exercise: { id: "bench", name: "Bench" },
    weight: { operator: "eq" as const, value: "0" },
  };
  expect(
    filterCalendarWorkouts(sessions, filters).map((match) => match.workout.id),
  ).toEqual(["zero"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      weight: { operator: "eq", value: ".1" },
    }).map((match) => match.workout.id),
  ).toEqual(["decimal"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      weight: { operator: "lt", value: "0.100" },
    }).map((match) => match.workout.id),
  ).toEqual(["zero"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      weight: { operator: "gt", value: "0" },
    }).map((match) => match.workout.id),
  ).toEqual(["decimal"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      weight: { operator: "lte", value: "0" },
    }).map((match) => match.workout.id),
  ).toEqual(["zero"]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      weight: { operator: "eq", value: "0.0001" },
    }),
  ).toEqual([]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...filters,
      reps: { operator: "gte", value: "2.5" },
    }),
  ).toEqual([]);
});
it("classifies matching planned entries independently of unrelated completed work", () => {
  const sessions = [
    workout("mixed", [
      item("bench", "Chest", [row("60", 8, false)]),
      item("squat", "Legs", [row("80", 8)]),
    ]),
  ];
  expect(
    filterCalendarWorkouts(sessions, {
      ...emptyCalendarFilters(),
      exercise: { id: "bench", name: "Bench" },
      status: "planned",
    })[0].training,
  ).toBe(false);
  expect(
    filterCalendarWorkouts(sessions, {
      ...emptyCalendarFilters(),
      exercise: { id: "bench", name: "Bench" },
      status: "training",
    }),
  ).toEqual([]);
  expect(
    filterCalendarWorkouts(sessions, {
      ...emptyCalendarFilters(),
      exercise: { id: "bench", name: "Bench" },
      reps: { operator: "gte", value: "1" },
    }),
  ).toEqual([]);
});
