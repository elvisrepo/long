import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ExerciseRecords } from "./exercise-records";
import * as api from "./workout-api";
vi.mock("./workout-api");
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
const page = <T,>(results: T[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});
function mount() {
  const onGraph = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExerciseRecords
        owner="owner"
        date="2026-10-22"
        exerciseId="bench"
        navigate={vi.fn()}
        onGraph={onGraph}
      />
    </QueryClientProvider>,
  );
  return onGraph;
}
it("labels superseded records as inferred and opens the observed source rep history", async () => {
  const rows = [4, 5].map((reps) => ({
    date: "2026-10-01",
    value: reps === 4 ? "40" : "50",
    reps,
    tracking_type: "strength" as const,
    weight_unit: "kg" as const,
    distance_unit: "km" as const,
    source: {
      workout_id: "w",
      item_id: "i",
      set_id: `s${reps}`,
      weight: reps === 4 ? "40" : "50",
      reps,
    },
  }));
  vi.mocked(api.getRecordPage).mockImplementation(
    async (_exercise, _date, _offset, filter) =>
      page(filter ? rows.filter((row) => row.reps === filter.reps) : rows),
  );
  const onGraph = mount();
  const inferred = await screen.findByRole("button", {
    name: "4RM inferred: 50 kg",
  });
  expect(
    screen.getByRole("button", { name: "Observed: 40 kg" }),
  ).toBeInTheDocument();
  await userEvent.click(inferred);
  expect(
    screen.getByRole("dialog", { name: "PR history · 5 reps · kg" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Graph", exact: true }),
  );
  expect(onGraph).toHaveBeenCalledWith(5);
});
it("shows fifteen estimated RMs and persists the chosen rep limit", async () => {
  vi.mocked(api.getRecordPage).mockResolvedValue(page([]));
  vi.mocked(api.getProgressPage).mockResolvedValue(
    page([
      {
        date: "2026-10-01",
        value: "116.667",
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
    ]),
  );
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Estimated", exact: true }),
  );
  expect(await screen.findByText("116.7 kg")).toBeInTheDocument();
  expect(screen.getByText("15RM")).toBeInTheDocument();
  await userEvent.click(screen.getByText("Estimate settings"));
  await userEvent.selectOptions(
    screen.getByLabelText("Estimated 1RM rep limit"),
    "12",
  );
  expect(localStorage.getItem("longevity-estimate-rep-limit:bench")).toBe("12");
  expect(api.getProgressPage).toHaveBeenLastCalledWith(
    "bench",
    "2026-10-22",
    "estimated_1rm",
    5,
    0,
    { repLimit: 12, perWorkout: true },
  );
});

it("lets an equal load at higher reps supersede a lower-rep observed record", async () => {
  const rows = [4, 5].map((reps) => ({
    date: "2026-10-01",
    value: "50",
    reps,
    tracking_type: "strength" as const,
    weight_unit: "kg" as const,
    distance_unit: "km" as const,
    source: {
      workout_id: "w",
      item_id: "i",
      set_id: `s${reps}`,
      weight: "50",
      reps,
    },
  }));
  vi.mocked(api.getRecordPage).mockResolvedValue(page(rows));
  mount();
  expect(
    await screen.findByRole("button", { name: "4RM inferred: 50 kg" }),
  ).toHaveTextContent("Inferred from 5 reps");
  expect(
    screen.getByRole("button", { name: "Observed: 50 kg" }),
  ).toBeInTheDocument();
});
