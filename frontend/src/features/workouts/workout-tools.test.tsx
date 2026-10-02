import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutTools } from "./workout-tools";
import type { WorkoutExercise } from "./workout-api";

it("loads saved inventory and explicitly saves equipment without creating sets", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const add = vi.fn();
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
      preferences={{
        bar_kg: "15.000",
        plates_kg: [{ weight: "20.000", count: 4 }],
      }}
      onSaveEquipment={save}
    />,
  );
  await userEvent.click(screen.getByText("Workout calculators"));
  expect(screen.getByLabelText("Bar weight (kg)")).toHaveValue(15);
  expect(screen.getByLabelText("Plate 1 total count")).toHaveValue(4);
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      bar_kg: "15.000",
      plates_kg: [{ weight: "20.000", count: 4 }],
    }),
  );
  expect(add).not.toHaveBeenCalled();
});

it("keeps failed equipment saves visible and retryable", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("Equipment failed"))
    .mockResolvedValue(undefined);
  render(
    <WorkoutTools
      item={
        {
          weight_unit: "kg",
          tracking_type: "strength",
          sets: [],
        } as unknown as WorkoutExercise
      }
      busy={false}
      onAdd={vi.fn()}
      onSaveEquipment={save}
    />,
  );
  await userEvent.click(screen.getByText("Workout calculators"));
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Equipment failed",
  );
  expect(
    screen.queryByText("Equipment defaults saved to your account."),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  expect(
    await screen.findByText("Equipment defaults saved to your account."),
  ).toBeInTheDocument();
});

it("does not silently save a blank bar weight as zero", async () => {
  const save = vi.fn();
  render(
    <WorkoutTools
      item={
        {
          weight_unit: "kg",
          tracking_type: "strength",
          sets: [],
        } as unknown as WorkoutExercise
      }
      busy={false}
      onAdd={vi.fn()}
      onSaveEquipment={save}
    />,
  );
  await userEvent.click(screen.getByText("Workout calculators"));
  await userEvent.clear(screen.getByLabelText("Bar weight (kg)"));
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a valid bar weight",
  );
});

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
