import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RoutineGroupDialog } from "./routine-group-dialog";
import * as api from "./workout-api";
vi.mock("./workout-api");
it("chooses a named group with its saved colour without editing quantities", async () => {
  const item: api.RoutineExercise = {
    id: "i",
    exercise_id: "e",
    exercise_name: "Bench",
    category_name: "Chest",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    display_order: 10,
    sets: [],
  };
  render(
    <RoutineGroupDialog
      item={item}
      day={{
        id: "d",
        name: "Push",
        notes: "",
        display_order: 10,
        exercises: [
          item,
          {
            ...item,
            id: "other",
            exercise_name: "Fly",
            group_name: "Superset 1",
            group_colour: "#123456",
          },
        ],
      }}
      busy={false}
      run={(action) => void action()}
      onClose={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("radio", { name: /Superset 1/ }));
  expect(api.reorderRoutineExercise).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Save group" }));
  await waitFor(() =>
    expect(api.reorderRoutineExercise).toHaveBeenCalledWith(
      "i",
      10,
      "Superset 1",
      "#123456",
    ),
  );
  expect(api.replaceRoutineSets).not.toHaveBeenCalled();
});
