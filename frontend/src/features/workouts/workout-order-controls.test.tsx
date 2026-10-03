import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutOrderControls } from "./workout-order-controls";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());

it("moves the specific occurrence using native keyboard controls without changing sets", async () => {
  const run = vi.fn((action: () => Promise<void>) => {
    void action();
  });
  render(
    <WorkoutOrderControls
      kind="session-exercises"
      id="occurrence"
      label="exercise 2 (Row)"
      index={1}
      count={3}
      disabled={false}
      run={run}
    />,
  );
  screen.getByRole("button", { name: "Move exercise 2 (Row) up" }).focus();
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(api.moveWorkoutItem).toHaveBeenCalledWith(
      "session-exercises",
      "occurrence",
      "up",
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Moved exercise 2 (Row) up",
  );
  expect(api.saveWorkoutSet).not.toHaveBeenCalled();
});

it.each([
  [0, 3, false, true, false],
  [2, 3, false, false, true],
  [0, 1, false, true, true],
  [1, 3, true, true, true],
])(
  "disables unavailable directions at index %s, count %s, locked %s",
  (index, count, disabled, up, down) => {
    render(
      <WorkoutOrderControls
        kind="sets"
        id="s"
        label="set 1"
        index={index}
        count={count}
        disabled={disabled}
        run={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Move set 1 up" }),
    ).toHaveProperty("disabled", up);
    expect(
      screen.getByRole("button", { name: "Move set 1 down" }),
    ).toHaveProperty("disabled", down);
  },
);

it("blocks duplicate moves during a save and retains a retryable error without claiming success", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.moveWorkoutItem).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const run = (action: () => Promise<void>) => {
    void action();
  };
  render(
    <WorkoutOrderControls
      kind="sets"
      id="s2"
      label="set 2"
      index={1}
      count={3}
      disabled={false}
      run={run}
    />,
  );
  const up = screen.getByRole("button", { name: "Move set 2 up" });
  await userEvent.click(up);
  expect(up).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move set 2 down" }),
  ).toBeDisabled();
  reject(new Error("Connection lost. Retry."));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection lost. Retry.",
  );
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  await waitFor(() => expect(up).toBeEnabled());
  await userEvent.click(up);
  expect(api.moveWorkoutItem).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("status")).toHaveTextContent("Moved set 2 up");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
