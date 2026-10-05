import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import * as api from "./workout-api";
import { WorkoutOverview } from "./workout-overview";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
it("shows separate completed statistics and navigates to training dates without writes", async () => {
  vi.mocked(api.getExerciseStats).mockResolvedValue({
    exercise_id: "bench",
    date_to: "2026-10-02",
    groups: [
      {
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        session_count: 2,
        set_count: 3,
        reps_total: 14,
        volume_total: "1070.000",
        distance_total: null,
        duration_seconds_total: null,
        first_date: "2023-01-01",
        last_date: "2026-10-01",
      },
    ],
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutOverview
        owner="owner"
        date="2026-10-02"
        exerciseId="bench"
        catalog={{
          categories: [],
          exercises: [
            {
              id: "bench",
              name: "Bench",
              tracking_type: "strength",
            } as api.Exercise,
          ],
        }}
        navigate={navigate}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("1070 kg·reps")).toBeInTheDocument();
  expect(screen.getByText("14")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "First training: 2023-01-01" }),
  );
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2023-01-01" });
  expect(api.createWorkout).not.toHaveBeenCalled();
});

it("keeps history inside the overview and shows only the selected exercise", async () => {
  vi.mocked(api.getExerciseStats).mockResolvedValue({
    exercise_id: "bench",
    date_to: "2026-10-02",
    groups: [],
  });
  vi.mocked(api.getWorkoutPage).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        id: "workout",
        performed_on: "2026-10-01",
        name: "Push",
        exercises: [
          {
            id: "item",
            exercise_id: "bench",
            exercise_name: "Bench",
            tracking_type: "strength",
            weight_unit: "kg",
            distance_unit: "km",
            sets: [
              {
                id: "set",
                weight: "70",
                reps: 5,
                is_completed: true,
                comment: "Good form",
              },
            ],
          },
          {
            id: "other",
            exercise_id: "squat",
            exercise_name: "Squat",
            sets: [],
          },
        ],
      } as api.Workout,
    ],
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutOverview
        owner="owner"
        date="2026-10-02"
        exerciseId="bench"
        catalog={{
          categories: [],
          exercises: [
            {
              id: "bench",
              name: "Bench",
              tracking_type: "strength",
            } as api.Exercise,
          ],
        }}
        navigate={navigate}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "History", exact: true }),
  );
  expect(
    await screen.findByText("70 kg · 5 reps · Completed"),
  ).toBeInTheDocument();
  expect(screen.getByText("Good form")).toBeInTheDocument();
  expect(screen.queryByText("Squat")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Edit multiple sets" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Edit multiple sets" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: /Squat/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.bulkUpdateSets).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Open exercise", exact: true }),
  );
  expect(navigate).toHaveBeenCalledWith({
    view: "training",
    date: "2026-10-01",
    session: "workout",
    exercise: "item",
  });
});

it.each(["strength", "cardio"] as const)(
  "opens all-time records for %s without a blank selector or raw workout reads",
  async (trackingType) => {
    vi.mocked(api.getExerciseStats).mockResolvedValue({
      exercise_id: "bench",
      date_to: "2026-10-02",
      groups: [],
    });
    vi.mocked(api.getRecordPage).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <WorkoutOverview
          owner="owner"
          date="2026-10-02"
          exerciseId="bench"
          catalog={{
            categories: [],
            exercises: [
              {
                id: "bench",
                name: "Bench",
                tracking_type: trackingType,
                is_active: true,
              } as api.Exercise,
            ],
          }}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Records", exact: true }),
    );
    expect(await screen.findByLabelText("Graph")).toHaveValue(
      "personal_records",
    );
    expect(screen.getByLabelText("Progress window")).toHaveValue("0");
    expect(api.getWorkoutRange).not.toHaveBeenCalled();
  },
);
