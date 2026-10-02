import { expect, it } from "vitest";
import { progressSeries } from "./workout-analysis";
import type { Workout } from "./workout-api";

it("separates frozen units and ignores plans and other exercises in progress", () => {
  const sessions = [
    {
      performed_on: "2026-10-01",
      exercises: [
        {
          exercise_id: "e",
          tracking_type: "strength",
          weight_unit: "kg",
          distance_unit: "km",
          sets: [
            { weight: "40", reps: 5, is_completed: true },
            { weight: "100", reps: 5, is_completed: false },
          ],
        },
        {
          exercise_id: "e",
          tracking_type: "strength",
          weight_unit: "lb",
          distance_unit: "km",
          sets: [{ weight: "90", reps: 5, is_completed: true }],
        },
        {
          exercise_id: "other",
          tracking_type: "strength",
          weight_unit: "kg",
          distance_unit: "km",
          sets: [{ weight: "200", reps: 5, is_completed: true }],
        },
      ],
    },
  ] as unknown as Workout[];
  const series = progressSeries(sessions, "e");
  expect(series).toHaveLength(2);
  expect(series[0].points).toEqual([{ date: "2026-10-01", value: 40 }]);
  expect(series[0].records).toEqual([
    { label: "5 reps", value: 40, unit: "kg", date: "2026-10-01" },
  ]);
  expect(series[1].records[0].value).toBe(90);
});
