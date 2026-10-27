import { afterEach, expect, it, vi } from "vitest";
import {
  defaultCalendarDisplay,
  readCalendarDisplay,
  saveCalendarDisplay,
} from "./calendar-display";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it("ignores malformed or wrongly typed display preferences", () => {
  localStorage.setItem("longevity:calendar:owner", "{");
  expect(readCalendarDisplay("owner")).toEqual(defaultCalendarDisplay());
  localStorage.setItem(
    "longevity:calendar:owner",
    JSON.stringify({ mode: "list", panel: "yes", dots: false }),
  );
  expect(readCalendarDisplay("owner")).toEqual({
    ...defaultCalendarDisplay(),
    mode: "list",
    dots: false,
  });
  expect(readCalendarDisplay("other")).toEqual(defaultCalendarDisplay());
});
it("keeps the calendar usable when device storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readCalendarDisplay("owner")).toEqual(defaultCalendarDisplay());
  expect(() =>
    saveCalendarDisplay("owner", defaultCalendarDisplay()),
  ).not.toThrow();
});
