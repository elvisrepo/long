import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ExerciseStatistics } from "./exercise-statistics";
import * as api from "./workout-api";
vi.mock("./workout-api");
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
it("filters statistics to the selected calendar month and previews dated bests", async () => {
  vi.mocked(api.getExerciseStats).mockResolvedValue({
    exercise_id: "bench",
    date_to: "2026-10-22",
    groups: [
      {
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        session_count: 2,
        set_count: 3,
        reps_total: 15,
        volume_total: "1500",
        distance_total: null,
        duration_seconds_total: null,
        first_date: "2026-10-01",
        last_date: "2026-10-22",
        bests: {
          max_weight: {
            date: "2026-10-01",
            value: "100",
            tracking_type: "strength",
            weight_unit: "kg",
            distance_unit: "km",
            source: {
              workout_id: "w",
              item_id: "i",
              set_id: "s",
              weight: "100",
              reps: 5,
            },
          },
        },
      },
    ],
  });
  vi.mocked(api.getWorkout).mockResolvedValue({
    id: "w",
    performed_on: "2026-10-01",
    name: "Workout",
    notes: "",
    is_finished: false,
    created_at: "",
    completed_set_count: 1,
    exercises: [],
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseStatistics
        owner="owner"
        date="2026-10-22"
        exerciseId="bench"
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await screen.findByText("1500 kg·reps");
  await userEvent.selectOptions(screen.getByLabelText("Period"), "month");
  await waitFor(() =>
    expect(api.getExerciseStats).toHaveBeenLastCalledWith(
      "bench",
      "2026-10-22",
      { date_from: "2026-10-01" },
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Max weight.*100 kg.*2026-10-01/ }),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(api.getWorkout).toHaveBeenCalledWith("w");
  expect(api.createWorkout).not.toHaveBeenCalled();
});
