import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutTools } from "./workout-tools";
import type { WorkoutExercise } from "./workout-api";

const render = (element: ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {element}
    </QueryClientProvider>,
  );
const item = {
  id: "item",
  exercise_id: "bench",
  exercise_name: "Bench",
  weight_unit: "kg",
  tracking_type: "strength",
  sets: [],
} as unknown as WorkoutExercise;

it("opens a focused 1RM dialog with all fifteen estimated rep loads", async () => {
  render(<WorkoutTools item={item} busy={false} onAdd={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "1RM Calculator" }));
  const dialog = screen.getByRole("dialog", { name: "One-rep-max calculator" });
  fireEvent.change(within(dialog).getByLabelText("Weight (kg)"), {
    target: { value: "110" },
  });
  fireEvent.change(within(dialog).getByLabelText("Reps"), {
    target: { value: "5" },
  });
  expect(within(dialog).getByText("128.3 kg")).toBeInTheDocument();
  expect(within(dialog).getByText("15RM")).toBeInTheDocument();
  expect(within(dialog).queryByLabelText("Percentage")).not.toBeInTheDocument();
});

it("rounds percentage sets optionally and retries failed saves as planned sets", async () => {
  const add = vi
    .fn()
    .mockRejectedValueOnce(new Error("Save failed"))
    .mockResolvedValue(undefined);
  render(<WorkoutTools item={item} busy={false} onAdd={add} />);
  await userEvent.click(screen.getByRole("button", { name: "Set Calculator" }));
  fireEvent.change(screen.getByLabelText("Base load (kg)"), {
    target: { value: "120" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("95 kg");
  await userEvent.click(screen.getByLabelText("Round to closest"));
  expect(screen.getByRole("status")).toHaveTextContent("96 kg");
  await userEvent.click(screen.getByRole("button", { name: "Add to workout" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  await userEvent.click(screen.getByRole("button", { name: "Add to workout" }));
  await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
  expect(add).toHaveBeenLastCalledWith({
    weight: "96.000",
    reps: null,
    is_completed: false,
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("uses records in the saved units and percentage presets without writes", async () => {
  const api = await import("./workout-api");
  const records = vi.spyOn(api, "getRecordPage").mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        date: "2026-10-01",
        value: "100",
        reps: 5,
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        source: {
          workout_id: "w",
          item_id: "i",
          set_id: "s",
          weight: "100",
          reps: 5,
        },
      },
      {
        date: "2026-10-01",
        value: "220",
        reps: 1,
        tracking_type: "strength",
        weight_unit: "lb",
        distance_unit: "mi",
        source: {
          workout_id: "w",
          item_id: "i",
          set_id: "s",
          weight: "220",
          reps: 1,
        },
      },
    ],
  });
  const add = vi.fn();
  render(
    <WorkoutTools item={item} busy={false} onAdd={add} date="2026-10-22" />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Set Calculator" }));
  await userEvent.click(screen.getByRole("button", { name: "Select max" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "5RM · 100 kg" }),
  );
  expect(screen.getByLabelText("Base load (kg)")).toHaveValue(100);
  expect(screen.queryByText(/220 lb/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Select percentage" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "75%", exact: true }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("75 kg");
  expect(add).not.toHaveBeenCalled();
  expect(records).toHaveBeenCalledWith("bench", "2026-10-22");
  records.mockRestore();
});

it("loads only available paired plates using the exercise-specific bar", async () => {
  render(
    <WorkoutTools
      item={item}
      busy={false}
      onAdd={vi.fn()}
      preferences={{
        bar_kg: "20",
        exercise_bars: [
          { exercise_id: "bench", weight_unit: "kg", weight: "15" },
        ],
        plates_kg: [
          { weight: "20", count: 4, colour: "#2563eb", enabled: true },
          { weight: "5", count: 2, enabled: false },
        ],
      }}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Plate Calculator" }),
  );
  fireEvent.change(screen.getByLabelText("Target including bar (kg)"), {
    target: { value: "95" },
  });
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Plates on each side: 2 × 20 kg",
  );
  expect(screen.getByText("15 kg bar + 40 kg each side")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show list" }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Target including bar (kg)"), {
    target: { value: "105" },
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "No exact balanced combination",
  );
});

it("keeps failed equipment drafts, saves colours and availability without creating sets", async () => {
  const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Equipment failed"))
      .mockResolvedValue(undefined),
    add = vi.fn();
  render(
    <WorkoutTools
      item={item}
      busy={false}
      onAdd={add}
      preferences={{
        bar_kg: "15",
        plates_kg: [{ weight: "20", count: 4, colour: "#2563eb" }],
      }}
      onSaveEquipment={save}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Plate Calculator" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Settings", exact: true }),
  );
  await userEvent.click(screen.getByLabelText("Available 20 kg plate"));
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Equipment failed",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      bar_kg: "15.000",
      plates_kg: expect.arrayContaining([
        { weight: "20.000", count: 4, colour: "#2563eb", enabled: false },
      ]),
    }),
  );
  expect(add).not.toHaveBeenCalled();
});

it("validates a blank bar before saving and discards cancelled settings", async () => {
  const save = vi.fn();
  render(
    <WorkoutTools
      item={item}
      busy={false}
      onAdd={vi.fn()}
      onSaveEquipment={save}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Plate Calculator" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Settings", exact: true }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Edit bar" }));
  fireEvent.change(screen.getByLabelText("Default bar weight (kg)"), {
    target: { value: "" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Save equipment defaults" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a valid bar weight",
  );
  expect(save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("20 kg bar + 0 kg each side")).toBeInTheDocument();
});
