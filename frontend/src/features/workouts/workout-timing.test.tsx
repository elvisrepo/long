import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkoutTiming } from "./workout-timing";
import { elapsedWorkoutSeconds } from "./workout-timing-format";
import type { Workout } from "./workout-api";
import * as api from "./workout-api";
vi.mock("./workout-api");
const workout: Workout = {
  id: "w",
  name: "Workout",
  performed_on: "2026-10-03",
  notes: "",
  is_finished: false,
  created_at: "",
  completed_set_count: 0,
  exercises: [],
  duration_seconds: null,
  timer_started_at: null,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("shows untracked time and only starts on explicit request", async () => {
  const user = userEvent.setup();
  const run = vi.fn((action: () => Promise<void>) => void action());
  vi.mocked(api.updateWorkout).mockResolvedValue(workout);
  render(<WorkoutTiming workout={workout} busy={false} run={run} />);
  expect(screen.getByRole("timer")).toHaveTextContent("Not tracked");
  expect(run).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Start timer" }));
  expect(api.updateWorkout).toHaveBeenCalledWith("w", {
    timer_action: "start",
  });
});

it("rebuilds elapsed time from the server snapshot, unaffected by client clock offset", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  const running = {
    ...workout,
    duration_seconds: 30,
    timer_started_at: "2026-10-03T12:00:00Z",
    timer_server_now: "2026-10-03T12:01:00Z",
    elapsed_seconds: 90,
  };
  const view = render(
    <WorkoutTiming workout={running} busy={false} run={vi.fn()} />,
  );
  expect(screen.getByRole("timer")).toHaveTextContent("00:01:30");
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByRole("timer")).toHaveTextContent("00:01:35");
  view.unmount();
  render(
    <WorkoutTiming
      workout={{
        ...running,
        timer_server_now: "2026-10-03T12:02:00Z",
        elapsed_seconds: 150,
      }}
      busy={false}
      run={vi.fn()}
    />,
  );
  expect(screen.getByRole("timer")).toHaveTextContent("00:02:30");
});

it("corrects finished sessions explicitly and clears without starting", async () => {
  const user = userEvent.setup();
  vi.mocked(api.updateWorkout).mockResolvedValue(workout);
  render(
    <WorkoutTiming
      workout={{
        ...workout,
        is_finished: true,
        duration_seconds: 90,
        elapsed_seconds: 90,
      }}
      busy={false}
      run={(action) => void action()}
    />,
  );
  expect(screen.getByRole("button", { name: "Resume timer" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Correct duration" }));
  await user.clear(screen.getByLabelText("Workout hours"));
  await user.type(screen.getByLabelText("Workout hours"), "1");
  await user.click(screen.getByRole("button", { name: "Save duration" }));
  await waitFor(() =>
    expect(api.updateWorkout).toHaveBeenCalledWith("w", {
      duration_seconds: 3690,
    }),
  );
  await user.click(screen.getByRole("button", { name: "Correct duration" }));
  await user.click(screen.getByRole("button", { name: "Clear duration" }));
  await waitFor(() =>
    expect(api.updateWorkout).toHaveBeenCalledWith("w", {
      duration_seconds: null,
    }),
  );
});

it("retains server-confirmed state on a failed pause and locks pending actions", async () => {
  const user = userEvent.setup();
  vi.mocked(api.updateWorkout).mockRejectedValue(new Error("Offline"));
  const running = {
    ...workout,
    duration_seconds: 0,
    timer_started_at: "2026-10-03T12:00:00Z",
    timer_server_now: "2026-10-03T12:01:00Z",
  };
  const view = render(
    <WorkoutTiming
      workout={running}
      busy={false}
      run={(action) => void action()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Pause timer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh");
  expect(
    screen.getByRole("button", { name: "Pause timer" }),
  ).toBeInTheDocument();
  view.rerender(<WorkoutTiming workout={running} busy={true} run={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Pause timer" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Correct duration" }),
  ).toBeDisabled();
});

it("clamps running time and never subtracts after clock rollback", () => {
  const running = {
    ...workout,
    duration_seconds: 30,
    timer_started_at: "2026-10-03T12:00:00Z",
  };
  expect(
    elapsedWorkoutSeconds(running, Date.parse("2026-10-03T11:59:00Z")),
  ).toBe(30);
  expect(
    elapsedWorkoutSeconds(running, Date.parse("2026-11-03T12:00:00Z")),
  ).toBe(604800);
  expect(
    elapsedWorkoutSeconds(
      { ...running, is_finished: true },
      Date.parse("2026-11-03T12:00:00Z"),
    ),
  ).toBe(30);
});
