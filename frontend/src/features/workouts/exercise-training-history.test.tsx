import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { ExerciseTrainingHistory } from "./exercise-training-history";
import { dayLabel } from "./workout-navigation";
vi.mock("./workout-api");
const set = (id: string, weight: string, completed = true): api.WorkoutSet => ({
  id,
  weight,
  reps: 5,
  distance: null,
  duration_seconds: null,
  comment: id === "s1" ? "Good form" : "",
  is_completed: completed,
  display_order: 10,
});
const item: api.WorkoutExercise = {
  id: "current-item",
  exercise_id: "bench",
  exercise_name: "Bench",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [],
};
const current: api.Workout = {
  id: "current",
  name: "Current workout",
  performed_on: "2026-10-22",
  notes: "",
  is_finished: false,
  completed_set_count: 0,
  created_at: "",
  exercises: [item],
};
const old: api.Workout = {
  ...current,
  id: "old",
  name: "Bench day",
  performed_on: "2020-01-01",
  completed_set_count: 2,
  exercises: [
    {
      ...item,
      id: "old-item",
      sets: [set("s1", "70"), set("s2", "80"), set("planned", "100", false)],
    },
  ],
};
function mount() {
  const navigate = vi.fn(),
    onTrack = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseTrainingHistory
        workout={current}
        item={item}
        owner="owner"
        busy={false}
        run={(action) => {
          void action();
        }}
        navigate={navigate}
        onTrack={onTrack}
      />
    </QueryClientProvider>,
  );
  return { navigate, onTrack };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getExerciseHistoryPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [old],
  });
  vi.mocked(api.getRecordPage).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
});
it("shows comments and date stats from completed sets without writes", async () => {
  const { navigate } = mount();
  expect(await screen.findByText("Good form")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", {
      name: `Workout on ${dayLabel(old.performed_on)} · Bench day`,
    }),
  );
  const dialog = screen.getByRole("dialog", {
    name: dayLabel(old.performed_on),
  });
  expect(within(dialog).getByText("750 kg·reps")).toBeInTheDocument();
  expect(within(dialog).getByText("10 reps")).toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "View workout" }),
  );
  expect(navigate).toHaveBeenCalledWith({
    view: "home",
    date: old.performed_on,
    session: old.id,
  });
  expect(api.copyWorkoutSets).not.toHaveBeenCalled();
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});

it("shows per-set stats and copies only the selected set with retry", async () => {
  vi.mocked(api.copyWorkoutSets)
    .mockRejectedValueOnce(new Error("Copy failed"))
    .mockResolvedValue([]);
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: /Set 1 on .*70 kg/ }),
  );
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("81.7 kg")).toBeInTheDocument();
  expect(within(dialog).getByText("350 kg·reps")).toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Copy set", exact: true }),
  );
  dialog = screen.getByRole("dialog", { name: "Copy set" });
  expect(
    within(dialog).getByRole("checkbox", { name: /Copy set 1:/ }),
  ).toBeChecked();
  expect(
    within(dialog).getByRole("checkbox", { name: /Copy set 2:/ }),
  ).not.toBeChecked();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Copy", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Copy failed");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Copy", exact: true }),
  );
  await screen.findByText("Good form");
  expect(api.copyWorkoutSets).toHaveBeenLastCalledWith("current-item", "old", [
    "s1",
  ]);
  expect(api.copyWorkout).not.toHaveBeenCalled();
});

it("edits an historical set in place without changing completion", async () => {
  vi.mocked(api.saveWorkoutSet).mockResolvedValue(set("s1", "75"));
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: /Set 1 on .*70 kg/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit set", exact: true }),
  );
  const weight = screen.getByLabelText("Weight (kg)");
  expect(weight).toHaveValue(70);
  await userEvent.clear(weight);
  await userEvent.type(weight, "75");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(api.saveWorkoutSet).toHaveBeenCalledWith("old-item", "s1", {
    weight: "75",
    reps: 5,
    comment: "Good form",
  });
  expect(api.copyWorkoutSets).not.toHaveBeenCalled();
});

it("highlights a current record and keeps planned sets unmarked", async () => {
  vi.mocked(api.getRecordPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        date: old.performed_on,
        value: "80",
        reps: 5,
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        source: {
          workout_id: "old",
          item_id: "old-item",
          set_id: "s2",
          weight: "80",
          reps: 5,
        },
      },
    ],
  });
  mount();
  expect(
    await screen.findByRole("img", { name: "Current personal record" }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("button", { name: /Set 2 on .*80 kg/ })).getByRole(
      "img",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("img", { name: "Current personal record" }),
  ).toHaveLength(1);
});

it("loads additional history pages without following the next URL", async () => {
  vi.mocked(api.getExerciseHistoryPage)
    .mockResolvedValueOnce({
      count: 2,
      next: "https://untrusted.test/next",
      previous: null,
      results: [old],
    })
    .mockResolvedValueOnce({
      count: 2,
      next: null,
      previous: null,
      results: [
        { ...old, id: "older", performed_on: "2015-01-01", exercises: [] },
      ],
    });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Load older sessions" }),
  );
  expect(
    await screen.findByRole("button", { name: /Workout on .*1 Jan 2015/ }),
  ).toBeInTheDocument();
  expect(api.getExerciseHistoryPage).toHaveBeenLastCalledWith(
    "bench",
    current.performed_on,
    1,
  );
});

it("requires reopening finished source workouts before edits", async () => {
  vi.mocked(api.getExerciseHistoryPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [{ ...old, is_finished: true }],
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: /Set 1 on .*70 kg/ }),
  );
  expect(
    screen.getByRole("button", { name: "Edit set", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy set", exact: true }),
  ).toBeEnabled();
});
