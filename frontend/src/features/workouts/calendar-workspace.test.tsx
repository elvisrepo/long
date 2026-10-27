import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutCalendar } from "./workout-calendar";
import { WorkoutReadContent } from "./workout-read-content";
import { WorkoutScreen } from "./workout-screen";
vi.mock("./workout-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "calendar@example.test" } }),
}));
const base: api.WorkoutExercise = {
  id: "i",
  exercise_id: "bench",
  exercise_name: "Bench",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [
    {
      id: "s",
      weight: "100.000",
      reps: 5,
      distance: null,
      duration_seconds: null,
      is_completed: true,
      comment: "Steady",
      display_order: 10,
    },
  ],
};
const workouts: api.Workout[] = [
  {
    id: "w1",
    name: "Push",
    performed_on: "2026-02-15",
    notes: "",
    created_at: "",
    is_finished: false,
    completed_set_count: 2,
    exercises: [
      base,
      {
        ...base,
        id: "dip",
        exercise_id: "dip",
        exercise_name: "Triceps dip",
        category_name: "Triceps",
      },
    ],
  },
  {
    id: "w2",
    name: "Legs",
    performed_on: "2026-02-17",
    notes: "",
    created_at: "",
    is_finished: false,
    completed_set_count: 1,
    exercises: [
      {
        ...base,
        id: "squat",
        exercise_id: "squat",
        exercise_name: "Squat",
        category_name: "Legs",
      },
    ],
  },
  {
    id: "w3",
    name: "Plan",
    performed_on: "2026-02-18",
    notes: "",
    created_at: "",
    is_finished: false,
    completed_set_count: 0,
    exercises: [
      {
        ...base,
        sets: base.sets.map((row) => ({ ...row, is_completed: false })),
      },
    ],
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.getWorkoutRange).mockImplementation(async (from, to) =>
    workouts.filter(
      (row) => row.performed_on >= from && row.performed_on <= to,
    ),
  );
  vi.mocked(api.getWorkout).mockImplementation(
    async (id) => workouts.find((row) => row.id === id)!,
  );
  vi.mocked(api.getWorkoutCatalog).mockResolvedValue({
    categories: [],
    exercises: [],
  });
});
afterEach(() => vi.unstubAllGlobals());
function mount(options: { owner?: string; screen?: boolean } = {}) {
  const navigate = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      {options.screen ? (
        <WorkoutScreen
          search={{ view: "calendar", date: "2026-02-15" }}
          onNavigate={navigate}
        />
      ) : (
        <WorkoutCalendar
          owner={options.owner ?? "owner"}
          date="2026-02-15"
          busy={false}
          navigate={navigate}
        />
      )}
    </QueryClientProvider>,
  );
  return { ...view, navigate };
}
it("puts the calendar before optional controls and removes the duplicate page/date preamble", async () => {
  mount({ screen: true });
  await screen.findByRole("button", {
    name: "2026-02-15: 1 training session, 0 planned sessions",
  });
  expect(screen.queryByLabelText("Tracking date")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "Calendar exercise" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Calendar filters" }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Choices come from this month/),
  ).not.toBeInTheDocument();
});
it("shares filters between Month and List and previews the full workout", async () => {
  const { navigate } = mount();
  await screen.findByRole("button", { name: "Calendar filters" });
  await userEvent.click(
    screen.getByRole("button", { name: "Calendar filters" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Chest", exact: true }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await userEvent.click(screen.getByRole("button", { name: "List view" }));
  expect(
    screen.queryByRole("button", { name: /Preview Legs on/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview Push on 2026-02-15" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    await within(dialog).findByRole("button", { name: /Triceps dip/ }),
  ).toBeVisible();
  expect(navigate).not.toHaveBeenCalled();
  expect(api.createWorkout).not.toHaveBeenCalled();
});
it("moves between matching days in the popup and only navigates Home explicitly", async () => {
  const { navigate } = mount();
  await screen.findByRole("button", {
    name: "2026-02-17: 1 training session, 0 planned sessions",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Next matching workout day" }),
  );
  let dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Tue, 17 Feb 2026");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Next matching workout day" }),
  );
  dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Wed, 18 Feb 2026");
  expect(navigate).not.toHaveBeenCalled();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Go to workout" }),
  );
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-02-18" });
});
it("uses the optional panel on wide screens and keeps phones on the popup", async () => {
  localStorage.setItem(
    "longevity:calendar:owner",
    JSON.stringify({ panel: true }),
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const first = mount();
  await screen.findByRole("complementary", {
    name: "Selected workout details",
  });
  await userEvent.click(
    screen.getByRole("button", {
      name: "2026-02-17: 1 training session, 0 planned sessions",
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    await within(screen.getByRole("complementary")).findByRole("button", {
      name: /Squat/,
    }),
  ).toBeVisible();
  expect(first.navigate).not.toHaveBeenCalled();
  first.unmount();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mount();
  await screen.findByRole("button", {
    name: "2026-02-17: 1 training session, 0 planned sessions",
  });
  await userEvent.click(
    screen.getByRole("button", {
      name: "2026-02-17: 1 training session, 0 planned sessions",
    }),
  );
  expect(screen.getByRole("dialog")).toBeVisible();
});
it("remembers display choices per owner without persisting data filters", async () => {
  const first = mount();
  await screen.findByRole("button", { name: "List view" });
  await userEvent.click(screen.getByRole("button", { name: "List view" }));
  first.unmount();
  const second = mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  second.unmount();
  mount({ owner: "another" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Month view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
});

it("keeps an explicit empty-date message in read-only previews", () => {
  render(
    <WorkoutReadContent workouts={[]} date="2026-02-15" navigate={vi.fn()} />,
  );
  expect(screen.getByText("No workouts on this date.")).toBeVisible();
});
