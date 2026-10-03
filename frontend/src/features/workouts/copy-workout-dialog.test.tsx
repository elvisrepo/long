import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { CopyWorkoutDialog } from "./copy-workout-dialog";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
const set: api.WorkoutSet = {
  id: "s1",
  weight: "70.000",
  reps: 5,
  distance: null,
  duration_seconds: null,
  comment: "Do not copy",
  is_completed: true,
  display_order: 10,
};
const item: api.WorkoutExercise = {
  id: "i1",
  exercise_id: "e",
  exercise_name: "Bench",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  group_name: "Superset",
  group_colour: "#db2777",
  sets: [set, { ...set, id: "s2", weight: "80.000" }],
};
const source: api.Workout = {
  id: "w",
  name: "Push",
  performed_on: "2026-10-02",
  notes: "Private",
  is_finished: true,
  created_at: "2026-10-02",
  completed_set_count: 4,
  exercises: [item, { ...item, id: "i2", sets: [{ ...set, id: "s3" }] }],
};

it("selects an individual set and previews without writes before confirmation", async () => {
  const close = vi.fn();
  const navigate = vi.fn();
  vi.mocked(api.copyWorkout).mockResolvedValue({
    ...source,
    id: "copy",
    performed_on: "2026-10-03",
  });
  render(
    <CopyWorkoutDialog
      source={source}
      destination="2026-10-03"
      busy={false}
      run={(action) => {
        void action();
      }}
      navigate={navigate}
      onClose={close}
    />,
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Include exercise 2: Bench" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "Include exercise 1 set 1: 70 kg · 5 reps",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
  const preview = screen.getByRole("region", { name: "Copy preview" });
  expect(within(preview).getByText("80 kg · 5 reps")).toBeInTheDocument();
  expect(within(preview).queryByText("70 kg · 5 reps")).not.toBeInTheDocument();
  expect(preview).not.toHaveTextContent("Do not copy");
  expect(api.copyWorkout).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Create planned workout" }),
  );
  expect(api.copyWorkout).toHaveBeenCalledWith("w", "2026-10-03", [
    { item_id: "i1", set_ids: ["s2"] },
  ]);
  expect(close).toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-10-03" });
});

it("keeps a failed subset preview and date for retry and disables all writes while pending", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.copyWorkout).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const close = vi.fn();
  render(
    <CopyWorkoutDialog
      source={source}
      destination="2026-10-03"
      busy={false}
      run={(action) => {
        void action();
      }}
      navigate={vi.fn()}
      onClose={close}
      onBack={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Include exercise 2: Bench" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
  const confirm = screen.getByRole("button", {
    name: "Create planned workout",
  });
  await userEvent.click(confirm);
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit selection" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Choose another workout" }),
  ).toBeDisabled();
  reject(new Error("Copy failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Copy failed");
  expect(
    screen.getByRole("region", { name: "Copy preview" }),
  ).toHaveTextContent("80 kg");
  expect(screen.getByLabelText("Copy to date")).toHaveValue("2026-10-03");
  expect(close).not.toHaveBeenCalled();
  await waitFor(() => expect(confirm).toBeEnabled());
  vi.mocked(api.copyWorkout).mockResolvedValue({
    ...source,
    performed_on: "2026-10-03",
  });
  await userEvent.click(confirm);
  expect(api.copyWorkout).toHaveBeenCalledTimes(2);
  expect(api.copyWorkout).toHaveBeenLastCalledWith("w", "2026-10-03", [
    { item_id: "i1", set_ids: ["s1", "s2"] },
  ]);
  expect(close).toHaveBeenCalled();
});

it("requires an exercise, supports exercise-only copies and preserves selection when returning from preview", async () => {
  const empty = { ...item, id: "empty", sets: [] };
  const close = vi.fn();
  render(
    <CopyWorkoutDialog
      source={{ ...source, exercises: [...source.exercises, empty] }}
      destination="2026-10-03"
      busy={false}
      run={(action) => {
        void action();
      }}
      navigate={vi.fn()}
      onClose={close}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Clear selection" }),
  );
  expect(screen.getByRole("button", { name: "Preview copy" })).toBeDisabled();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Include exercise 3: Bench" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview copy" }));
  expect(
    screen.getByRole("region", { name: "Copy preview" }),
  ).toHaveTextContent("No sets — exercise only");
  await userEvent.click(screen.getByRole("button", { name: "Edit selection" }));
  expect(
    screen.getByRole("checkbox", { name: "Include exercise 3: Bench" }),
  ).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "Include exercise 1: Bench" }),
  ).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(
    screen.getByRole("checkbox", {
      name: "Include exercise 1 set 1: 70 kg · 5 reps",
    }),
  ).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalled();
  expect(api.copyWorkout).not.toHaveBeenCalled();
});
