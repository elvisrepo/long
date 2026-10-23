import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutLibrary } from "./workout-library";
import * as api from "./workout-api";

vi.mock("./workout-api");
const exercise: api.Exercise = {
  id: "bench",
  category_id: "chest",
  name: "Bench press",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  notes: "",
  weight_increment: "2.5",
  rest_seconds: 90,
  is_active: true,
  display_order: 10,
};
function renderLibrary(selectingWorkout = false, item = exercise) {
  const onSelect = vi.fn();
  const onHistory = vi.fn();
  render(
    <WorkoutLibrary
      catalog={{
        categories: [
          { id: "chest", name: "Chest", display_order: 10, is_active: true },
        ],
        exercises: [item],
      }}
      busy={false}
      run={(action) => {
        void action().catch(() => {});
      }}
      onSelect={onSelect}
      selectionDisabled={false}
      selectingWorkout={selectingWorkout}
      onHistory={onHistory}
      onProgress={vi.fn()}
    />,
  );
  return { onSelect, onHistory };
}
it("opens exercise actions without selecting the row and links directly to history", async () => {
  const { onSelect, onHistory } = renderLibrary(true);
  expect(
    screen.queryByRole("button", { name: "Edit exercise Bench press" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Bench press" }),
  );
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("menuitem", { name: "History" }));
  expect(onHistory).toHaveBeenCalledWith("bench");
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
it("supports keyboard actions, Escape focus return and outside dismissal", async () => {
  renderLibrary();
  const trigger = screen.getByRole("button", {
    name: "Actions for Bench press",
  });
  trigger.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "History" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await userEvent.click(trigger);
  await userEvent.click(screen.getByLabelText("Search exercises"));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(
    screen.getByRole("heading", { name: "Edit exercise" }),
  ).toBeInTheDocument();
});
it("requires confirmation before archiving and preserves the existing archive API", async () => {
  vi.mocked(api.saveExercise).mockClear();
  renderLibrary();
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Bench press" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  expect(api.saveExercise).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog", { name: "Archive Bench press?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api.saveExercise).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Bench press" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Archive exercise" }),
  );
  await waitFor(() =>
    expect(api.saveExercise).toHaveBeenCalledWith("bench", {
      is_active: false,
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("restores an archived exercise from its actions", async () => {
  renderLibrary(false, { ...exercise, is_active: false });
  await userEvent.click(screen.getByLabelText("Show archived"));
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Bench press" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Restore" }));
  await waitFor(() =>
    expect(api.saveExercise).toHaveBeenCalledWith("bench", { is_active: true }),
  );
});
it("offers permanent deletion only when the server permits it and confirms before deleting", async () => {
  vi.mocked(api.deleteExercise).mockClear();
  renderLibrary(false, { ...exercise, can_delete: true });
  const trigger = screen.getByRole("button", {
    name: "Actions for Bench press",
  });
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(api.deleteExercise).not.toHaveBeenCalled();
  expect(
    screen.getByRole("dialog", { name: "Delete Bench press?" }),
  ).toHaveTextContent("permanent");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.deleteExercise).not.toHaveBeenCalled();
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Delete exercise", exact: true }),
  );
  await waitFor(() => expect(api.deleteExercise).toHaveBeenCalledWith("bench"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each([false, undefined])(
  "keeps Archive without Delete when eligibility is %s",
  async (can_delete) => {
    renderLibrary(false, { ...exercise, can_delete, trained_session_count: 0 });
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Bench press" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Archive" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
  },
);
it("keeps the confirmation open and explains when deletion eligibility changed", async () => {
  vi.mocked(api.deleteExercise).mockRejectedValueOnce(
    new Error("This exercise is linked to a workout. Archive it instead."),
  );
  renderLibrary(false, { ...exercise, can_delete: true });
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Bench press" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Delete exercise", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Archive it instead",
  );
  expect(
    screen.getByRole("dialog", { name: "Delete Bench press?" }),
  ).toBeInTheDocument();
});
it("keeps row selection separate from favorite and overflow actions", async () => {
  const { onSelect } = renderLibrary(true);
  const row = screen.getByRole("button", { name: "Add Bench press" });
  expect(row).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(
    screen.getByRole("button", { name: "Favorite Bench press" }),
  );
  expect(onSelect).not.toHaveBeenCalled();
  await userEvent.click(row);
  expect(onSelect).toHaveBeenCalledWith("bench");
});
it("filters favorites and multiple search terms without starting workouts", async () => {
  const select = vi.fn();
  const favorite: api.Exercise = {
    id: "bench",
    category_id: "chest",
    name: "Dumbbell bench press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.5",
    rest_seconds: 90,
    is_active: true,
    display_order: 10,
    is_favorite: true,
    trained_session_count: 3,
    last_used_on: "2026-09-30",
  };
  render(
    <WorkoutLibrary
      catalog={{
        categories: [
          { id: "chest", name: "Chest", display_order: 10, is_active: true },
          { id: "back", name: "Back", display_order: 20, is_active: true },
        ],
        exercises: [
          favorite,
          { ...favorite, id: "fly", name: "Dumbbell fly", is_favorite: false },
        ],
      }}
      busy={false}
      run={(action) => {
        void action();
      }}
      onSelect={select}
      selectionDisabled={false}
      selectingWorkout={false}
      onHistory={vi.fn()}
      onProgress={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Favorites", exact: true }),
  );
  expect(
    screen.queryByRole("button", { name: "View Dumbbell fly", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Back", exact: true }),
  ).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Search exercises"), "dum press");
  expect(
    screen.getByRole("button", {
      name: "View Dumbbell bench press",
      exact: true,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("1 exercise", { selector: "small" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/3 trained sessions.*2026-09-30/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", {
      name: "Unfavorite Dumbbell bench press",
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(api.saveExercise).toHaveBeenCalledWith("bench", {
      is_favorite: false,
    }),
  );
  expect(select).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText("Search exercises"));
  await userEvent.type(screen.getByLabelText("Search exercises"), "missing");
  expect(
    screen.getByText("No exercises match these filters."),
  ).toBeInTheDocument();
});
