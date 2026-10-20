import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardDailyTrackers } from "./dashboard-daily-trackers";
import { getDietEntries } from "../features/diet/diet-api";
import { getRecoveryEntries } from "../features/recovery/recovery-api";
import { getStretchEntries } from "../features/stretching/stretching-api";
import { getWorkoutRange } from "../features/workouts/workout-api";

vi.mock("../features/diet/diet-api");
vi.mock("../features/recovery/recovery-api");
vi.mock("../features/stretching/stretching-api");
vi.mock("../features/workouts/workout-api");
vi.mock("../features/auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-10-20T12:00:00"));
  vi.mocked(getDietEntries).mockResolvedValue([]);
  vi.mocked(getRecoveryEntries).mockResolvedValue([]);
  vi.mocked(getStretchEntries).mockResolvedValue([]);
  vi.mocked(getWorkoutRange).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DashboardDailyTrackers />
    </QueryClientProvider>,
  );
}
it("groups all four trackers with today's counts and links in one block", async () => {
  mount();
  const block = screen.getByRole("region", { name: "Today's logs" });
  for (const [name, href, count] of [
    ["Diet", "/diet", "0 foods today"],
    ["Stretching", "/stretching", "0 stretches logged today"],
    ["Recovery", "/recovery", "0 activities today"],
    ["Workouts", "/workouts", "0 completed sets today"],
  ]) {
    const row = within(block).getByRole("link", { name: new RegExp(name) });
    expect(row).toHaveAttribute("href", href);
    expect(await within(row).findByText(count)).toBeInTheDocument();
  }
  expect(
    within(block).getByText(
      "Logs show what you recorded, not completion targets.",
    ),
  ).toBeInTheDocument();
});

it("counts stretching days once and counts completed sets from unfinished workouts", async () => {
  vi.mocked(getStretchEntries).mockResolvedValue([
    { id: 1, exercise_id: "a", performed_on: "2026-10-20", created_at: "" },
    { id: 2, exercise_id: "b", performed_on: "2026-10-20", created_at: "" },
    { id: 3, exercise_id: "a", performed_on: "2026-10-19", created_at: "" },
  ]);
  const workout = {
    id: "a",
    performed_on: "2026-10-20",
    name: "",
    notes: "",
    created_at: "",
    is_finished: false,
    completed_set_count: 3,
    exercises: [],
  };
  vi.mocked(getWorkoutRange).mockResolvedValue([
    workout,
    { ...workout, id: "b", completed_set_count: 2 },
    { ...workout, id: "c", performed_on: "2026-10-19", completed_set_count: 0 },
  ]);
  mount();
  const stretching = screen.getByRole("link", { name: /Stretching/ });
  expect(
    await within(stretching).findByText("2 stretches logged today"),
  ).toBeInTheDocument();
  expect(
    within(stretching).getByText("2 of 7 days recorded"),
  ).toBeInTheDocument();
  const workouts = screen.getByRole("link", { name: /Workouts/ });
  expect(
    await within(workouts).findByText("5 completed sets today"),
  ).toBeInTheDocument();
  expect(within(workouts).getByText("1 of 7 days trained")).toBeInTheDocument();
  expect(getStretchEntries).toHaveBeenCalledWith("2026-10-14", "2026-10-20");
});
it("keeps other tracker summaries usable when one fails, without displaying a false zero", async () => {
  vi.mocked(getStretchEntries).mockRejectedValue(new Error("offline"));
  mount();
  const stretching = screen.getByRole("link", { name: /Stretching/ });
  expect(
    await within(stretching).findByText(
      "Stretching couldn't load. Open Stretching to retry.",
    ),
  ).toHaveAttribute("role", "status");
  expect(
    within(stretching).queryByText("0 stretches logged today"),
  ).not.toBeInTheDocument();
  expect(await screen.findByText("0 foods today")).toBeInTheDocument();
});
