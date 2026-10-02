import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutTools } from "./workout-tools";
import type { WorkoutExercise } from "./workout-api";

it("adds a percentage result only as a planned set and keeps failed submission visible", async () => {
  const add = vi
    .fn()
    .mockRejectedValueOnce(new Error("Save failed"))
    .mockResolvedValue(undefined);
  render(
    <WorkoutTools
      item={
        {
          weight_unit: "kg",
          tracking_type: "strength",
          sets: [],
        } as WorkoutExercise
      }
      busy={false}
      onAdd={add}
    />,
  );
  await userEvent.click(screen.getByText("Workout calculators"));
  await userEvent.type(screen.getByLabelText("Base load (kg)"), "100");
  await userEvent.click(
    screen.getByRole("button", { name: "Calculate percentage" }),
  );
  expect(screen.getByText("80 kg")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Add calculated planned set" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  await userEvent.click(
    screen.getByRole("button", { name: "Add calculated planned set" }),
  );
  await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
  expect(add).toHaveBeenLastCalledWith({
    weight: "80.000",
    reps: null,
    is_completed: false,
  });
});
