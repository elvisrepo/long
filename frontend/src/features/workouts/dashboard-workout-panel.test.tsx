import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardWorkoutPanel } from "./dashboard-workout-panel";
import { getWorkoutRange, type Workout } from "./workout-api";
vi.mock("./workout-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DashboardWorkoutPanel />
    </QueryClientProvider>,
  );
}
it("counts completed sets and distinct training days, excluding planned-only sessions", async () => {
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  const base: Workout = {
    id: "w",
    performed_on: "2026-10-02",
    name: "Workout",
    notes: "",
    created_at: "",
    is_finished: false,
    completed_set_count: 0,
    exercises: [],
  };
  vi.mocked(getWorkoutRange).mockResolvedValue([
    base,
    { ...base, id: "a", completed_set_count: 3 },
    { ...base, id: "b", completed_set_count: 2 },
    { ...base, id: "c", performed_on: "2026-10-01", completed_set_count: 1 },
    { ...base, id: "d", performed_on: "2026-09-30" },
  ]);
  mount();
  expect(await screen.findByText("5 completed sets today")).toBeInTheDocument();
  expect(screen.getByText("2 of 7 days trained")).toBeInTheDocument();
  expect(getWorkoutRange).toHaveBeenCalledWith("2026-09-26", "2026-10-02");
  expect(
    screen.getByRole("link", { name: "Track workouts →" }),
  ).toHaveAttribute("href", "/workouts");
});
it("does not describe failed history as zero activity", async () => {
  vi.mocked(getWorkoutRange).mockRejectedValue(new Error("offline"));
  mount();
  expect(
    await screen.findByText("Workouts couldn't load. Open Workouts to retry."),
  ).toBeInTheDocument();
  expect(screen.queryByText("0 completed sets today")).not.toBeInTheDocument();
});
