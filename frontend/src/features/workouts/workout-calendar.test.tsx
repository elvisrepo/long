import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutCalendar } from "./workout-calendar";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());

it("retains filters and their saved labels across months without changing the selection silently", async () => {
  vi.mocked(api.getWorkoutRange)
    .mockResolvedValueOnce([
      {
        id: "w",
        performed_on: "2026-02-15",
        completed_set_count: 0,
        exercises: [
          {
            exercise_id: "bench",
            exercise_name: "Old bench name",
            category_name: "Old chest name",
            sets: [],
          },
        ],
      },
    ] as unknown as api.Workout[])
    .mockResolvedValueOnce([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const navigate = vi.fn();
  const view = (date: string, busy = false) => (
    <QueryClientProvider client={client}>
      <WorkoutCalendar
        owner="owner"
        date={date}
        busy={busy}
        navigate={navigate}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view("2026-02-15"));
  await screen.findByRole("button", {
    name: "2026-02-15: 0 training sessions, 1 planned session",
  });
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar exercise"),
    "bench",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar category"),
    "Old chest name",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar status"),
    "planned",
  );
  await userEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(navigate).toHaveBeenCalledWith({
    view: "calendar",
    date: "2026-03-01",
  });
  rerender(view("2026-03-01"));
  expect(
    await screen.findByText("No workouts match these filters in this month."),
  ).toBeVisible();
  expect(screen.getByLabelText("Calendar exercise")).toHaveValue("bench");
  expect(
    screen.getByRole("option", { name: "Old bench name" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Calendar category")).toHaveValue(
    "Old chest name",
  );
  expect(screen.getByLabelText("Calendar status")).toHaveValue("planned");
  expect(api.getWorkoutRange).toHaveBeenLastCalledWith(
    "2026-03-01",
    "2026-03-31",
  );
  rerender(view("2026-03-01", true));
  expect(screen.getByLabelText("Calendar exercise")).toBeDisabled();
  expect(screen.getByLabelText("Calendar category")).toBeDisabled();
  expect(screen.getByLabelText("Calendar status")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled();
});

it("locks filters while loading and shows read errors instead of inventing no matches", async () => {
  let fail!: (reason: Error) => void;
  vi.mocked(api.getWorkoutRange)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValueOnce([]);
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
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("Calendar status")).toBeDisabled();
  await waitFor(() => expect(fail).toBeDefined());
  fail(new Error("Offline"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Month couldn't load",
  );
  expect(
    screen.queryByText("No workouts match these filters in this month."),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry month" }));
  expect(
    await screen.findByText("0 matching sessions in this month."),
  ).toBeVisible();
});

it("combines filters on the same occurrence and counts matching training rather than unrelated sets", async () => {
  const entry = (exercise: string, category: string, completed: boolean) => ({
    exercise_id: exercise,
    exercise_name: exercise,
    category_name: category,
    sets: [{ is_completed: completed }],
  });
  vi.mocked(api.getWorkoutRange).mockResolvedValue([
    {
      id: "mixed",
      performed_on: "2026-02-15",
      completed_set_count: 1,
      exercises: [entry("Bench", "Chest", false), entry("Squat", "Legs", true)],
    },
    {
      id: "bench",
      performed_on: "2026-02-16",
      completed_set_count: 2,
      exercises: [entry("Bench", "Chest", true), entry("Bench", "Chest", true)],
    },
  ] as unknown as api.Workout[]);
  const navigate = vi.fn();
  const renderDay = vi.fn((sessions: api.Workout[]) => (
    <p>Matching: {sessions.map((w) => w.id).join(",")}</p>
  ));
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
        renderSelectedDay={renderDay}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", {
    name: "2026-02-15: 1 training session, 0 planned sessions",
  });
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar exercise"),
    "Bench",
  );
  expect(
    screen.getByRole("button", {
      name: "2026-02-15: 0 training sessions, 1 planned session",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "2026-02-16: 1 training session, 0 planned sessions",
    }),
  ).toBeVisible();
  expect(renderDay.mock.calls.at(-1)![0][0].exercises).toHaveLength(2);
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar status"),
    "planned",
  );
  expect(renderDay.mock.calls.at(-1)![0][0].exercises).toHaveLength(2);
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar status"),
    "training",
  );
  expect(
    screen.getByRole("button", {
      name: "2026-02-15: 0 training sessions, 0 planned sessions",
    }),
  ).toBeVisible();
  expect(screen.getByText("Matching:")).toBeVisible();
  await userEvent.selectOptions(
    screen.getByLabelText("Calendar category"),
    "Legs",
  );
  expect(
    screen.getByText("No workouts match these filters in this month."),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByText("Matching: mixed")).toBeVisible();
  expect(navigate).not.toHaveBeenCalled();
  expect(api.createWorkout).not.toHaveBeenCalled();
  expect(api.copyWorkout).not.toHaveBeenCalled();
});
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
