import { expect, it } from "vitest";
import { parseWorkoutSearch, shiftDay } from "./workout-navigation";

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
