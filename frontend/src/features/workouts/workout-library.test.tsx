import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutLibrary } from "./workout-library";
import * as api from "./workout-api";

vi.mock("./workout-api");
beforeEach(() => localStorage.clear());
it("keeps detail toggles in a dropdown without a dialog or a Done step", async () => {
  renderLibrary(false, {
    ...exercise,
    trained_session_count: 2,
    last_used_on: null,
  });
  const trigger = screen.getByRole("button", { name: "Display options" });
  await userEvent.click(trigger);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("checkbox", { name: "Workout count" })).toHaveFocus();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Workout count" }),
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Last used" }));
  expect(screen.getByText("2 workouts · Not used yet")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Workout count" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  await userEvent.click(screen.getByLabelText("Search exercises"));
  expect(
    screen.queryByRole("checkbox", { name: "Workout count" }),
  ).not.toBeInTheDocument();
  await userEvent.click(trigger);
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(
    screen.queryByRole("group", { name: "Exercise details" }),
  ).not.toBeInTheDocument();
});
it("shows optional saved category colours and keeps manual order drafts cancellable", async () => {
  vi.mocked(api.reorderCategories).mockClear();
  renderLibrary(false, exercise, [
    {
      id: "chest",
      name: "Chest",
      display_order: 10,
      is_active: true,
      colour: "#abcdef",
    },
  ]);
  expect(
    screen.queryByRole("img", { name: "Chest category colour" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Category colours" }),
  );
  expect(
    screen.getByRole("img", { name: "Chest category colour" }),
  ).toHaveStyle({ backgroundColor: "#abcdef" });
  await userEvent.click(
    screen.getByRole("button", { name: "Reorder categories" }),
  );
  await userEvent.click(screen.getByRole("radio", { name: "Manual" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.reorderCategories).not.toHaveBeenCalled();
});
it("saves the chosen category colour through the existing category editor", async () => {
  vi.mocked(api.saveCategory).mockClear();
  renderLibrary(false, exercise, [
    {
      id: "chest",
      name: "Chest",
      display_order: 10,
      is_active: true,
      colour: "#abcdef",
    },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Edit category Chest" }),
  );
  fireEvent.change(screen.getByLabelText("Category colour"), {
    target: { value: "#123456" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save category" }));
  await waitFor(() =>
    expect(api.saveCategory).toHaveBeenCalledWith("chest", {
      name: "Chest",
      display_order: 10,
      colour: "#123456",
    }),
  );
});
it("retains a rejected ordering draft with the server's stale-state explanation", async () => {
  vi.mocked(api.reorderCategories).mockRejectedValueOnce(
    new Error("Categories changed. Reopen Reorder categories."),
  );
  renderLibrary();
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reorder categories" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Categories changed",
  );
  expect(
    screen.getByRole("dialog", { name: "Reorder categories" }),
  ).toBeInTheDocument();
});
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
function renderLibrary(
  selectingWorkout = false,
  item = exercise,
  categories: api.ExerciseCategory[] = [
    { id: "chest", name: "Chest", display_order: 10, is_active: true },
  ],
) {
  const onSelect = vi.fn();
  const onHistory = vi.fn();
  const rendered = render(
    <WorkoutLibrary
      catalog={{
        categories,
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
  return { onSelect, onHistory, unmount: rendered.unmount };
}
it("orders categories alphabetically by default and saves a manual draft only on Save", async () => {
  vi.mocked(api.reorderCategories).mockClear();
  renderLibrary(false, exercise, [
    { id: "chest", name: "Chest", display_order: 10, is_active: true },
    { id: "back", name: "Back", display_order: 20, is_active: true },
  ]);
  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent),
  ).toEqual(["Back", "Chest"]);
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reorder categories" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Reorder categories" });
  await userEvent.click(within(dialog).getByRole("radio", { name: "Manual" }));
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Move Back up" }),
  );
  expect(api.reorderCategories).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.reorderCategories).toHaveBeenCalledWith(
      "manual",
      ["back", "chest"],
      ["chest", "back"],
    ),
  );
});
it("defaults to names only and remembers independently selected exercise details", async () => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const item = { ...exercise, trained_session_count: 3, last_used_on: date };
  const { unmount } = renderLibrary(false, item);
  expect(screen.queryByText("Weight + reps")).not.toBeInTheDocument();
  expect(screen.queryByText(/3 workouts/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  const count = screen.getByRole("checkbox", { name: "Workout count" });
  const lastUsed = screen.getByRole("checkbox", { name: "Last used" });
  expect(count).not.toBeChecked();
  expect(lastUsed).not.toBeChecked();
  await userEvent.click(count);
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("3 workouts")).toBeInTheDocument();
  expect(screen.queryByText(/Last used today/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Last used" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("3 workouts · Last used today")).toBeInTheDocument();
  unmount();
  renderLibrary(true, item);
  expect(screen.getByText("3 workouts · Last used today")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Workout count" }),
  );
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("Last used today")).toBeInTheDocument();
  expect(screen.queryByText(/3 workouts/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Edit category Chest" }),
  ).toHaveTextContent("Edit category");
});
it("defaults safely with invalid saved settings and keeps options usable without storage", async () => {
  localStorage.setItem("longevity-workout-library-display:v1", "broken-json");
  renderLibrary(false, {
    ...exercise,
    trained_session_count: 0,
    last_used_on: null,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Workout count" }),
  ).not.toBeChecked();
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
  try {
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Workout count" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Last used" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("0 workouts · Not used yet")).toBeInTheDocument();
  } finally {
    write.mockRestore();
  }
});
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
  await userEvent.click(
    screen.getByRole("button", { name: "Display options" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Workout count" }),
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Last used" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText(/3 workouts · Last used/)).toHaveAttribute(
    "title",
    "2026-09-30",
  );
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
