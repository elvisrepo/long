import { expect, it } from "vitest";
import { getDocumentTitle } from "./document-title";

it("uses the active workout view in the browser title", () => {
  expect(getDocumentTitle("/workouts", { view: "exercises" })).toBe(
    "All exercises · SyncVitals",
  );
});

it.each([
  ["home", "Workouts"],
  ["history", "Workout history"],
  ["routines", "Workout routines"],
  ["calendar", "Workout calendar"],
  ["progress", "Workout progress"],
  ["overview", "Exercise overview"],
  ["training", "Workout training"],
])("names the %s workout view", (view, title) => {
  expect(getDocumentTitle("/workouts", { view })).toBe(`${title} · SyncVitals`);
});

it("formats metric slugs and static page routes", () => {
  expect(getDocumentTitle("/metrics/body_weight")).toBe(
    "Body Weight · SyncVitals",
  );
  expect(getDocumentTitle("/settings")).toBe("Settings · SyncVitals");
});

it("uses a not-found title for unknown paths", () => {
  expect(getDocumentTitle("/not-a-real-page")).toBe(
    "Page not found · SyncVitals",
  );
});
