import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutScreen } from "./workout-screen";
import type { WorkoutSearch } from "./workout-navigation";
vi.mock("./workout-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
export const exercise: api.Exercise = {
  id: "e",
  category_id: "c",
  name: "Barbell bench press",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  notes: "",
  weight_increment: "2.500",
  rest_seconds: 90,
  is_active: true,
  display_order: 10,
};
export const item: api.WorkoutExercise = {
  id: "i",
  exercise_id: "e",
  exercise_name: exercise.name,
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [],
};
export const workout: api.Workout = {
  id: "w",
  performed_on: "2026-10-02",
  name: "Workout",
  notes: "",
  is_finished: false,
  created_at: "2026-10-02T10:00:00Z",
  completed_set_count: 0,
  exercises: [item],
};
function mount(initial: WorkoutSearch = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper() {
    const [search, setSearch] = useState(initial);
    return <WorkoutScreen search={search} onNavigate={setSearch} />;
  }
  render(
    <QueryClientProvider client={client}>
      <Wrapper />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [
      { id: "c", name: "Chest", is_active: true, display_order: 10 },
    ],
    exercises: [exercise],
  });
  vi.mocked(api.initializeWorkoutCatalog).mockImplementation(
    api.getWorkoutCatalog,
  );
  vi.mocked(api.getWorkoutRange).mockResolvedValue([]);
  vi.mocked(api.getWorkoutPage).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
  vi.mocked(api.getWorkout).mockResolvedValue(workout);
  vi.mocked(api.createWorkout).mockResolvedValue({ ...workout, exercises: [] });
  vi.mocked(api.addWorkoutExercise).mockResolvedValue(item);
});
it("moves a Home exercise and reloads the server-confirmed order", async () => {
  const second = {
    ...item,
    id: "row",
    exercise_name: "Row",
    display_order: 20,
  };
  const initial = { ...workout, exercises: [item, second] };
  const moved = { ...workout, exercises: [second, item] };
  vi.mocked(api.getWorkoutRange).mockResolvedValue([initial]);
  vi.mocked(api.moveWorkoutItem).mockImplementation(async () => {
    vi.mocked(api.getWorkoutRange).mockResolvedValue([moved]);
    return moved;
  });
  mount({ date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", { name: "Move exercise 2 (Row) up" }),
  );
  expect(api.moveWorkoutItem).toHaveBeenCalledWith(
    "session-exercises",
    "row",
    "up",
  );
  expect(
    await screen.findByRole("button", { name: "Move exercise 1 (Row) up" }),
  ).toBeDisabled();
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("reorders training sets and sidebar exercises without changing the selected occurrence", async () => {
  const first: api.WorkoutSet = {
    id: "s1",
    weight: "70.000",
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: "Keep me",
    is_completed: true,
    display_order: 10,
  };
  const second = {
    ...first,
    id: "s2",
    weight: "80.000",
    comment: "",
    display_order: 20,
  };
  const selected = { ...item, sets: [first, second] };
  const row = { ...item, id: "row", exercise_name: "Row", display_order: 20 };
  let current = { ...workout, exercises: [selected, row] };
  vi.mocked(api.getWorkout).mockImplementation(async () => current);
  vi.mocked(api.moveWorkoutItem).mockImplementation(async (kind) => {
    current =
      kind === "sets"
        ? {
            ...workout,
            exercises: [{ ...selected, sets: [second, first] }, row],
          }
        : { ...current, exercises: [...current.exercises].reverse() };
    return current;
  });
  mount({
    view: "training",
    date: workout.performed_on,
    session: workout.id,
    exercise: item.id,
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Move set 2 up" }),
  );
  expect(api.moveWorkoutItem).toHaveBeenCalledWith("sets", "s2", "up");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Move set 1 up" }),
    ).toBeDisabled(),
  );
  const values = document.querySelectorAll(".workout-set-values");
  expect(values[0]).toHaveTextContent("80 kg");
  expect(values[1]).toHaveTextContent("Keep me");
  await userEvent.click(
    screen.getByRole("button", { name: "Move exercise 2 (Row) up" }),
  );
  expect(api.moveWorkoutItem).toHaveBeenCalledWith(
    "session-exercises",
    "row",
    "up",
  );
  expect(
    await screen.findByRole("button", { name: "Move exercise 1 (Row) up" }),
  ).toBeDisabled();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    exercise.name,
  );
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});
it("opens a calendar to choose a previous workout without creating a copy", async () => {
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy previous workout" }),
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName(
    "Select the workout you would like to copy",
  );
  expect(
    await screen.findByRole("heading", { name: "October 2026" }),
  ).toBeInTheDocument();
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each(["home", "history"] as const)(
  "opens the shared selection dialog from %s without writes",
  async (view) => {
    vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
    vi.mocked(api.getWorkoutPage).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [workout],
    });
    mount({ view, date: workout.performed_on });
    await userEvent.click(
      await screen.findByRole("button", { name: "Copy workout", exact: true }),
    );
    expect(
      screen.getByRole("dialog", { name: "Copy Workout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: `Include exercise 1: ${item.exercise_name}`,
      }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
    expect(
      screen.getByRole("region", { name: "Copy preview" }),
    ).toHaveTextContent(item.exercise_name);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.copyWorkout).not.toHaveBeenCalled();
    expect(api.createWorkout).not.toHaveBeenCalled();
  },
);
it("returns from selection to the source calendar without creating anything", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy previous workout" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy Workout to 2026-10-02" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Choose another workout" }),
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName(
    "Select the workout you would like to copy",
  );
  expect(
    await screen.findByRole("button", { name: "Copy Workout to 2026-10-02" }),
  ).toBeEnabled();
  expect(api.copyWorkout).not.toHaveBeenCalled();
});
it("chooses a source session in another month while keeping the copy destination", async () => {
  vi.mocked(api.getWorkoutRange).mockImplementation(async (first) =>
    first === "2026-09-01"
      ? [
          {
            ...workout,
            id: "morning",
            name: "Morning",
            performed_on: "2026-09-30",
            completed_set_count: 3,
          },
          {
            ...workout,
            id: "evening",
            name: "Evening",
            performed_on: "2026-09-30",
          },
        ]
      : [],
  );
  vi.mocked(api.copyWorkout).mockResolvedValue({ ...workout, id: "copy" });
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy previous workout" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Previous month" }),
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "2026-09-30: 1 training session, 1 planned session",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Copy Morning to 2026-10-02" }),
  ).toBeInTheDocument();
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Copy Evening to 2026-10-02" }),
  );
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
  expect(
    screen.getByRole("region", { name: "Copy preview" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Create planned workout" }),
  );
  await waitFor(() =>
    expect(api.copyWorkout).toHaveBeenCalledExactlyOnceWith(
      "evening",
      "2026-10-02",
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Tracking date")).toHaveValue("2026-10-02");
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("locks the picker while copying and preserves selection after a failed copy", async () => {
  vi.mocked(api.getWorkoutRange).mockImplementation(async (first) =>
    first === "2026-10-01" ? [workout] : [],
  );
  let rejectCopy!: (error: Error) => void;
  vi.mocked(api.copyWorkout).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectCopy = reject;
      }),
  );
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy previous workout" }),
  );
  const sourceButton = await screen.findByRole("button", {
    name: "Copy Workout to 2026-10-02",
  });
  await userEvent.click(sourceButton);
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
  const copyButton = screen.getByRole("button", {
    name: "Create planned workout",
  });
  await userEvent.click(copyButton);
  expect(copyButton).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Choose another workout" }),
  ).toBeDisabled();
  rejectCopy(new Error("Copy failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Copy failed");
  await waitFor(() => expect(copyButton).toBeEnabled());
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(api.copyWorkout).toHaveBeenCalledTimes(1);
  vi.mocked(api.copyWorkout).mockResolvedValue(workout);
  await userEvent.click(copyButton);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api.copyWorkout).toHaveBeenCalledTimes(2);
});
it("shows a failed calendar read instead of inventing empty history and allows retry", async () => {
  let fail = true;
  vi.mocked(api.getWorkoutRange).mockImplementation(async (first) => {
    if (first === "2026-10-01" && fail) throw new Error("Offline");
    return first === "2026-10-01" ? [{ ...workout, exercises: [] }] : [];
  });
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy previous workout" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Month couldn't load",
  );
  expect(
    screen.queryByText(/No matching workouts on this day/),
  ).not.toBeInTheDocument();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry month" }));
  expect(
    await screen.findByRole("button", { name: "Copy Workout to 2026-10-02" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", {
      name: "2026-10-03: 0 training sessions, 0 planned sessions",
    }),
  );
  expect(
    screen.getByText(/No matching workouts on this day/),
  ).toBeInTheDocument();
  expect(api.copyWorkout).not.toHaveBeenCalled();
});
it("browses library details without creating or changing a workout", async () => {
  mount({ view: "exercises", date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "View Barbell bench press" }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Barbell bench press");
  expect(
    screen.getByRole("button", { name: "View exercise history" }),
  ).toBeInTheDocument();
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.addWorkoutExercise).not.toHaveBeenCalled();
});
it("starts on the chosen date, selects an exercise and opens its training screen", async () => {
  vi.mocked(api.getWorkout).mockResolvedValue({ ...workout, exercises: [] });
  vi.mocked(api.addWorkoutExercise).mockImplementation(async () => {
    vi.mocked(api.getWorkout).mockResolvedValue(workout);
    return item;
  });
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Start new workout" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Add Barbell bench press" }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Barbell bench press",
      level: 1,
    }),
  ).toBeInTheDocument();
  expect(api.initializeWorkoutCatalog).toHaveBeenCalledTimes(1);
  expect(api.createWorkout).toHaveBeenCalledWith("2026-10-02");
  expect(api.addWorkoutExercise).toHaveBeenCalledWith("w", "e");
  await waitFor(() =>
    expect(screen.getByLabelText("Weight (kg)")).toBeInTheDocument(),
  );
});

