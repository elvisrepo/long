import { expect, it } from "vitest";
import { progressMetrics, progressSeries } from "./workout-analysis";
import type { Workout } from "./workout-api";

function strengthSession(
  date: string,
  weights: [number, number, boolean?][],
  id = date,
): Workout {
  return {
    id,
    name: id,
    performed_on: date,
    exercises: [
      {
        exercise_id: "e",
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        sets: weights.map(([weight, reps, completed = true]) => ({
          weight: String(weight),
          reps,
          is_completed: completed,
        })),
      },
    ],
  } as unknown as Workout;
}
it("charts the maximum estimated 1RM per date using the calculator formula", () => {
  const series = progressSeries(
    [
      strengthSession("2026-10-01", [
        [60, 10],
        [70, 1],
        [200, 5, false],
      ]),
    ],
    "e",
    "estimated_1rm",
  );
  expect(series[0].points).toEqual([
    { date: "2026-10-01", value: 80, source: { weight: "60", reps: 10 } },
  ]);
  expect(series[0].unit).toBe("kg");
});
it("limits graph estimates to 1–10 reps without excluding those sets from other graphs", () => {
  const sessions = [
    strengthSession("2026-10-01", [
      [60, 10],
      [100, 11],
      [120, 30],
    ]),
  ];
  expect(
    progressSeries(sessions, "e", "estimated_1rm")[0].points[0].value,
  ).toBe(80);
  expect(progressSeries(sessions, "e", "max_weight")[0].points[0].value).toBe(
    120,
  );
  expect(
    progressSeries(
      [strengthSession("2026-10-02", [[100, 11]])],
      "e",
      "estimated_1rm",
    ),
  ).toEqual([]);
});
it("keeps the source set of the winning estimate when later sets are lower or tied", () => {
  const sessions = [
    strengthSession("2026-10-01", [[60, 10]], "first"),
    strengthSession(
      "2026-10-01",
      [
        [70, 1],
        [80, 1],
      ],
      "later",
    ),
  ];
  expect(progressSeries(sessions, "e", "estimated_1rm")[0].points[0]).toEqual({
    date: "2026-10-01",
    value: 80,
    source: { weight: "60", reps: 10 },
  });
});
it("skips sets outside the 1RM calculator's valid range without crashing progress", () => {
  const series = progressSeries(
    [
      strengthSession("2026-10-01", [
        [0, 10],
        [60, 31],
        [70, 1],
      ]),
    ],
    "e",
    "estimated_1rm",
  );
  expect(series[0].points).toEqual([
    { date: "2026-10-01", value: 70, source: { weight: "70", reps: 1 } },
  ]);
});
it("charts maximum reps rather than the reps of the heaviest set", () => {
  const series = progressSeries(
    [
      strengthSession("2026-10-01", [
        [60, 10],
        [80, 5],
        [200, 20, false],
      ]),
    ],
    "e",
    "max_reps",
  );
  expect(series[0].points).toEqual([{ date: "2026-10-01", value: 10 }]);
  expect(series[0].unit).toBe("reps");
});
it("charts the largest single-set load-times-reps volume", () => {
  const series = progressSeries(
    [
      strengthSession("2026-10-01", [
        [60, 10],
        [80, 5],
        [200, 20, false],
      ]),
    ],
    "e",
    "max_volume",
  );
  expect(series[0].points).toEqual([{ date: "2026-10-01", value: 600 }]);
  expect(series[0].unit).toBe("kg·reps");
});
it("totals workout volume across duplicate exercise entries but keeps same-day sessions separate", () => {
  const first = strengthSession(
    "2026-10-01",
    [
      [60, 10],
      [80, 5],
      [200, 20, false],
    ],
    "morning",
  );
  first.exercises.push(...strengthSession("2026-10-01", [[50, 2]]).exercises);
  const series = progressSeries(
    [first, strengthSession("2026-10-01", [[40, 5]], "evening")],
    "e",
    "workout_volume",
  );
  expect(series[0].points).toEqual([
    { date: "2026-10-01", value: 1100, session: "morning" },
    { date: "2026-10-01", value: 200, session: "evening" },
  ]);
  expect(series[0].records[0].value).toBe(1100);
});
it("totals completed reps per workout and supports bodyweight without inventing load", () => {
  const session = strengthSession(
    "2026-10-01",
    [
      [0, 10],
      [0, 5],
      [0, 20, false],
    ],
    "Pull-ups",
  );
  session.exercises[0].tracking_type = "bodyweight";
  const series = progressSeries([session], "e", "workout_reps");
  expect(series[0].points).toEqual([
    { date: "2026-10-01", value: 15, session: "Pull-ups" },
  ]);
  expect(series[0].unit).toBe("reps");
});
it("filters max weight by the requested exact rep count and keeps rep records separate", () => {
  const sessions = [
    strengthSession("2026-10-01", [
      [60, 10],
      [80, 5],
      [100, 1],
    ]),
  ];
  const series = progressSeries(sessions, "e", "max_weight_reps", 5);
  expect(series[0].points).toEqual([{ date: "2026-10-01", value: 80 }]);
  expect(series[0].records[0].label).toBe("5 reps");
  expect(progressSeries(sessions, "e", "max_weight_reps", 8)).toEqual([]);
});
it("supports cardio distance/time without mixing strength, bodyweight or frozen units", () => {
  const session = strengthSession("2026-10-01", [[50, 5]]);
  session.exercises.push({
    ...session.exercises[0],
    tracking_type: "cardio",
    sets: [
      {
        ...session.exercises[0].sets[0],
        weight: null,
        reps: null,
        distance: "3.5",
        duration_seconds: 1200,
      },
    ],
  });
  expect(progressMetrics(["cardio"]).map((option) => option.value)).toEqual([
    "max_distance",
    "max_duration",
  ]);
  expect(
    progressSeries([session], "e", "max_distance")[0].points[0].value,
  ).toBe(3.5);
  expect(progressSeries([session], "e", "max_duration")[0].unit).toBe("sec");
  expect(progressSeries([session], "e", "max_weight")).toHaveLength(1);
  const pounds = strengthSession("2026-10-01", [[100, 10]]);
  pounds.exercises[0].weight_unit = "lb";
  expect(
    progressSeries([session, pounds], "e", "workout_volume").map(
      (series) => series.unit,
    ),
  ).toEqual(["kg·reps", "lb·reps"]);
});

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
