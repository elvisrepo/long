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
  localStorage.clear();
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
it("takes a newly saved routine straight into naming its first day", async () => {
  vi.mocked(api.saveWorkoutRoutine).mockResolvedValue({
    id: "r",
    name: "Push / Pull / Legs",
    notes: "",
    is_active: true,
    display_order: 100,
    days: [],
  });
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "New routine" }),
  );
  await userEvent.type(
    screen.getByLabelText("Routine name"),
    "Push / Pull / Legs",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save routine" }));
  expect(await screen.findByRole("dialog", { name: "Add day" })).toBeVisible();
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("copies a routine from its actions without starting a workout", async () => {
  const routine: api.WorkoutRoutine = {
    id: "r",
    name: "Weekly plan",
    notes: "Notes",
    display_order: 10,
    is_active: true,
    days: [],
  };
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([routine]);
  vi.mocked(api.copyWorkoutRoutine).mockResolvedValue({
    ...routine,
    id: "copy",
    name: "Another plan",
  });
  mount("routines");
  await userEvent.click(
    await screen.findByLabelText("Routine actions for Weekly plan"),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Copy routine", exact: true }),
  );
  await userEvent.clear(screen.getByLabelText("Copy name"));
  await userEvent.type(screen.getByLabelText("Copy name"), "Another plan");
  await userEvent.click(screen.getByRole("button", { name: "Create copy" }));
  await waitFor(() =>
    expect(api.copyWorkoutRoutine).toHaveBeenCalledWith("r", "Another plan"),
  );
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.startRoutineDay).not.toHaveBeenCalled();
});
it("confirms routine deletion and cancels without writes", async () => {
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Weekly plan",
      notes: "",
      display_order: 10,
      is_active: true,
      days: [],
    },
  ]);
  mount("routines");
  const actions = await screen.findByLabelText(
    "Routine actions for Weekly plan",
  );
  await userEvent.click(actions);
  await userEvent.click(
    screen.getByRole("button", { name: "Delete routine", exact: true }),
  );
  expect(
    screen.getByRole("dialog", { name: "Delete Weekly plan?" }),
  ).toHaveTextContent("Existing workouts are kept");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.deleteWorkoutRoutine).not.toHaveBeenCalled();
  await userEvent.click(actions);
  await userEvent.click(
    screen.getByRole("button", { name: "Delete routine", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm delete routine" }),
  );
  await waitFor(() =>
    expect(api.deleteWorkoutRoutine).toHaveBeenCalledWith("r"),
  );
});
it("searches and filters active library exercises before adding them to a routine day", async () => {
  const base: api.Exercise = {
    id: "bench",
    category_id: "chest",
    name: "Bench press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.5",
    rest_seconds: 90,
    display_order: 10,
    is_active: true,
  };
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [
      { id: "chest", name: "Chest", display_order: 10, is_active: true },
      { id: "back", name: "Back", display_order: 20, is_active: true },
    ],
    exercises: [
      base,
      { ...base, id: "row", category_id: "back", name: "Barbell row" },
      { ...base, id: "old", name: "Old exercise", is_active: false },
    ],
  });
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Plan",
      notes: "",
      display_order: 10,
      is_active: true,
      days: [
        { id: "d", name: "Pull", notes: "", display_order: 10, exercises: [] },
      ],
    },
  ]);
  vi.mocked(api.addRoutineExercise).mockResolvedValue({
    ...workout.exercises[0],
    id: "item",
    exercise_id: "row",
  });
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit routine exercises" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add exercises" }));
  await userEvent.type(
    screen.getByLabelText("Search routine exercises"),
    "bench",
  );
  expect(
    screen.getByRole("button", { name: "Add Bench press" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add Barbell row" }),
  ).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Search routine exercises"));
  await userEvent.selectOptions(
    screen.getByLabelText("Routine exercise category"),
    "back",
  );
  expect(
    screen.queryByRole("button", { name: "Add Bench press" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add Old exercise" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Barbell row" }),
  );
  await waitFor(() =>
    expect(api.addRoutineExercise).toHaveBeenCalledWith("d", "row"),
  );
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("retries attaching a newly created exercise without creating it twice", async () => {
  const exercise: api.Exercise = {
    id: "new",
    category_id: "c",
    name: "New press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.5",
    rest_seconds: 90,
    display_order: 10,
    is_active: true,
  };
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [
      { id: "c", name: "Chest", display_order: 10, is_active: true },
    ],
    exercises: [],
  });
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Plan",
      notes: "",
      display_order: 10,
      is_active: true,
      days: [
        { id: "d", name: "Push", notes: "", display_order: 10, exercises: [] },
      ],
    },
  ]);
  vi.mocked(api.saveExercise).mockResolvedValue(exercise);
  vi.mocked(api.addRoutineExercise)
    .mockRejectedValueOnce(new Error("Could not attach exercise"))
    .mockResolvedValue({ ...workout.exercises[0], exercise_id: "new" });
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit routine exercises" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add exercises" }));
  await userEvent.click(
    screen.getByRole("button", { name: /New exercise$/, exact: true }),
  );
  await userEvent.type(screen.getByLabelText("New exercise name"), "New press");
  await userEvent.click(
    screen.getByRole("button", { name: "Create and add exercise" }),
  );
  expect(
    await screen.findByText(/The exercise was created/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry adding exercise" }),
  );
  await waitFor(() => expect(api.addRoutineExercise).toHaveBeenCalledTimes(2));
  expect(api.saveExercise).toHaveBeenCalledTimes(1);
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("saves routine exercise order as one atomic draft without changing the workout", async () => {
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Plan",
      notes: "",
      display_order: 10,
      is_active: true,
      days: [
        {
          id: "d",
          name: "Push",
          notes: "",
          display_order: 10,
          exercises: [
            { ...workout.exercises[0], id: "one", exercise_name: "Bench" },
            { ...workout.exercises[0], id: "two", exercise_name: "Row" },
          ],
        },
      ],
    },
  ]);
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Edit routine exercises",
      exact: true,
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reorder Bench", exact: true }),
  );
  const dialog = screen.getByRole("dialog", {
    name: "Reorder routine exercises",
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Move Row (exercise 2) up" }),
  );
  expect(api.reorderRoutineItems).not.toHaveBeenCalled();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Save order" }),
  );
  await waitFor(() =>
    expect(api.reorderRoutineItems).toHaveBeenCalledWith(
      "exercises",
      "d",
      ["two", "one"],
      ["one", "two"],
    ),
  );
  expect(api.updateWorkout).not.toHaveBeenCalled();
});
it("explains plans versus templates and guides empty templates into exercise setup", async () => {
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
    {
      id: "r",
      name: "Push / Pull / Legs",
      notes: "",
      display_order: 10,
      is_active: true,
      days: [
        { id: "d", name: "Push", notes: "", display_order: 10, exercises: [] },
      ],
    },
  ]);
  mount("routines");
  expect(
    await screen.findByRole("button", { name: "Start Push" }),
  ).toBeDisabled();
  expect(
    screen.queryByText(/A routine is a reusable plan/),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Routine info" }));
  expect(
    screen.getByRole("dialog", { name: "Routine info" }),
  ).toHaveTextContent("A routine is a reusable plan");
  await userEvent.click(
    screen.getByRole("button", { name: "Close", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit routine exercises" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add exercises" }));
  expect(
    await screen.findByRole("dialog", { name: "Add exercise" }),
  ).toBeVisible();
  expect(api.startRoutineDay).not.toHaveBeenCalled();
});
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
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Manage workout", exact: true }),
  );
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
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Manage workout", exact: true }),
  );
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
  vi.mocked(api.saveRoutineDay).mockImplementation(async () => {
    const saved = {
      id: "d",
      name: "Push",
      notes: "",
      display_order: 10,
      exercises: [],
    };
    vi.mocked(api.getWorkoutRoutines).mockResolvedValue([
      {
        id: "r",
        name: "Weekly plan",
        notes: "",
        is_active: true,
        display_order: 10,
        days: [saved],
      },
    ]);
    return saved;
  });
  mount("routines");
  await userEvent.click(await screen.findByRole("button", { name: "Add day" }));
  await userEvent.type(screen.getByLabelText("Day name"), "Push");
  await userEvent.click(screen.getByRole("button", { name: "Create day" }));
  await waitFor(() =>
    expect(api.saveRoutineDay).toHaveBeenCalledWith("r", undefined, {
      name: "Push",
      notes: "",
      display_order: 10,
    }),
  );
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(
    await screen.findByRole("dialog", { name: "Add exercise" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Search routine exercises")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Done", exact: true }),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Browse routines" }),
    "all",
  );
  await userEvent.click(screen.getByRole("button", { name: /Weekly plan/ }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
  vi.mocked(api.replaceRoutineSets)
    .mockRejectedValueOnce(new Error("Template save failed"))
    .mockResolvedValue(item);
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit routine exercises" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Options for Bench" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit predefined sets" }),
  );
  expect(screen.queryByLabelText("Set order")).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Set 1 weight (kg)"));
  await userEvent.type(screen.getByLabelText("Set 1 weight (kg)"), "55");
  await userEvent.click(
    screen.getByRole("button", { name: "Save predefined sets" }),
  );
  expect(
    await within(screen.getByRole("dialog")).findByRole("alert"),
  ).toHaveTextContent("Template save failed");
  expect(screen.getByLabelText("Set 1 weight (kg)")).toHaveValue(55);
  await userEvent.click(
    screen.getByRole("button", { name: "Save predefined sets" }),
  );
  await waitFor(() => expect(api.replaceRoutineSets).toHaveBeenCalledTimes(2));
  expect(api.replaceRoutineSets).toHaveBeenLastCalledWith(
    "i",
    [{ weight: "55", reps: 5, distance: null, duration_seconds: null }],
    item.sets,
  );
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
      {
        id: "d",
        name: "Push",
        notes: "",
        display_order: 10,
        exercises: workout.exercises,
      },
    ],
  };
  vi.mocked(api.getWorkoutRoutines).mockResolvedValue([routine]);
  vi.mocked(api.getRoutineStartPreview).mockResolvedValue({
    day_id: "d",
    name: "Weekly plan · Push",
    notes: "",
    performed_on: "2026-10-02",
    carry_forward: false,
    preview_token: "a".repeat(64),
    exercises: workout.exercises.map((item) => ({
      ...item,
      carry_reason: "Carry off",
      sets: [],
    })),
  });
  vi.mocked(api.startRoutineDay)
    .mockRejectedValueOnce(new Error("Start failed"))
    .mockResolvedValue(workout);
  const navigate = mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Start Push" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Start workout" }),
  ).toBeInTheDocument();
  expect(api.startRoutineDay).not.toHaveBeenCalled();
  await userEvent.click(
    await screen.findByRole("button", { name: "Start planned workout" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Start failed");
  expect(navigate).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Start planned workout" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh preview" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Start planned workout" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start planned workout" }),
  );
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-10-02" }),
  );
  expect(api.startRoutineDay).toHaveBeenCalledWith("d", "2026-10-02", {
    carry_forward: false,
    preview_token: "a".repeat(64),
    selection: [{ item_id: "i", set_ids: [] }],
  });
});

it("cancels a new predefined-set draft without writing any template quantities", async () => {
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
  mount("routines");
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit routine exercises" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Options for Bench" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit predefined sets" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add set", exact: true }),
  );
  await userEvent.type(screen.getByLabelText("Set 1 weight (kg)"), "40");
  await userEvent.type(screen.getByLabelText("Set 1 reps"), "5");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.replaceRoutineSets).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