it("reuses a newly created session if adding its first exercise fails", async () => {
  vi.mocked(api.addWorkoutExercise)
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockImplementation(async () => {
      vi.mocked(api.getWorkout).mockResolvedValue(workout);
      return item;
    });
  vi.mocked(api.getWorkout).mockResolvedValue({ ...workout, exercises: [] });
  mount({ view: "exercises", date: "2026-10-02", session: "w" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Add Barbell bench press" }),
  );
  await screen.findByText("Temporary failure");
  await userEvent.click(
    screen.getByRole("button", { name: "Add Barbell bench press" }),
  );
  await screen.findByRole("heading", { name: "Barbell bench press", level: 1 });
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("opens an existing exercise rather than adding another occurrence", async () => {
  mount({ view: "exercises", date: "2026-10-02", session: "w" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Open Barbell bench press" }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Barbell bench press",
      level: 1,
    }),
  ).toBeInTheDocument();
  expect(api.addWorkoutExercise).not.toHaveBeenCalled();
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("offers confirmed exercise removal on the workout overview", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: "2026-10-02" });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("sets");
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm exercise removal" }),
  );
  await waitFor(() =>
    expect(api.deleteWorkoutItem).toHaveBeenCalledWith(
      "session-exercises",
      "i",
    ),
  );
});

