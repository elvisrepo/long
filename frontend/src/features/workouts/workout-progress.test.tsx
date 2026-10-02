import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutProgress } from "./workout-progress";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());

function mount(loads: number[]) {
  const workouts = loads.map((weight, i) => ({
    id: `w${i}`,
    performed_on: `2026-10-0${i + 1}`,
    name: "Workout",
    notes: "",
    is_finished: false,
    created_at: "",
    completed_set_count: 1,
    exercises: [
      {
        id: `i${i}`,
        exercise_id: "bench",
        exercise_name: "Bench",
        category_name: "Chest",
        tracking_type: "strength" as const,
        weight_unit: "kg" as const,
        distance_unit: "km" as const,
        display_order: 10,
        sets: [
          {
            id: `s${i}`,
            display_order: 10,
            weight: String(weight),
            reps: 5,
            distance: null,
            duration_seconds: null,
            comment: "",
            is_completed: true,
          },
        ],
      },
    ],
  }));
  vi.mocked(api.getWorkoutRange).mockResolvedValue(workouts);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutProgress
        owner="owner"
        date="2026-10-03"
        exerciseId="bench"
        catalog={{ categories: [], exercises: [] }}
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

it("labels the weight axis from zero through 80 kg in 10 kg increments", async () => {
  mount([70, 75, 80]);
  const chart = await screen.findByRole("img", {
    name: /Highest logged load by training date/,
  });
  for (let weight = 0; weight <= 80; weight += 10)
    expect(
      within(chart).getByText(`${weight} kg`, { exact: true }),
    ).toBeInTheDocument();
});

it.each([
  [[0, 0], "0 kg"],
  [[0.125, 0.25], "0.05 kg"],
  [[7500, 8000], "1,000 kg"],
] as const)(
  "keeps a finite labelled scale for loads %j",
  async (loads, label) => {
    mount([...loads]);
    const chart = await screen.findByRole("img", {
      name: /Highest logged load by training date/,
    });
    expect(within(chart).getByText(label, { exact: true })).toBeInTheDocument();
    expect(chart.querySelectorAll("g text").length).toBeLessThanOrEqual(9);
    expect(chart.outerHTML).not.toMatch(/NaN|Infinity/);
    for (const point of chart.querySelectorAll("circle")) {
      const y = Number(point.getAttribute("cy"));
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(160);
    }
  },
);
