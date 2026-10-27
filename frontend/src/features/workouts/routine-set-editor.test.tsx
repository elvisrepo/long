import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RoutineSetEditor } from "./routine-set-editor";
import * as api from "./workout-api";
vi.mock("./workout-api");
const item: api.RoutineExercise = {
  id: "i",
  exercise_id: "e",
  exercise_name: "Bench",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [
    {
      id: "s",
      display_order: 10,
      weight: null,
      reps: 8,
      distance: null,
      duration_seconds: null,
    },
  ],
};
it("keeps all preset changes local until one atomic save, preserving blanks and zero", async () => {
  const close = vi.fn();
  render(
    <RoutineSetEditor
      item={item}
      busy={false}
      run={(action) => void action()}
      onClose={close}
    />,
  );
  await userEvent.clear(screen.getByLabelText("Set 1 reps"));
  await userEvent.type(screen.getByLabelText("Set 1 reps"), "10");
  await userEvent.click(
    screen.getByRole("button", { name: "Add set", exact: true }),
  );
  await userEvent.type(screen.getByLabelText("Set 2 weight (kg)"), "0");
  expect(api.replaceRoutineSets).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Save predefined sets" }),
  );
  await waitFor(() =>
    expect(api.replaceRoutineSets).toHaveBeenCalledWith(
      "i",
      [
        { weight: null, reps: 10, distance: null, duration_seconds: null },
        { weight: "0", reps: null, distance: null, duration_seconds: null },
      ],
      item.sets,
    ),
  );
  expect(close).toHaveBeenCalled();
});
