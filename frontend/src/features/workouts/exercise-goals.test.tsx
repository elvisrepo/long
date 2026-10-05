import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import * as api from "./workout-api";
import { ExerciseGoals } from "./exercise-goals";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
it("creates a distance within time goal with both targets and no pace extrapolation", async () => {
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
            tracking_type: "cardio",
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
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Goal type" }),
    "distance_time",
  );
  await userEvent.type(screen.getByLabelText("Minimum distance (km)"), "5");
  await userEvent.clear(screen.getByLabelText("Time limit minutes"));
  await userEvent.type(screen.getByLabelText("Time limit minutes"), "25");
  await userEvent.clear(screen.getByLabelText("Time limit seconds"));
  await userEvent.type(screen.getByLabelText("Time limit seconds"), "10");
  expect(
    screen.getByText(/No split times or pace extrapolation/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save goal" }));
  expect(api.saveExerciseGoal).toHaveBeenCalledWith("run", undefined, {
    goal_type: "distance_time",
    target_distance: "5",
    target_duration_seconds: 1510,
  });
});
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

it("edits both combined targets with frozen units after archive/type changes and keeps errors", async () => {
  const goal: api.ExerciseGoal = {
    id: "combined",
    goal_type: "distance_time",
    tracking_type: "cardio",
    target_distance: "5.000",
    target_duration_seconds: 1501,
    target_value: null,
    target_weight: null,
    target_reps: null,
    rep_rule: "at_least",
    weight_unit: "kg",
    distance_unit: "mi",
    created_at: "",
    achieved: false,
    best_weight: null,
    best_value: null,
    progress_percent: "83.3",
    source_date: "2026-10-04",
    source: {
      workout_id: "w",
      item_id: "i",
      set_id: "s",
      weight: null,
      reps: null,
      distance: "5.000",
      duration_seconds: 1800,
    },
  };
  vi.mocked(api.getExerciseGoals).mockResolvedValue([goal]);
  vi.mocked(api.saveExerciseGoal).mockRejectedValue(
    new Error("Save failed; please retry."),
  );
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
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
    await screen.findByText("At least 5 mi within 25 min 1 sec in one set"),
  ).toBeInTheDocument();
  expect(screen.getByText("5 mi in 30 min · 2026-10-04")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "83.3");
  expect(screen.getByRole("button", { name: "New goal" })).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Open supporting set" }),
  );
  expect(navigate).toHaveBeenCalledWith({
    view: "training",
    date: "2026-10-04",
    session: "w",
    exercise: "i",
  });
  await userEvent.click(
    screen.getByRole("button", { name: /^Edit goal At least/ }),
  );
  expect(screen.queryByLabelText("Goal type")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Time limit minutes")).toHaveValue(25);
  expect(screen.getByLabelText("Time limit seconds")).toHaveValue(1);
  await userEvent.clear(screen.getByLabelText("Minimum distance (mi)"));
  await userEvent.type(screen.getByLabelText("Minimum distance (mi)"), "6");
  await userEvent.click(screen.getByRole("button", { name: "Save goal" }));
  expect(api.saveExerciseGoal).toHaveBeenCalledWith("run", "combined", {
    target_distance: "6",
    target_duration_seconds: 1501,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("Minimum distance (mi)")).toHaveValue(6);
  expect(screen.getByLabelText("Time limit seconds")).toHaveValue(1);
  expect(screen.queryByLabelText("Target weight (lb)")).not.toBeInTheDocument();
});

it("shows a combined target with no source as zero progress, not a numeric best", async () => {
  vi.mocked(api.getExerciseGoals).mockResolvedValue([
    {
      id: "combined",
      goal_type: "distance_time",
      target_distance: "1.500",
      target_duration_seconds: 59,
      target_weight: null,
      target_reps: null,
      rep_rule: "at_least",
      weight_unit: "kg",
      distance_unit: "km",
      created_at: "",
      achieved: false,
      best_weight: null,
      best_value: null,
      progress_percent: "0.0",
      source: null,
      source_date: null,
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
        date="2026-10-05"
        exercise={
          {
            id: "run",
            tracking_type: "cardio",
            weight_unit: "kg",
            distance_unit: "km",
          } as api.Exercise
        }
        canCreate
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("At least 1.5 km within 59 sec in one set"),
  ).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
  expect(screen.getByText(/No completed set meets/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open supporting set" }),
  ).not.toBeInTheDocument();
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
