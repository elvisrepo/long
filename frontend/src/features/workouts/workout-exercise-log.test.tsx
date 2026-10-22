import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkoutExerciseLog } from "./workout-exercise-log";
import * as api from "./workout-api";
vi.mock("./workout-api");
const workout: api.Workout = {
  id: "w",
  name: "Workout",
  performed_on: "2026-10-22",
  notes: "",
  is_finished: false,
  created_at: "",
  completed_set_count: 0,
  exercises: ["Bench", "Row", "Press"].map((name, index) => ({
    id: `e${index}`,
    exercise_id: `l${index}`,
    exercise_name: name,
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    display_order: index,
    sets: [],
  })),
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
it("long press selects without opening the editor or deleting; normal taps extend selection", async () => {
  vi.useFakeTimers();
  const open = vi.fn();
  render(
    <WorkoutExerciseLog
      workout={workout}
      busy={false}
      run={(action) => void action()}
      onOpen={open}
    />,
  );
  const bench = screen.getByRole("button", { name: "Open Bench" });
  fireEvent.pointerDown(bench, { pointerId: 1, clientX: 10, clientY: 10 });
  act(() => vi.advanceTimersByTime(550));
  fireEvent.pointerUp(bench, { pointerId: 1 });
  fireEvent.click(bench);
  expect(
    screen.getByRole("toolbar", { name: "Selected exercises" }),
  ).toHaveTextContent("1 exercise selected");
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Select Row" }));
  expect(
    screen.getByRole("toolbar", { name: "Selected exercises" }),
  ).toHaveTextContent("2 exercises selected");
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
});

it("confirms a multi-exercise deletion once and retains selection after a failed request", async () => {
  const user = userEvent.setup();
  vi.mocked(api.actOnWorkoutExercises)
    .mockRejectedValueOnce(new Error("Deletion failed"))
    .mockResolvedValue(workout);
  render(
    <WorkoutExerciseLog
      workout={workout}
      busy={false}
      selecting
      run={(action) => void action()}
      onOpen={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Select all" }));
  await user.click(screen.getByRole("button", { name: "Delete selected" }));
  expect(api.actOnWorkoutExercises).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Confirm exercise deletion" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Deletion failed");
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Confirm exercise deletion" }),
  );
  expect(api.actOnWorkoutExercises).toHaveBeenLastCalledWith("w", {
    action: "delete",
    exercise_ids: ["e0", "e1", "e2"],
  });
});

it("reorders using keyboard handles with the original complete order", async () => {
  const user = userEvent.setup();
  vi.mocked(api.actOnWorkoutExercises).mockResolvedValue(workout);
  render(
    <WorkoutExerciseLog
      workout={workout}
      busy={false}
      selecting
      run={(action) => void action()}
      onOpen={vi.fn()}
    />,
  );
  screen.getByRole("button", { name: "Reorder Row" }).focus();
  await user.keyboard("{ArrowUp}");
  expect(api.actOnWorkoutExercises).toHaveBeenCalledWith("w", {
    action: "reorder",
    exercise_ids: ["e1", "e0", "e2"],
    expected_order: ["e0", "e1", "e2"],
  });
});

it("pointer cancellation does not select and finished workouts cannot enter selection", () => {
  vi.useFakeTimers();
  const view = render(
    <WorkoutExerciseLog
      workout={workout}
      busy={false}
      run={(action) => void action()}
      onOpen={vi.fn()}
    />,
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: "Open Bench" }));
  fireEvent.pointerCancel(screen.getByRole("button", { name: "Open Bench" }));
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  view.rerender(
    <WorkoutExerciseLog
      workout={{ ...workout, is_finished: true }}
      busy={false}
      run={(action) => void action()}
      onOpen={vi.fn()}
    />,
  );
  fireEvent.contextMenu(screen.getByRole("button", { name: "Open Bench" }));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
});

it("previews uneven-height card movement without saving and restores positions on cancellation", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  try {
    const view = render(
      <WorkoutExerciseLog
        workout={workout}
        busy={false}
        selecting
        run={(action) => void action()}
        onOpen={vi.fn()}
      />,
    );
    const cards = Array.from(
      view.container.querySelectorAll<HTMLElement>("[data-exercise-id]"),
    );
    const boxes = [
      { top: 100, height: 100 },
      { top: 212, height: 60 },
      { top: 284, height: 180 },
    ];
    cards.forEach((card, index) =>
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
        ...boxes[index],
        bottom: boxes[index].top + boxes[index].height,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: boxes[index].top,
        toJSON: () => ({}),
      }),
    );
    const handle = screen.getByRole("button", { name: "Reorder Bench" });
    const calls = vi.mocked(api.actOnWorkoutExercises).mock.calls.length;
    fireEvent.pointerDown(handle, { clientY: 120, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 260 });
    expect(cards[0].style.transform).toContain("140px");
    expect(cards[1].style.transform).toContain("-112px");
    expect(api.actOnWorkoutExercises).toHaveBeenCalledTimes(calls);
    fireEvent.pointerCancel(handle);
    expect(cards[0].style.transform).toBe("");
    expect(cards[1].style.transform).toBe("");
    expect(api.actOnWorkoutExercises).toHaveBeenCalledTimes(calls);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it("rolls a failed drag back without changing the saved order", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(api.actOnWorkoutExercises).mockRejectedValueOnce(
    new Error("Order changed"),
  );
  try {
    const view = render(
      <WorkoutExerciseLog
        workout={workout}
        busy={false}
        selecting
        run={(action) => void action()}
        onOpen={vi.fn()}
      />,
    );
    const cards = Array.from(
      view.container.querySelectorAll<HTMLElement>("[data-exercise-id]"),
    );
    cards.forEach((card, index) =>
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
        top: 100 + index * 112,
        height: 100,
        bottom: 200 + index * 112,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: 100 + index * 112,
        toJSON: () => ({}),
      }),
    );
    const handle = screen.getByRole("button", { name: "Reorder Bench" });
    fireEvent.pointerDown(handle, { clientY: 120, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 250 });
    fireEvent.pointerUp(handle);
    expect(await screen.findByRole("alert")).toHaveTextContent("Order changed");
    await waitFor(() => expect(cards[0].style.transform).toBe(""));
    expect(cards.map((card) => card.dataset.exerciseId)).toEqual([
      "e0",
      "e1",
      "e2",
    ]);
    expect(handle).toBeEnabled();
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it("holds a navigation row to drag without switching exercises and cancels without saving", () => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", MouseEvent);
  try {
    const open = vi.fn();
    const view = render(
      <WorkoutExerciseLog
        workout={workout}
        busy={false}
        navigation
        currentExerciseId="e0"
        run={(action) => void action()}
        onOpen={open}
      />,
    );
    const row = screen.getByRole("button", {
      name: "Switch to Bench",
      exact: true,
    });
    fireEvent.pointerDown(row, { clientY: 50, button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(550));
    expect(view.container.querySelector(".is-dragging")).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("toolbar", { name: "Selected exercises" }),
    ).not.toBeInTheDocument();
    fireEvent.pointerCancel(row);
    expect(
      view.container.querySelector(".is-dragging"),
    ).not.toBeInTheDocument();
    expect(api.actOnWorkoutExercises).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