it("cancels removal without deleting data", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the confirmation and error visible if removal fails", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.deleteWorkoutItem).mockRejectedValue(
    new Error("Removal failed"),
  );
  mount({ date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm exercise removal" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Removal failed");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("requires reopening a finished workout before removing an exercise", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, is_finished: true },
  ]);
  mount({ date: workout.performed_on });
  expect(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  ).toBeDisabled();
});

it("includes the current session in exercise history", async () => {
  mount({ view: "training", date: "2026-10-02", session: "w", exercise: "i" });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Exercise history",
      exact: true,
    }),
  );
  expect(await screen.findByText("Current session")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back to Track" }),
  ).toBeInTheDocument();
});

it("shows one history link per session and prefers an entry with sets", async () => {
  const completed: api.WorkoutSet = {
    id: "s",
    display_order: 10,
    weight: "70",
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: "",
    is_completed: true,
  };
  vi.mocked(api.getWorkoutPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        ...workout,
        id: "old",
        performed_on: "2026-10-01",
        exercises: [item, { ...item, id: "logged", sets: [completed] }],
      },
    ],
  });
  mount({
    view: "training",
    date: workout.performed_on,
    session: "w",
    exercise: "i",
  });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Exercise history",
      exact: true,
    }),
  );
  expect(
    await screen.findAllByRole("button", {
      name: "Open exercise",
      exact: true,
    }),
  ).toHaveLength(1);
  expect(screen.getByText("70 kg · 5 reps · Completed")).toBeInTheDocument();
});

