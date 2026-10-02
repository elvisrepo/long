import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutScreen } from "./workout-screen";
import * as api from "./workout-api";

vi.mock("./workout-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.test" } }),
}));
const workout: api.Workout = {
  id: "w",
  name: "Upper body",
  notes: "",
  performed_on: "2026-10-02",
  created_at: "",
  is_finished: false,
  completed_set_count: 0,
  exercises: [
    {
      id: "i",
      exercise_id: "e",
      exercise_name: "Bench",
      category_name: "Chest",
      tracking_type: "strength",
      weight_unit: "kg",
      distance_unit: "km",
      display_order: 10,
      sets: [],
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [],
    exercises: [],
  });
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([]);
});
function mount(view: "home" | "routines" = "home") {
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutScreen
        search={{ view, date: "2026-10-02" }}
        onNavigate={navigate}
      />
    </QueryClientProvider>,
  );
  return navigate;
}
it("captures a saved workout as a named day in a new routine", async () => {
  vi.mocked(api.saveWorkoutRoutine).mockResolvedValue({
    id: "r",
    name: "Weekly plan",
    notes: "",
    is_active: true,
    display_order: 10,
    days: [],
  });
  vi.mocked(api.saveRoutineDay).mockResolvedValue({
    id: "d",
    name: "Push",
    notes: "",
    display_order: 10,
    exercises: [],
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Save as routine day" }),
  );
  await userEvent.type(
    await screen.findByLabelText("New routine name"),
    "Weekly plan",
  );
  await userEvent.clear(screen.getByLabelText("Day name"));
  await userEvent.type(screen.getByLabelText("Day name"), "Push");
  await userEvent.click(
    screen.getByRole("button", { name: "Save routine day" }),
  );
  await waitFor(() =>
    expect(api.saveRoutineDay).toHaveBeenCalledWith(
      "r",
      undefined,
      expect.objectContaining({ name: "Push", source_workout_id: "w" }),
    ),
  );
  expect(api.saveWorkoutRoutine).toHaveBeenCalledTimes(1);
});

it("retains a confirmed new routine after its day save fails, and retries without duplication", async () => {
  vi.mocked(api.saveWorkoutRoutine).mockResolvedValue({
    id: "r",
    name: "Weekly plan",
    notes: "",
    is_active: true,
    display_order: 10,
    days: [],
  });
  vi.mocked(api.saveRoutineDay)
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValue({
      id: "d",
      name: "Upper body",
      notes: "",
      display_order: 10,
      exercises: [],
    });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Save as routine day" }),
  );
  await userEvent.type(
    await screen.findByLabelText("New routine name"),
    "Weekly plan",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save routine day" }),
  );
  expect(
    await within(screen.getByRole("dialog")).findByRole("alert"),
  ).toHaveTextContent("Temporary failure");
  await userEvent.click(
    screen.getByRole("button", { name: "Save routine day" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api.saveWorkoutRoutine).toHaveBeenCalledTimes(1);
  expect(api.saveRoutineDay).toHaveBeenCalledTimes(2);
});

it("does not assume a failed routine read is an empty catalog", async () => {
  vi.mocked(api.getWorkoutRoutines).mockRejectedValue(new Error("offline"));
  mount("routines");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Routines couldn't load",
  );
  expect(screen.queryByText("Build a repeatable plan")).not.toBeInTheDocument();
});

it("creates an empty routine day without making a workout", async () => {
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Weekly plan",
      notes: "",
      is_active: true,
      display_order: 10,
      days: [],
    },
  ]);
  vi.mocked(api.saveRoutineDay).mockResolvedValue({
    id: "d",
    name: "Push",
    notes: "",
    display_order: 100,
    exercises: [],
  });
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Add routine day" }),
  );
  await userEvent.type(screen.getByLabelText("Day name"), "Push");
  await userEvent.click(screen.getByRole("button", { name: "Create day" }));
  await waitFor(() =>
    expect(api.saveRoutineDay).toHaveBeenCalledWith("r", undefined, {
      name: "Push",
      notes: "",
      display_order: 100,
    }),
  );
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("edits planned template quantities directly, keeping failed edits visible", async () => {
  const item: api.RoutineExercise = {
    ...workout.exercises[0],
    sets: [
      {
        id: "s",
        display_order: 10,
        weight: "40.000",
        reps: 5,
        distance: null,
        duration_seconds: null,
      },
    ],
  };
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Plan",
      notes: "",
      is_active: true,
      display_order: 10,
      days: [
        {
          id: "d",
          name: "Push",
          notes: "",
          display_order: 10,
          exercises: [item],
        },
      ],
    },
  ]);
  vi.mocked(api.saveRoutineSet)
    .mockRejectedValueOnce(new Error("Template save failed"))
    .mockResolvedValue(item.sets[0]);
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit day" }),
  );
  await userEvent.click(screen.getByRole("button", { name: /Set 1:/ }));
  await userEvent.clear(screen.getByLabelText("Weight (kg)"));
  await userEvent.type(screen.getByLabelText("Weight (kg)"), "55");
  await userEvent.click(
    screen.getByRole("button", { name: "Update planned set" }),
  );
  expect(
    await within(screen.getByRole("dialog")).findByRole("alert"),
  ).toHaveTextContent("Template save failed");
  expect(screen.getByLabelText("Weight (kg)")).toHaveValue(55);
  await userEvent.click(
    screen.getByRole("button", { name: "Update planned set" }),
  );
  await waitFor(() => expect(api.saveRoutineSet).toHaveBeenCalledTimes(2));
  expect(api.saveRoutineSet).toHaveBeenLastCalledWith("i", "s", {
    weight: "55",
    reps: 5,
    display_order: 10,
  });
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("starts on the chosen calendar date and navigates only after server success", async () => {
  const routine: api.WorkoutRoutine = {
    id: "r",
    name: "Weekly plan",
    notes: "",
    is_active: true,
    display_order: 10,
    days: [
      { id: "d", name: "Push", notes: "", display_order: 10, exercises: [] },
    ],
  };
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([routine]);
  vi.mocked(api.startRoutineDay)
    .mockRejectedValueOnce(new Error("Start failed"))
    .mockResolvedValue(workout);
  const navigate = mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Start Push" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Start failed");
  expect(navigate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Start Push" }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-10-02" }),
  );
  expect(api.startRoutineDay).toHaveBeenCalledWith("d", "2026-10-02");
});

it("clears a new planned-set draft only after confirmed save", async () => {
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Plan",
      notes: "",
      is_active: true,
      display_order: 10,
      days: [
        {
          id: "d",
          name: "Push",
          notes: "",
          display_order: 10,
          exercises: [workout.exercises[0]],
        },
      ],
    },
  ]);
  vi.mocked(api.saveRoutineSet).mockResolvedValue({
    id: "s",
    display_order: 10,
    weight: "40.000",
    reps: 5,
    distance: null,
    duration_seconds: null,
  });
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit day" }),
  );
  await userEvent.type(screen.getByLabelText("Weight (kg)"), "40");
  await userEvent.type(screen.getByLabelText("Reps"), "5");
  await userEvent.click(
    screen.getByRole("button", { name: "Add planned set", exact: true }),
  );
  await waitFor(() => expect(api.saveRoutineSet).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(null),
  );
});
