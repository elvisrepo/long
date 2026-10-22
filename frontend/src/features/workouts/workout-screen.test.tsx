import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
it("shows exact Home sets immediately and opens their exercise without writes", async () => {
  const user = userEvent.setup();
  const set: api.WorkoutSet = {
    id: "s",
    display_order: 1,
    weight: "80.000",
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: "",
    is_completed: false,
  };
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, exercises: [{ ...item, sets: [set] }] },
  ]);
  mount({ date: workout.performed_on });
  const block = await screen.findByRole("button", {
    name: "Open Barbell bench press",
  });
  expect(block).toHaveTextContent("80");
  expect(block).toHaveTextContent("5");
  expect(block).toHaveTextContent("Planned");
  expect(screen.queryByText("Set details (1)")).not.toBeInTheDocument();
  await user.click(block);
  expect(
    await screen.findByRole("heading", {
      name: "Barbell bench press",
      level: 1,
    }),
  ).toBeVisible();
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it("reveals Home exercise management deliberately and keeps delete confirmation", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: workout.performed_on });
  await screen.findByRole("heading", { name: "Workout", exact: true });
  expect(
    screen.queryByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete workout", exact: true }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByText("More actions ···"));
  await user.click(screen.getByRole("button", { name: "Manage workout" }));
  expect(
    screen.getByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Done managing" }));
  expect(
    screen.queryByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByText("More actions ···"));
  await user.click(screen.getByRole("button", { name: "Manage workout" }));
  await user.click(
    screen.getByRole("button", { name: "Delete workout", exact: true }),
  );
  expect(screen.getByRole("dialog", { name: "Delete workout?" })).toBeVisible();
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens Home duration correction from More actions without starting timing", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, is_finished: true },
  ]);
  vi.mocked(api.updateWorkout).mockResolvedValue(workout);
  mount({ date: workout.performed_on });
  await screen.findByRole("heading", { name: "Workout", exact: true });
  expect(
    screen.queryByRole("button", { name: "Correct duration" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  await user.click(screen.getByText("More actions ···"));
  await user.click(
    screen.getByRole("button", { name: "Time workout", exact: true }),
  );
  await user.click(screen.getByLabelText("Timing options"));
  await user.click(screen.getByRole("button", { name: "Correct duration" }));
  expect(
    screen.getByRole("dialog", { name: "Correct workout duration" }),
  ).toBeVisible();
  expect(api.updateWorkout).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Clear duration" }));
  await waitFor(() =>
    expect(api.updateWorkout).toHaveBeenCalledWith("w", {
      duration_seconds: null,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Correct workout duration" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("dialog", { name: "Time workout" })).toBeVisible();
});

it("keeps Home date controls without repeated headings or session count", async () => {
  mount({ view: "home", date: "2026-10-12" });
  await screen.findByRole("heading", { name: "No workout on this day" });
  expect(
    screen.queryByRole("heading", { name: "Workouts", exact: true }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("12 October 2026")).not.toBeInTheDocument();
  expect(screen.queryByText("0 sessions on this day")).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("region", { name: "Daily sessions" })
      .querySelector('input[type="date"]'),
  ).toHaveValue("2026-10-12");
  expect(
    screen.getAllByRole("button", { name: "Start new workout" }),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Start workout", exact: true }),
  ).not.toBeInTheDocument();
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it.each([false, true])(
  "opens an existing Home session without starting its timer (finished=%s)",
  async (finished) => {
    const user = userEvent.setup();
    const saved = { ...workout, is_finished: finished };
    vi.mocked(api.getWorkoutRange).mockResolvedValue([saved]);
    vi.mocked(api.getWorkout).mockResolvedValue(saved);
    mount({ date: workout.performed_on });
    await user.click(
      await screen.findByRole("button", {
        name: "Open Barbell bench press",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    expect(api.updateWorkout).not.toHaveBeenCalled();
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(api.addWorkoutExercise).not.toHaveBeenCalled();
  },
);

it("opens the exercise picker for an empty saved Home session", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, exercises: [] },
  ]);
  mount({ date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", { name: "Add exercise", exact: true }),
  );
  expect(
    await screen.findByRole("heading", { name: "All exercises" }),
  ).toBeVisible();
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it("distinguishes session and set status labels on Home", async () => {
  const completedSet: api.WorkoutSet = {
    id: "completed",
    weight: "70.000",
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: "",
    is_completed: true,
    display_order: 10,
  };
  const plannedSet = { ...completedSet, id: "planned", is_completed: false };
  const active = {
    ...workout,
    id: "active",
    name: "Active workout",
    completed_set_count: 1,
    exercises: [{ ...item, sets: [completedSet, plannedSet] }],
  };
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    active,
    { ...active, id: "finished", name: "Finished workout", is_finished: true },
  ]);
  mount({ date: workout.performed_on });

  expect(await screen.findByText("In progress")).toHaveClass(
    "workout-status--in-progress",
  );
  expect(screen.getByText("Finished", { exact: true })).toHaveClass(
    "workout-status--finished",
  );
  expect(screen.getAllByText("Completed", { exact: true })).toHaveLength(2);
  expect(
    screen
      .getAllByText("Completed", { exact: true })
      .every((badge) => badge.classList.contains("workout-status--completed")),
  ).toBe(true);
  expect(screen.getAllByText("Planned", { exact: true })).toHaveLength(2);
  expect(
    screen
      .getAllByText("Planned", { exact: true })
      .every((badge) => badge.classList.contains("workout-status--planned")),
  ).toBe(true);
});

it("keeps the Home workout list free of the right-side summary stack", async () => {
  mount({ view: "home", date: workout.performed_on });

  expect(
    await screen.findByRole("heading", { name: "No workout on this day" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Last 7 days" }),
  ).not.toBeInTheDocument();
});

it("starts a workout from the single empty-state action", async () => {
  mount({ view: "home", date: "2026-10-12" });

  await userEvent.click(
    await screen.findByRole("button", { name: "Start new workout" }),
  );

  await screen.findByRole("heading", { name: "All exercises" });
  expect(api.createWorkout).toHaveBeenCalledWith("2026-10-12");
});

it("opens an export preview from Home without writing or creating a workout", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ view: "home", date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(
    await screen.findByRole("button", { name: "Export workout" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Share workout" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Options", exact: true }),
  );
  expect(
    (screen.getByLabelText("Workout summary") as HTMLTextAreaElement).value,
  ).toContain("Barbell bench press");
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.updateWorkout).not.toHaveBeenCalled();
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
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(screen.getByRole("button", { name: "Manage workout" }));
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
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Manage sets" }),
  );
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
  expect(values[0]).toHaveTextContent("80");
  expect(values[1]).toHaveTextContent("Keep me");
  await userEvent.click(screen.getByText("Manage workout", { exact: true }));
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
  expect(
    screen.queryByRole("combobox", { name: "Calendar exercise" }),
  ).not.toBeInTheDocument();
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("opens copy selection from History without writes", async () => {
  vi.mocked(api.getWorkoutPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [workout],
  });
  mount({ view: "history", date: workout.performed_on });
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy workout", exact: true }),
  );
  expect(screen.getByRole("dialog", { name: "Copy workout" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", {
      name: `Include exercise 1: ${item.exercise_name}`,
    }),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.copyWorkout).not.toHaveBeenCalled();
});
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
    screen.getByRole("button", { name: "Edit", exact: true }),
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
  expect(
    screen.getByRole("region", { name: "Copy selection" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Copy", exact: true }),
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
  const copyButton = screen.getByRole("button", {
    name: "Copy",
    exact: true,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Edit", exact: true }),
  );
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
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(screen.getByRole("button", { name: "Manage workout" }));
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  expect(
    screen.getByRole("dialog", { name: "Remove Barbell bench press?" }),
  ).toHaveTextContent("sets");
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
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(screen.getByRole("button", { name: "Manage workout" }));
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("dialog", { name: "Remove Barbell bench press?" }),
  ).not.toBeInTheDocument();
});

it("keeps the confirmation and error visible if removal fails", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.deleteWorkoutItem).mockRejectedValue(
    new Error("Removal failed"),
  );
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(screen.getByRole("button", { name: "Manage workout" }));
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm exercise removal" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Removal failed");
  expect(
    screen.getByRole("dialog", { name: "Remove Barbell bench press?" }),
  ).toBeInTheDocument();
});

it("requires reopening a finished workout before removing an exercise", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, is_finished: true },
  ]);
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(screen.getByRole("button", { name: "Manage workout" }));
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
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
  await userEvent.click(
    screen.getByRole("button", { name: "Edit multiple sets" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Edit multiple sets" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(api.bulkUpdateSets).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
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
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
  await userEvent.type(await screen.findByLabelText("Weight (kg)"), "60");
  await userEvent.type(screen.getByLabelText("Reps"), "8");
  await userEvent.click(screen.getByText("+ Comment", { exact: true }));
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
  expect(
    await screen.findByRole("button", { name: "Edit set 1" }),
  ).toHaveTextContent("60");
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
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
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
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Open Barbell bench press",
        exact: true,
      }),
    );
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

it("keeps the selected date on Home without a separate week sidebar", async () => {
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  try {
    mount({ date: "2026-09-01" });
    expect(await screen.findByLabelText("Tracking date")).toHaveValue(
      "2026-09-01",
    );
    expect(
      screen.queryByRole("heading", { name: "Last 7 days" }),
    ).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("opens timing help from the Home session menu without starting the clock", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    { ...workout, notes: "Keep the last rep controlled" },
  ]);
  mount({ date: workout.performed_on });
  await screen.findByRole("button", { name: "Open Barbell bench press" });
  expect(
    screen.queryByText("Keep the last rep controlled"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("About workout timing")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Time workout", exact: true }),
  );
  await userEvent.click(screen.getByLabelText("Timing options"));
  await userEvent.click(
    screen.getByRole("button", { name: "About workout timing" }),
  );
  expect(
    screen.getByRole("dialog", { name: "About workout timing" }),
  ).toHaveTextContent("Rest between sets counts unless paused");
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it("keeps Training reorder controls secondary to editing and completion", async () => {
  const set: api.WorkoutSet = {
    id: "s",
    display_order: 1,
    weight: "80",
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: "",
    is_completed: false,
  };
  vi.mocked(api.getWorkout).mockResolvedValue({
    ...workout,
    exercises: [{ ...item, sets: [set] }],
  });
  mount({
    view: "training",
    session: "w",
    exercise: "i",
    date: workout.performed_on,
  });
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open Barbell bench press",
      exact: true,
    }),
  );
  const edit = await screen.findByRole("button", { name: "Edit set 1" });
  expect(edit).toHaveTextContent("80");
  expect(
    screen.queryByRole("button", { name: "Move set 1 up" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Manage sets" }));
  expect(screen.getByRole("button", { name: "Move set 1 up" })).toBeVisible();
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});

it("keeps the Home overview to exercise logs and opens timing through its menu", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: workout.performed_on });
  await screen.findByRole("button", { name: "Open Barbell bench press" });
  expect(
    screen.queryByRole("button", { name: "Start timer" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Continue workout" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Time workout", exact: true }),
  );
  expect(screen.getByRole("dialog", { name: "Time workout" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Start timer" })).toBeVisible();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it("opens a workout URL as the complete exercise log before entering an exercise", async () => {
  vi.mocked(api.getWorkout).mockResolvedValue({
    ...workout,
    exercises: [
      item,
      { ...item, id: "press", exercise_name: "Overhead press" },
    ],
  });
  mount({
    view: "training",
    session: "w",
    exercise: "i",
    date: workout.performed_on,
  });
  expect(
    await screen.findByRole("button", { name: "Open Barbell bench press" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Open Overhead press" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save completed set" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Open Overhead press" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Overhead press", level: 1 }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Back to workout" }),
  );
  expect(
    screen.getByRole("button", { name: "Open Barbell bench press" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save completed set" }),
  ).not.toBeInTheDocument();
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});

it("steps exercise values and clears the draft without writing sets", async () => {
  mount({
    view: "training",
    session: "w",
    exercise: "i",
    date: workout.performed_on,
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Open Barbell bench press" }),
  );
  await userEvent.type(screen.getByLabelText("Weight (kg)"), "70");
  await userEvent.click(
    screen.getByRole("button", { name: "Increase Weight (kg)" }),
  );
  expect(screen.getByLabelText("Weight (kg)")).toHaveValue(72.5);
  await userEvent.click(
    screen.getByRole("button", { name: "Decrease Weight (kg)" }),
  );
  expect(screen.getByLabelText("Weight (kg)")).toHaveValue(70);
  await userEvent.click(screen.getByRole("button", { name: "Increase Reps" }));
  expect(screen.getByLabelText("Reps")).toHaveValue(1);
  await userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.getByLabelText("Weight (kg)")).toHaveValue(null);
  expect(screen.getByLabelText("Reps")).toHaveValue(null);
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});

it("offers seven workout actions with secondary actions inside Manage workout", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  const menu = screen.getByLabelText("Actions for Workout").parentElement!;
  expect(
    Array.from(menu.querySelectorAll("button")).map((button) =>
      button.textContent?.trim(),
    ),
  ).toEqual([
    "Edit workout",
    "Comment workout",
    "Time workout",
    "Move workout",
    "Export workout",
    "Finish workout",
    "Manage workout",
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Manage workout", exact: true }),
  );
  const management = screen.getByRole("dialog", { name: "Manage workout" });
  expect(management).toHaveTextContent("Save as routine day");
  expect(management).toHaveTextContent("Delete workout");
  expect(
    screen.getByRole("button", {
      name: "Remove Barbell bench press from workout",
    }),
  ).toBeVisible();
  expect(api.updateWorkout).not.toHaveBeenCalled();
});

it.each(["Felt strong today", ""])(
  "saves only the workout comment, including clearing it (%s)",
  async (comment) => {
    vi.mocked(api.getWorkoutRange).mockResolvedValue([
      { ...workout, notes: "Existing comment" },
    ]);
    vi.mocked(api.updateWorkout).mockResolvedValue(workout);
    mount({ date: workout.performed_on });
    await userEvent.click(await screen.findByText("More actions ···"));
    await userEvent.click(
      screen.getByRole("button", { name: "Comment workout", exact: true }),
    );
    const input = screen.getByLabelText("Workout comment");
    expect(input).toHaveValue("Existing comment");
    await userEvent.clear(input);
    if (comment) await userEvent.type(input, comment);
    expect(api.updateWorkout).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Save comment", exact: true }),
    );
    await waitFor(() =>
      expect(api.updateWorkout).toHaveBeenCalledExactlyOnceWith("w", {
        notes: comment,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Comment workout" }),
      ).not.toBeInTheDocument(),
    );
  },
);

it("retains a failed workout comment draft and cancels without another save", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.updateWorkout).mockRejectedValue(new Error("Save failed"));
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Comment workout", exact: true }),
  );
  await userEvent.type(
    screen.getByLabelText("Workout comment"),
    "Keep this draft",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save comment", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("Workout comment")).toHaveValue(
    "Keep this draft",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.updateWorkout).toHaveBeenCalledTimes(1);
});

it("moves an existing workout by changing only its date and opens the destination day", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.updateWorkout).mockResolvedValue({
    ...workout,
    performed_on: "2026-10-23",
  });
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  expect(
    screen.queryByRole("button", { name: "Copy workout", exact: true }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Move workout", exact: true }),
  );
  expect(
    screen.getByRole("button", { name: "Move", exact: true }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Move to date"), {
    target: { value: "2026-10-23" },
  });
  expect(api.updateWorkout).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Move", exact: true }),
  );
  await waitFor(() =>
    expect(api.updateWorkout).toHaveBeenCalledExactlyOnceWith("w", {
      performed_on: "2026-10-23",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Move workout" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Tracking date")).toHaveValue("2026-10-23");
  expect(api.copyWorkout).not.toHaveBeenCalled();
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("cancels a move without saving and retains the selected date if moving fails", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([workout]);
  vi.mocked(api.updateWorkout).mockRejectedValue(new Error("Move failed"));
  mount({ date: workout.performed_on });
  await userEvent.click(await screen.findByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Move workout", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Move to date"), {
    target: { value: "2026-10-23" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.updateWorkout).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("More actions ···"));
  await userEvent.click(
    screen.getByRole("button", { name: "Move workout", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Move to date"), {
    target: { value: "2026-10-23" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Move", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Move failed");
  expect(screen.getByLabelText("Move to date")).toHaveValue("2026-10-23");
  expect(screen.getByLabelText("Tracking date")).toHaveValue(
    workout.performed_on,
  );
});