it("switching to All exercises clears the workout selection context", async () => {
  mount({
    view: "training",
    date: workout.performed_on,
    session: "w",
    exercise: "i",
  });
  await screen.findByRole("heading", { name: "Barbell bench press", level: 1 });
  await userEvent.click(
    screen.getByRole("button", { name: "All exercises", exact: true }),
  );
  expect(
    await screen.findByRole("button", { name: "View Barbell bench press" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Adding to/)).not.toBeInTheDocument();
});

it("explains when planned-only exercise dates are excluded from progress", async () => {
  const plan = {
    ...workout,
    performed_on: "2026-10-01",
    exercises: [
      {
        ...item,
        sets: [
          {
            id: "planned",
            display_order: 10,
            weight: "75",
            reps: 5,
            distance: null,
            duration_seconds: null,
            comment: "",
            is_completed: false,
          },
        ],
      },
    ],
  };
  vi.mocked(api.getWorkoutRange).mockResolvedValue([plan]);
  mount({ view: "progress", date: "2026-10-02", exercise: "e" });
  expect(
    await screen.findByText(/2026-10-01.*only planned sets/),
  ).toBeInTheDocument();
  expect(
    screen.getByText("No completed sets recorded in this window."),
  ).toBeInTheDocument();
});

it("saves a completed set with snapshot units and shows server-confirmed values", async () => {
  let saved: api.Workout = { ...workout, exercises: [{ ...item, sets: [] }] };
  vi.mocked(api.getWorkout).mockImplementation(async () => saved);
  vi.mocked(api.saveWorkoutSet).mockImplementation(async (_item, _id, data) => {
    const set: api.WorkoutSet = {
      id: "s",
      display_order: 10,
      weight: String(data.weight),
      reps: data.reps!,
      distance: null,
      duration_seconds: null,
      comment: data.comment || "",
      is_completed: true,
    };
    saved = {
      ...saved,
      completed_set_count: 1,
      exercises: [{ ...item, sets: [set] }],
    };
    return set;
  });
  mount({ view: "training", date: "2026-10-02", session: "w", exercise: "i" });
  await userEvent.type(await screen.findByLabelText("Weight (kg)"), "60");
  await userEvent.type(screen.getByLabelText("Reps"), "8");
  await userEvent.type(screen.getByLabelText("Set comment"), "Good set");
  await userEvent.click(
    screen.getByRole("button", { name: "Save completed set" }),
  );
  await waitFor(() =>
    expect(api.saveWorkoutSet).toHaveBeenCalledWith(
      "i",
      undefined,
      expect.objectContaining({
        weight: "60",
        reps: 8,
        comment: "Good set",
        is_completed: true,
      }),
    ),
  );
  expect(await screen.findByText("60 kg · 8 reps")).toBeInTheDocument();
  expect(screen.getByLabelText("Set 1 completed")).toBeChecked();
});

it("allows an empty planned set, without recording it as completed", async () => {
  vi.mocked(api.saveWorkoutSet).mockResolvedValue({
    id: "s",
    display_order: 10,
    weight: null,
    reps: null,
    distance: null,
    duration_seconds: null,
    comment: "",
    is_completed: false,
  });
  mount({ view: "training", session: "w", exercise: "i" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Add planned set" }),
  );
  await waitFor(() =>
    expect(api.saveWorkoutSet).toHaveBeenCalledWith("i", undefined, {
      weight: null,
      reps: null,
      comment: "",
      is_completed: false,
    }),
  );
});

it("does not mark a planned set completed when the server rejects it", async () => {
  vi.mocked(api.getWorkout).mockResolvedValue({
    ...workout,
    exercises: [
      {
        ...item,
        sets: [
          {
            id: "s",
            display_order: 10,
            weight: null,
            reps: null,
            distance: null,
            duration_seconds: null,
            comment: "",
            is_completed: false,
          },
        ],
      },
    ],
  });
  vi.mocked(api.saveWorkoutSet).mockRejectedValue(
    new Error("reps: This field is required."),
  );
  mount({ view: "training", session: "w", exercise: "i" });
  const checkbox = await screen.findByLabelText("Set 1 completed");
  await userEvent.click(checkbox);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "reps: This field is required.",
  );
  expect(checkbox).not.toBeChecked();
});

it("disables edits in a finished workout until it is reopened", async () => {
  vi.mocked(api.getWorkout).mockResolvedValue({
    ...workout,
    is_finished: true,
  });
  vi.mocked(api.updateWorkout).mockResolvedValue(workout);
  mount({ view: "training", session: "w", exercise: "i" });
  expect(
    await screen.findByRole("button", { name: "Save completed set" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Reopen workout" }));
  await waitFor(() =>
    expect(api.updateWorkout).toHaveBeenCalledWith("w", { is_finished: false }),
  );
});

it("edits an exercise in an archived category without reassigning its category", async () => {
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [
      { id: "c", name: "Chest", is_active: false, display_order: 10 },
    ],
    exercises: [exercise],
  });
  vi.mocked(api.saveExercise).mockResolvedValue(exercise);
  mount({ view: "exercises" });
  await userEvent.click(await screen.findByLabelText("Show archived"));
  await userEvent.click(
    screen.getByRole("button", { name: "Edit exercise Barbell bench press" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Save exercise" }));
  await waitFor(() => expect(api.saveExercise).toHaveBeenCalled());
  expect(vi.mocked(api.saveExercise).mock.calls[0][1]).not.toHaveProperty(
    "category_id",
  );
});

it.each(["duration", "cardio", "bodyweight"] as const)(
  "shows only fields relevant to %s snapshot",
  async (type) => {
    vi.mocked(api.getWorkout).mockResolvedValue({
      ...workout,
      exercises: [
        {
          ...item,
          tracking_type: type,
          distance_unit: "mi",
          weight_unit: "lb",
        },
      ],
    });
    mount({ view: "training", session: "w", exercise: "i" });
    await screen.findByRole("heading", { name: "Record a set" });
    if (type === "bodyweight")
      expect(screen.getByLabelText("Weight (lb)")).toBeInTheDocument();
    else expect(screen.queryByLabelText("Weight (lb)")).not.toBeInTheDocument();
    if (type === "cardio")
      expect(screen.getByLabelText("Distance (mi)")).toBeInTheDocument();
    if (type !== "bodyweight")
      expect(screen.getByLabelText("Duration (seconds)")).toBeInTheDocument();
  },
);

it("keeps seven-day history anchored to today when viewing another date", async () => {
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  try {
    mount({ date: "2026-09-01" });
    const today = await screen.findByRole("button", {
      name: "Fri, 2 Oct 2026, 0 sessions",
    });
    expect(today).toHaveAttribute("aria-current", "date");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Sat, 26 Sept 2026, 0 sessions",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Fri, 2 Oct 2026, 0 sessions" }),
    ).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
