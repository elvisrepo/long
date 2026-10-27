import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { RoutineGroupDialog } from "./routine-group-dialog";
import * as api from "./workout-api";
vi.mock("./workout-api");
const item: api.RoutineExercise = {
  id: "i",
  exercise_id: "e",
  exercise_name: "Dips",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [],
};
function mount(members: api.RoutineExercise[] = [item]) {
  const close = vi.fn();
  render(
    <RoutineGroupDialog
      item={item}
      day={{
        id: "d",
        name: "Push",
        notes: "",
        display_order: 10,
        exercises: members,
      }}
      busy={false}
      run={(action) => {
        void action().catch(() => {});
      }}
      onClose={close}
    />,
  );
  return close;
}
beforeEach(() => vi.resetAllMocks());
it("creates a group from a focused name and colour palette, then shows its membership", async () => {
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "New group", exact: true }),
  );
  expect(screen.getByRole("dialog", { name: "New group" })).toBeVisible();
  expect(screen.getByLabelText("Group name")).toHaveValue("Group 1");
  await userEvent.click(
    screen.getByRole("button", { name: "Red", exact: true }),
  );
  expect(
    screen.getByRole("button", { name: "Red", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(api.reorderRoutineExercise).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Save group", exact: true }),
  );
  await waitFor(() =>
    expect(api.reorderRoutineExercise).toHaveBeenCalledWith(
      "i",
      10,
      "Group 1",
      "#dc2626",
    ),
  );
  expect(
    screen.getByRole("dialog", { name: "Groups", exact: true }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /Group 1.*Dips/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(api.replaceRoutineSets).not.toHaveBeenCalled();
});

it("links another exercise with the existing colour and unlinks it on a second tap", async () => {
  mount([
    item,
    {
      ...item,
      id: "fly",
      exercise_name: "Fly",
      group_name: "Group 1",
      group_colour: "#dc2626",
    },
  ]);
  const group = screen.getByRole("button", { name: /Group 1.*Fly/ });
  expect(group).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(group);
  await waitFor(() =>
    expect(api.reorderRoutineExercise).toHaveBeenCalledWith(
      "i",
      10,
      "Group 1",
      "#dc2626",
    ),
  );
  expect(
    screen.getByRole("button", { name: /Group 1.*Dips.*Fly/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(
    screen.getByRole("button", { name: /Group 1.*Dips.*Fly/ }),
  );
  await waitFor(() =>
    expect(api.reorderRoutineExercise).toHaveBeenLastCalledWith(
      "i",
      10,
      "",
      "#dc2626",
    ),
  );
  expect(screen.getByRole("button", { name: /Group 1.*Fly/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(api.replaceRoutineSets).not.toHaveBeenCalled();
});
it("cancels group creation locally and returns focus to the chooser", async () => {
  const close = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "New group", exact: true }),
  );
  expect(screen.getByLabelText("Group name")).toHaveFocus();
  await userEvent.type(screen.getByLabelText("Group name"), " draft");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(
    screen.getByRole("button", { name: "New group", exact: true }),
  ).toHaveFocus();
  expect(api.reorderRoutineExercise).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Done", exact: true }),
  );
  expect(close).toHaveBeenCalledOnce();
});
it("keeps a failed group draft and its colour for retry", async () => {
  vi.mocked(api.reorderRoutineExercise)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(item);
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "New group", exact: true }),
  );
  await userEvent.clear(screen.getByLabelText("Group name"));
  await userEvent.type(screen.getByLabelText("Group name"), "Push circuit");
  await userEvent.click(
    screen.getByRole("button", { name: "Blue", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save group", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByLabelText("Group name")).toHaveValue("Push circuit");
  expect(
    screen.getByRole("button", { name: "Blue", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(
    screen.getByRole("button", { name: "Save group", exact: true }),
  );
  expect(
    await screen.findByRole("button", { name: /Push circuit.*Dips/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(api.reorderRoutineExercise).toHaveBeenCalledTimes(2);
});
it("rejects duplicate group names without writing or changing membership", async () => {
  mount([
    item,
    {
      ...item,
      id: "fly",
      exercise_name: "Fly",
      group_name: "Group 1",
      group_colour: "#dc2626",
    },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "New group", exact: true }),
  );
  expect(screen.getByLabelText("Group name")).toHaveValue("Group 2");
  await userEvent.clear(screen.getByLabelText("Group name"));
  await userEvent.type(screen.getByLabelText("Group name"), " group 1 ");
  await userEvent.click(
    screen.getByRole("button", { name: "Save group", exact: true }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose the existing group",
  );
  expect(api.reorderRoutineExercise).not.toHaveBeenCalled();
});
