import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import * as api from "./workout-api";
import { ExerciseGoals } from "./exercise-goals";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
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
