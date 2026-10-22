import { expect, it } from "vitest";
import type { WorkoutExercise, WorkoutSet } from "./workout-api";
import { historySetStats, historyWorkoutStats } from "./history-stats";
const cardio = {
  tracking_type: "cardio",
  distance_unit: "km",
  weight_unit: "kg",
  sets: [],
} as unknown as WorkoutExercise;
const set = {
  weight: null,
  reps: null,
  distance: "5",
  duration_seconds: 1500,
  is_completed: true,
} as WorkoutSet;
it("calculates cardio speed and pace and handles rounded minute boundaries", () => {
  expect(historySetStats(cardio, set)).toEqual([
    { label: "Speed", value: "12 km/h" },
    { label: "Pace", value: "5:00 min/km" },
  ]);
  expect(
    historySetStats(cardio, {
      ...set,
      distance: "1.001",
      duration_seconds: 60,
    })[1].value,
  ).toBe("1:00 min/km");
  expect(historySetStats(cardio, { ...set, distance: "0" })).toEqual([]);
});
it("keeps historical unit partitions separate and excludes planned totals", () => {
  const totals = historyWorkoutStats([
    { ...cardio, sets: [set, { ...set, is_completed: false }] },
    {
      ...cardio,
      distance_unit: "mi",
      sets: [{ ...set, distance: "3", duration_seconds: 1800 }],
    },
  ]);
  expect(totals).toHaveLength(2);
  expect(totals[0].stats).toEqual([
    { label: "Total distance", value: "5 km" },
    { label: "Total duration", value: "1500 seconds" },
  ]);
  expect(totals[1].stats).toEqual([
    { label: "Total distance", value: "3 mi" },
    { label: "Total duration", value: "1800 seconds" },
  ]);
});
