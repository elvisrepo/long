import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import * as api from "./workout-api";
import { WorkoutProgress } from "./workout-progress";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());

function mount(
  loads: number[],
  trackingType: api.Exercise["tracking_type"] = "strength",
) {
  const navigate = vi.fn();
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
        tracking_type: trackingType,
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
        navigate={navigate}
      />
    </QueryClientProvider>,
  );
  return navigate;
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
it("offers the strength graph choices and switches to calculated estimated 1RM", async () => {
  mount([60, 90]);
  await screen.findByRole("img");
  const graph = screen.getByLabelText("Graph");
  expect(
    within(graph)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual([
    "Estimated 1RM",
    "Max weight",
    "Max reps",
    "Max volume",
    "Max weight for reps",
    "Workout volume",
    "Workout reps",
    "Personal records",
  ]);
  await userEvent.selectOptions(graph, "estimated_1rm");
  expect(
    screen.getByRole("img", { name: /Estimated 1RM by training date/ }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByText("Daily chart values"));
  expect(
    within(
      screen.getByText("Daily chart values").closest("details")!,
    ).getByText("105 kg", { exact: true }),
  ).toBeInTheDocument();
});
it("explains estimate limits and shows the source weight and reps in point details", async () => {
  mount([70, 80]);
  await screen.findByRole("img");
  await userEvent.selectOptions(
    screen.getByLabelText("Graph"),
    "estimated_1rm",
  );
  expect(
    screen.getByText(/Only positive loads with 1–10 reps are included/),
  ).toHaveTextContent("Higher-rep sets are excluded");
  expect(screen.getByText(/reps left in reserve/)).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Graph point details"),
    "1",
  );
  const details = screen.getByRole("region", {
    name: "Selected training point",
  });
  expect(details).toHaveTextContent("93.333 kg");
  expect(details).toHaveTextContent("Source set: 80 kg × 5 reps");
});
it("filters an exact rep count and offers windowed personal records without a misleading chart", async () => {
  mount([60, 90]);
  await screen.findByRole("img");
  await userEvent.selectOptions(
    screen.getByLabelText("Graph"),
    "max_weight_reps",
  );
  expect(screen.getByLabelText("Rep count")).toHaveValue(5);
  await userEvent.clear(screen.getByLabelText("Rep count"));
  await userEvent.type(screen.getByLabelText("Rep count"), "8");
  expect(
    screen.getByText(
      "No eligible completed sets for this graph at 8 reps in this window.",
    ),
  ).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Graph"),
    "personal_records",
  );
  expect(
    screen.getByRole("heading", {
      name: "Personal records in this window · kg",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("5 reps", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("90 kg", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("shows even a single training point and opens its date from point details", async () => {
  const navigate = mount([70]);
  const chart = await screen.findByRole("img");
  await userEvent.click(chart.querySelector("circle")!);
  const details = screen.getByRole("region", {
    name: "Selected training point",
  });
  expect(details).toHaveTextContent("2026-10-01");
  expect(details).toHaveTextContent("70 kg");
  await userEvent.click(
    within(details).getByRole("button", { name: "View workouts on this date" }),
  );
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-10-01" });
});
it("defaults bodyweight progress to reps and hides unsupported strength calculations", async () => {
  mount([0, 0], "bodyweight");
  await screen.findByRole("img", { name: /Highest logged reps/ });
  expect(screen.getByLabelText("Graph")).toHaveValue("max_reps");
  expect(
    within(screen.getByLabelText("Graph"))
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Max weight", "Max reps", "Workout reps"]);
});
it("loads an explicit 180-day graph window without claiming all-time coverage", async () => {
  mount([60, 90]);
  await screen.findByRole("img");
  await userEvent.selectOptions(
    screen.getByLabelText("Progress window"),
    "180",
  );
  expect(api.getWorkoutRange).toHaveBeenLastCalledWith(
    "2026-04-07",
    "2026-10-03",
    "bench",
  );
  expect(screen.getByText(/not all-time records/)).toBeInTheDocument();
});
it("fits the chart coordinate system to a narrow container so axis text stays readable", async () => {
  const measure = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({ width: 204 } as DOMRect);
  try {
    mount([60, 90]);
    const chart = await screen.findByRole("img");
    expect(chart).toHaveAttribute("viewBox", "0 0 204 190");
    expect(
      within(chart).getByText("1 Oct", { exact: true }),
    ).toBeInTheDocument();
    for (const point of chart.querySelectorAll("circle"))
      expect(Number(point.getAttribute("cx"))).toBeLessThanOrEqual(184);
  } finally {
    measure.mockRestore();
  }
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
