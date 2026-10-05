import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import * as api from "./workout-api";
import { ExerciseGoals } from "./exercise-goals";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
it("creates a bodyweight rep target without a guessed weight", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getExerciseGoals).mockResolvedValue([]);
  vi.mocked(api.saveExerciseGoal).mockResolvedValue({} as api.GoalDefinition);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseGoals
        owner="owner"
        date="2026-10-05"
        exercise={
          {
            id: "pullup",
            tracking_type: "bodyweight",
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "New goal" }));
  await user.type(screen.getByLabelText("Target reps"), "10");
  expect(screen.queryByLabelText("Target weight (kg)")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save goal" }));
  expect(api.saveExerciseGoal).toHaveBeenCalledWith("pullup", undefined, {
    goal_type: "reps",
    target_value: "10",
  });
});

it.each([
  ["5.500", 5, 30, "5:30"],
  ["5.999", 6, 0, "6:00"],
] as const)(
  "preserves saved pace %s after catalog changes and display rounding",
  async (target, minutes, seconds, display) => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.mocked(api.getExerciseGoals).mockResolvedValue([
      {
        id: "pace",
        goal_type: "best_pace",
        tracking_type: "cardio",
        target_value: target,
        target_weight: null,
        target_reps: null,
        rep_rule: "at_least",
        weight_unit: "kg",
        distance_unit: "mi",
        created_at: "",
        achieved: false,
        best_value: "6",
        best_weight: null,
        progress_percent: "91.7",
        source_date: "2026-10-04",
        source: {
          workout_id: "w",
          item_id: "i",
          set_id: "s",
          weight: null,
          reps: null,
        },
      },
    ]);
    vi.mocked(api.saveExerciseGoal).mockResolvedValue({} as api.GoalDefinition);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ExerciseGoals
          owner="owner"
          date="2026-10-05"
          exercise={
            {
              id: "run",
              tracking_type: "strength",
              weight_unit: "lb",
              distance_unit: "km",
            } as api.Exercise
          }
          canCreate={false}
          navigate={navigate}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(`At most ${display} min/mi in one set`),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "91.7");
    expect(screen.getByRole("button", { name: "New goal" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Open supporting set" }),
    );
    expect(navigate).toHaveBeenCalledWith({
      view: "training",
      date: "2026-10-04",
      session: "w",
      exercise: "i",
    });
    await user.click(screen.getByRole("button", { name: /Edit goal/ }));
    expect(screen.getByLabelText("Pace minutes")).toHaveValue(minutes);
    expect(screen.getByLabelText("Pace seconds")).toHaveValue(seconds);
    expect(screen.queryByLabelText("Goal type")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save goal" }));
    expect(api.saveExerciseGoal).toHaveBeenCalledWith("run", "pace", {
      target_value: target,
    });
  },
);
it("creates a cardio pace goal in minutes and seconds without a strength payload", async () => {
  const user = userEvent.setup();
  vi.mocked(api.getExerciseGoals).mockResolvedValue([]);
  vi.mocked(api.saveExerciseGoal).mockResolvedValue({} as api.GoalDefinition);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseGoals
        owner="owner"
        date="2026-10-05"
        exercise={
          {
            id: "run",
            name: "Running",
            tracking_type: "cardio",
            is_active: true,
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "New goal" }));
  await user.selectOptions(screen.getByLabelText("Goal type"), "best_pace");
  await user.clear(screen.getByLabelText("Pace minutes"));
  await user.type(screen.getByLabelText("Pace minutes"), "5");
  await user.clear(screen.getByLabelText("Pace seconds"));
  await user.type(screen.getByLabelText("Pace seconds"), "30");
  expect(screen.queryByLabelText("Target weight (kg)")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save goal" }));
  expect(api.saveExerciseGoal).toHaveBeenCalledWith("run", undefined, {
    goal_type: "best_pace",
    target_value: "5.500",
  });
});
it("shows goal progress and opens its actual supporting lift", async () => {
  vi.mocked(api.getExerciseGoals).mockResolvedValue([
    {
      id: "goal",
      target_weight: "100.000",
      target_reps: 5,
      rep_rule: "at_least",
      weight_unit: "kg",
      distance_unit: "km",
      created_at: "",
      achieved: false,
      best_weight: "95.000",
      progress_percent: "95.0",
      source_date: "2026-10-01",
      source: {
        workout_id: "workout",
        item_id: "item",
        set_id: "set",
        weight: "95.000",
        reps: 6,
      },
    },
  ]);
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseGoals
        owner="owner"
        date="2026-10-02"
        exercise={
          {
            id: "bench",
            name: "Bench",
            tracking_type: "strength",
            is_active: true,
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={navigate}
      />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("95 kg × 6 reps · 2026-10-01"),
  ).toBeInTheDocument();
  expect(screen.getByText("Not achieved")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "95");
  await userEvent.click(
    screen.getByRole("button", { name: "Open supporting lift" }),
  );
  expect(navigate).toHaveBeenCalledWith({
    view: "training",
    date: "2026-10-01",
    session: "workout",
    exercise: "item",
  });
});

it("keeps a failed goal save in the editor with input intact", async () => {
  vi.mocked(api.getExerciseGoals).mockResolvedValue([]);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseGoals
        owner="owner"
        date="2026-10-02"
        exercise={
          {
            id: "bench",
            name: "Bench",
            tracking_type: "strength",
            is_active: true,
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "New goal" }),
  );
  vi.mocked(api.saveExerciseGoal).mockRejectedValue(
    new Error("Goal save failed"),
  );
  await userEvent.type(screen.getByLabelText("Target weight (kg)"), "100");
  await userEvent.clear(screen.getByLabelText("Target reps"));
  await userEvent.type(screen.getByLabelText("Target reps"), "5");
  await userEvent.selectOptions(screen.getByLabelText("Rep rule"), "exact");
  await userEvent.click(screen.getByRole("button", { name: "Save goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Goal save failed",
  );
  expect(screen.getByLabelText("Target weight (kg)")).toHaveValue(100);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(api.saveExerciseGoal).toHaveBeenCalledWith("bench", undefined, {
    target_weight: "100",
    target_reps: 5,
    rep_rule: "exact",
  });
});

it("requires confirmation before deleting only the selected goal", async () => {
  vi.mocked(api.getExerciseGoals).mockResolvedValue([
    {
      id: "goal",
      target_weight: "100",
      target_reps: 5,
      rep_rule: "exact",
      weight_unit: "kg",
      distance_unit: "km",
      created_at: "",
      achieved: false,
      best_weight: null,
      progress_percent: "0.0",
      source_date: null,
      source: null,
    },
  ]);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseGoals
        owner="owner"
        date="2026-10-02"
        exercise={
          {
            id: "bench",
            name: "Bench",
            tracking_type: "strength",
            is_active: true,
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Remove goal/ }),
  );
  expect(api.deleteExerciseGoal).not.toHaveBeenCalled();
  vi.mocked(api.deleteExerciseGoal).mockResolvedValue(undefined);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm remove goal" }),
  );
  expect(api.deleteExerciseGoal).toHaveBeenCalledWith("goal");
});
