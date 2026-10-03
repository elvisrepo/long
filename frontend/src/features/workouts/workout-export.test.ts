import { expect, it, vi } from "vitest";
import type { Workout } from "./workout-api";
import {
  downloadWorkoutCsv,
  workoutCsv,
  workoutSummary,
} from "./workout-export";

export const source: Workout = {
  id: "w",
  name: '=Training,"day"',
  performed_on: "2026-10-03",
  notes: "Private note",
  is_finished: false,
  created_at: "",
  completed_set_count: 1,
  exercises: [
    {
      id: "i",
      exercise_id: "e",
      exercise_name: "Bench",
      category_name: "Chest",
      tracking_type: "strength",
      weight_unit: "lb",
      distance_unit: "mi",
      display_order: 10,
      group_name: "Push",
      sets: [
        {
          id: "s",
          display_order: 10,
          weight: "0.000",
          reps: 5,
          distance: null,
          duration_seconds: null,
          comment: "Rest, then\nrepeat",
          is_completed: true,
        },
      ],
    },
  ],
};

it.each([
  "=1+1",
  "+1+1",
  "@SUM(A1)",
  "-1+1",
  " \t=1+1",
  "\u0000=1+1",
  "\ttext",
  "\ntext",
])("neutralizes spreadsheet prefix %j", (name) => {
  expect(workoutCsv({ ...source, name })).toContain(
    "\"'" + name.replaceAll('"', '""') + '"',
  );
});

it("exports frozen values and units with escaped, formula-safe text", () => {
  const csv = workoutCsv(source, true);
  expect(csv).toContain('"\'=Training,""day"""');
  expect(csv).toContain('"0.000","lb","5","","mi","","Completed"');
  expect(csv).toContain('"Rest, then\nrepeat"');
  expect(csv).toContain('"Private note"');
  expect(source.name).toBe('=Training,"day"');
});

it("downloads a UTF-8 CSV and releases its URL even if the browser click fails", () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function () {
      expect(this.download).toBe("longevity-workout-2026-10-03.csv");
      expect(this.href).toBe("blob:csv");
      throw new Error("Blocked");
    });
  try {
    expect(() => downloadWorkoutCsv(source, false)).toThrow("Blocked");
    expect(create.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
    expect(revoke).toHaveBeenCalledWith("blob:csv");
    expect(document.querySelector("a[download]")).toBeNull();
  } finally {
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  }
});

it("retains cardio distance/time and duration values without unit conversion", () => {
  const cardio = {
    ...source.exercises[0],
    tracking_type: "cardio" as const,
    sets: [
      {
        ...source.exercises[0].sets[0],
        weight: null,
        reps: null,
        distance: "1.250",
        duration_seconds: 600,
      },
    ],
  };
  expect(workoutSummary({ ...source, exercises: [cardio] })).toContain(
    "1.250 mi · 600 sec",
  );
  expect(workoutCsv({ ...source, exercises: [cardio] })).toContain(
    '"1.250","mi","600"',
  );
  expect(
    workoutSummary({
      ...source,
      exercises: [{ ...cardio, tracking_type: "duration" }],
    }),
  ).toContain("600 sec");
});

it("keeps duplicate and empty entries, unknown quantities and planned status without notes by default", () => {
  const w = {
    ...source,
    exercises: [
      source.exercises[0],
      {
        ...source.exercises[0],
        id: "duplicate",
        sets: [
          {
            ...source.exercises[0].sets[0],
            weight: null,
            reps: null,
            is_completed: false,
          },
        ],
      },
      { ...source.exercises[0], id: "empty", sets: [] },
    ],
  };
  const csv = workoutCsv(w);
  expect(csv.split("\r\n")).toHaveLength(5);
  expect(csv).toContain('"Planned"');
  expect(csv).toContain('"No sets"');
  expect(csv).not.toContain("Private note");
  expect(csv).not.toContain("Rest, then");
  const summary = workoutSummary(w);
  expect(summary).toContain("0.000 lb");
  expect(summary).toContain("Planned");
  expect(summary).toContain("3. Bench");
  expect(summary).not.toContain("Private note");
  expect(workoutSummary(w, true)).toContain("Comment: Rest, then\nrepeat");
  expect(workoutCsv({ ...source, exercises: [] }).split("\r\n")).toHaveLength(
    3,
  );
});
