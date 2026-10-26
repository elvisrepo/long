import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutScreen } from "./workout-screen";
import * as api from "./workout-api";
vi.mock("./workout-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "workspace@example.test" } }),
}));
const item: api.RoutineExercise = {
  id: "i",
  exercise_id: "e",
  exercise_name: "Bench press",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [8, 10, 12].map((reps, n) => ({
    id: String(n),
    weight: null,
    reps,
    distance: null,
    duration_seconds: null,
    display_order: n * 10,
  })),
};
export const plan: api.WorkoutRoutine = {
  id: "r",
  name: "Push / Pull / Legs",
  notes: "Plan notes",
  display_order: 10,
  is_active: true,
  days: [
    { id: "d", name: "Push", notes: "", display_order: 10, exercises: [item] },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [],
    exercises: [],
  });
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([plan]);
});
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutScreen
        search={{ view: "routines", date: "2026-10-26" }}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it("puts the selected routine and compact exercise counts before secondary guidance", async () => {
  mount();
  expect(await screen.findByText("Bench press", { exact: true })).toBeVisible();
  expect(screen.getByText("3 sets", { exact: true })).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "How routines work" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tracking date")).not.toBeInTheDocument();
  expect(
    screen.queryByText("8 reps / 10 reps / 12 reps"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit template" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Start Push", exact: true }),
  ).toBeVisible();
});

it("remembers the selected routine for this account and ignores another account's choice", async () => {
  const other = { ...plan, id: "other", name: "Upper / Lower" };
  localStorage.setItem("longevity:routine:someone-else@example.test", "other");
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([plan, other]);
  const first = mount();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Browse routines" }),
    ).toHaveValue("r"),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Browse routines" }),
    "other",
  );
  expect(localStorage.getItem("longevity:routine:workspace@example.test")).toBe(
    "other",
  );
  first.unmount();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Browse routines" }),
    ).toHaveValue("other"),
  );
});
it("shows exercise management only in edit mode", async () => {
  mount();
  await screen.findByText("Bench press", { exact: true });
  expect(
    screen.queryByRole("button", { name: "Options for Bench press" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Edit routine exercises" }),
  );
  expect(
    screen.getByRole("button", { name: "Options for Bench press" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Start Push" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Done editing routine" }),
  );
  expect(screen.getByRole("button", { name: "Start Push" })).toBeVisible();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});
