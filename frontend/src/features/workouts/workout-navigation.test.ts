import { expect, it } from "vitest";
import {
  nextGroupedExercise,
  parseWorkoutSearch,
  shiftDay,
} from "./workout-navigation";

it("rejects invalid dates and incomplete training links", () => {
  expect(
    parseWorkoutSearch({
      date: "2026-02-30",
      view: "training",
      session: "foreign/path",
    }),
  ).toEqual({ view: "home" });
  expect(parseWorkoutSearch({ date: "2026-10-02", view: "history" })).toEqual({
    date: "2026-10-02",
    view: "history",
  });
  expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
});

it("accepts exercise overview links with a library UUID", () => {
  const exercise = "12345678-1234-1234-1234-123456789abc";
  expect(
    parseWorkoutSearch({ view: "overview", date: "2026-10-02", exercise }),
  ).toEqual({ view: "overview", date: "2026-10-02", exercise });
});

it("cycles only within the current group and skips ungrouped exercises", () => {
  const items = [
    { id: "a", group_name: "Circuit" },
    { id: "b", group_name: "" },
    { id: "c", group_name: "Circuit" },
  ];
  expect(nextGroupedExercise(items, "a")?.id).toBe("c");
  expect(nextGroupedExercise(items, "c")?.id).toBe("a");
  expect(nextGroupedExercise(items, "b")).toBeUndefined();
  expect(
    nextGroupedExercise([{ id: "a", group_name: "Solo" }], "a"),
  ).toBeUndefined();
});
