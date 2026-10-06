import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { getAllTimeProgress } from "./workout-all-time";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
const source: api.RecordSource = {
  workout_id: "w",
  item_id: "i",
  set_id: "s",
  weight: "70.000",
  reps: 5,
};
const point: api.ProgressPointRow = {
  date: "2023-01-01",
  value: "70.000",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  source,
};
it("keeps cardio rate units separate and selects lowest all-time pace", async () => {
  vi.mocked(api.getProgressPage).mockResolvedValue({
    count: 3,
    next: null,
    previous: null,
    types: ["cardio"],
    results: [
      { ...point, tracking_type: "cardio", value: "5", source: null },
      {
        ...point,
        date: "2026-10-01",
        tracking_type: "cardio",
        value: "6",
        source: null,
      },
      {
        ...point,
        tracking_type: "cardio",
        distance_unit: "mi",
        value: "8",
        source: null,
      },
    ],
  });
  const pace = await getAllTimeProgress("e", "2026-10-02", "best_pace");
  expect(pace.series.map((series) => series.unit)).toEqual([
    "min/km",
    "min/mi",
  ]);
  expect(pace.series[0].records[0].value).toBe(5);
  expect(pace.series[0].records[0].date).toBe("2023-01-01");
  const speed = await getAllTimeProgress("e", "2026-10-02", "max_speed");
  expect(speed.series.map((series) => series.unit)).toEqual(["km/h", "mi/h"]);
  expect(speed.series[0].records[0].value).toBe(6);
  expect(api.getRecordPage).not.toHaveBeenCalled();
});
it("loads paginated summaries, keeps per-rep records and never loads raw workouts", async () => {
  vi.mocked(api.getProgressPage)
    .mockResolvedValueOnce({
      count: 2,
      next: "https://untrusted.test/",
      previous: null,
      results: [point],
      types: ["strength"],
    })
    .mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: [{ ...point, date: "2026-10-01", value: "80.000" }],
      types: ["strength"],
    });
  vi.mocked(api.getRecordPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [{ ...point, reps: 5, source }],
  });
  const summary = await getAllTimeProgress("e", "2026-10-02", "max_weight");
  expect(api.getProgressPage).toHaveBeenLastCalledWith(
    "e",
    "2026-10-02",
    "max_weight",
    5,
    1,
  );
  expect(summary.series[0].points.map((point) => point.value)).toEqual([
    70, 80,
  ]);
  expect(summary.series[0].records[0]).toEqual({
    label: "5 reps",
    value: 70,
    unit: "kg",
    date: "2023-01-01",
    source,
  });
  expect(api.getWorkoutRange).not.toHaveBeenCalled();
});
it("keeps unit partitions separate and only requests records for the records graph", async () => {
  vi.mocked(api.getRecordPage).mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [
      { ...point, reps: 5, source },
      {
        ...point,
        weight_unit: "lb",
        value: "150",
        reps: 5,
        source: { ...source, weight: "150" },
      },
    ],
  });
  const result = await getAllTimeProgress(
    "e",
    "2026-10-02",
    "personal_records",
  );
  expect(result.series.map((series) => series.unit)).toEqual(["kg", "lb"]);
  expect(result.series.every((series) => series.points.length === 0)).toBe(
    true,
  );
  expect(api.getProgressPage).not.toHaveBeenCalled();
});
it("rejects an empty intermediate summary page instead of looping forever", async () => {
  vi.mocked(api.getProgressPage).mockResolvedValue({
    count: 1,
    next: "next",
    previous: null,
    results: [],
  });
  await expect(
    getAllTimeProgress("e", "2026-10-02", "max_reps"),
  ).rejects.toThrow("could not be fully loaded");
});
it("ignores the rep filter for graphs that do not use it", async () => {
  vi.mocked(api.getProgressPage).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
  await getAllTimeProgress("e", "2026-10-02", "max_reps", 0);
  expect(api.getProgressPage).toHaveBeenCalledWith(
    "e",
    "2026-10-02",
    "max_reps",
    5,
    0,
  );
});
