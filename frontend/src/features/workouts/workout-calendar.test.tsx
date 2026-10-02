import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutCalendar } from "./workout-calendar";

vi.mock("./workout-api");
it("reads only the displayed month and distinguishes completed training from plans", async () => {
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    {
      id: "w",
      performed_on: "2026-02-15",
      completed_set_count: 2,
      exercises: [],
    },
    {
      id: "p",
      performed_on: "2026-02-16",
      completed_set_count: 0,
      exercises: [],
    },
  ] as unknown as api.Workout[]);
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutCalendar
        owner="owner"
        date="2026-02-15"
        busy={false}
        navigate={navigate}
      />
    </QueryClientProvider>,
  );
  const button = await screen.findByRole("button", {
    name: "2026-02-15: 1 training session, 0 planned sessions",
  });
  expect(api.getWorkoutRange).toHaveBeenCalledWith("2026-02-01", "2026-02-28");
  expect(
    screen.getByRole("button", {
      name: "2026-02-16: 0 training sessions, 1 planned session",
    }),
  ).toBeInTheDocument();
  await userEvent.click(button);
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-02-15" });
});
