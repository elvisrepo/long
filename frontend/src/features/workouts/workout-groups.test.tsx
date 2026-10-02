import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { WorkoutTraining } from "./workout-training";

vi.mock("./workout-api");
const item: api.WorkoutExercise = {
  id: "row",
  exercise_id: "row-library",
  exercise_name: "Barbell row",
  category_name: "Back",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [],
};
const workout: api.Workout = {
  id: "workout",
  name: "Training",
  notes: "",
  performed_on: "2026-10-02",
  is_finished: false,
  created_at: "",
  completed_set_count: 0,
  exercises: [
    item,
    {
      ...item,
      id: "press",
      exercise_id: "press-library",
      exercise_name: "Overhead press",
      display_order: 20,
    },
  ],
};

const catalog: api.WorkoutCatalog = {
  categories: [
    { id: "back", name: "Back", is_active: true, display_order: 10 },
  ],
  exercises: [
    {
      id: "pull-library",
      category_id: "back",
      name: "Pull-up",
      is_active: true,
      display_order: 30,
      tracking_type: "bodyweight",
      weight_unit: "kg",
      distance_unit: "km",
      notes: "",
      rest_seconds: 90,
      weight_increment: "2.500",
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.saveWorkoutGroup).mockResolvedValue(workout);
  vi.mocked(api.deleteWorkoutGroup).mockResolvedValue(workout);
});
function mount(session = workout) {
  vi.mocked(api.getWorkoutPage).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkoutTraining
        workout={session}
        itemId="row"
        catalog={catalog}
        owner="owner"
        busy={false}
        run={(action) => {
          void action();
        }}
        navigate={navigate}
        onCompleted={vi.fn()}
        autoAdvance={true}
        onAutoAdvance={vi.fn()}
        savePlanned={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return navigate;
}

it("creates a named coloured group from the selected exercise and a second member", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
  await userEvent.click(screen.getByRole("button", { name: "New group" }));
  expect(screen.getByLabelText("Group name")).toHaveValue("Superset 1");
  expect(screen.getByLabelText("Barbell row")).toBeChecked();
  await userEvent.click(screen.getByLabelText("Overhead press"));
  await userEvent.clear(screen.getByLabelText("Group name"));
  await userEvent.type(screen.getByLabelText("Group name"), "Pull and press");
  await userEvent.click(screen.getByRole("button", { name: "Blue" }));
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Save group",
    }),
  );
  expect(api.saveWorkoutGroup).toHaveBeenCalledWith("workout", {
    name: "Pull and press",
    colour: "#2563eb",
    member_ids: ["row", "press"],
    add_exercise_ids: [],
  });
});

it("keeps library additions as drafts and cancellation changes nothing", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
  await userEvent.click(screen.getByRole("button", { name: "New group" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Add exercise to group" }),
  );
  await userEvent.click(screen.getByLabelText("Pull-up"));
  expect(api.addWorkoutExercise).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
  expect(api.saveWorkoutGroup).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("submits new library selections together with existing members", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
  await userEvent.click(screen.getByRole("button", { name: "New group" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Add exercise to group" }),
  );
  await userEvent.click(screen.getByLabelText("Pull-up"));
  await userEvent.click(screen.getByRole("button", { name: "Save group" }));
  expect(api.saveWorkoutGroup).toHaveBeenCalledWith(
    "workout",
    expect.objectContaining({
      member_ids: ["row"],
      add_exercise_ids: ["pull-library"],
    }),
  );
});

const grouped: api.Workout = {
  ...workout,
  exercises: workout.exercises.map((i) => ({
    ...i,
    group_name: "Superset 1",
    group_colour: "#db2777",
  })),
};

it("edits membership and colour and preserves the existing group identity", async () => {
  mount(grouped);
  const sidebar = screen.getByRole("complementary");
  expect(
    within(sidebar).getByRole("button", { name: /^Barbell row/ }),
  ).toHaveStyle({ borderInlineStartColor: "#db2777" });
  await userEvent.click(
    screen.getByRole("button", { name: "Edit group", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit Superset 1" }),
  );
  expect(screen.getByLabelText("Overhead press")).toBeChecked();
  await userEvent.click(screen.getByLabelText("Overhead press"));
  await userEvent.click(screen.getByRole("button", { name: "Purple" }));
  await userEvent.click(screen.getByRole("button", { name: "Save group" }));
  expect(api.saveWorkoutGroup).toHaveBeenCalledWith("workout", {
    original_name: "Superset 1",
    name: "Superset 1",
    colour: "#9333ea",
    member_ids: ["row"],
    add_exercise_ids: [],
  });
});

it("requires confirmation before deleting a group, not its exercises", async () => {
  mount(grouped);
  await userEvent.click(
    screen.getByRole("button", { name: "Edit group", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit Superset 1" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Delete group", exact: true }),
  );
  expect(api.deleteWorkoutGroup).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm group deletion" }),
  );
  expect(api.deleteWorkoutGroup).toHaveBeenCalledWith("workout", "Superset 1");
  expect(api.deleteWorkoutItem).not.toHaveBeenCalled();
});

it("removes only the current exercise from a group", async () => {
  mount(grouped);
  await userEvent.click(
    screen.getByRole("button", { name: "Edit group", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Remove current exercise from group" }),
  );
  expect(api.saveWorkoutGroup).toHaveBeenCalledWith(
    "workout",
    expect.objectContaining({
      original_name: "Superset 1",
      member_ids: ["press"],
      colour: "#db2777",
    }),
  );
});

it("joins an existing group without changing its other members", async () => {
  mount({ ...workout, exercises: [item, grouped.exercises[1]] });
  await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Add to Superset 1" }),
  );
  expect(api.saveWorkoutGroup).toHaveBeenCalledWith(
    "workout",
    expect.objectContaining({
      original_name: "Superset 1",
      member_ids: ["press", "row"],
    }),
  );
});

it("retains the draft and shows an error when saving fails", async () => {
  vi.mocked(api.saveWorkoutGroup).mockRejectedValue(
    new Error("Network unavailable"),
  );
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Add to group" }));
  await userEvent.click(screen.getByRole("button", { name: "New group" }));
  await userEvent.click(screen.getByRole("button", { name: "Save group" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Network unavailable",
  );
  expect(screen.getByLabelText("Group name")).toHaveValue("Superset 1");
});

it("advances to the next group member only after a confirmed completed set", async () => {
  const navigate = mount(grouped);
  let resolve!: (set: api.WorkoutSet) => void;
  vi.mocked(api.saveWorkoutSet).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await userEvent.type(
    screen.getByLabelText("Weight (kg)", { exact: true }),
    "40",
  );
  await userEvent.type(screen.getByLabelText("Reps", { exact: true }), "8");
  await userEvent.click(
    screen.getByRole("button", { name: "Save completed set" }),
  );
  expect(navigate).not.toHaveBeenCalled();
  resolve({
    id: "s",
    weight: "40",
    reps: 8,
    distance: null,
    duration_seconds: null,
    display_order: 10,
    comment: "",
    is_completed: true,
  });
  await screen.findByRole("button", { name: "Save completed set" });
  expect(navigate).toHaveBeenCalledWith({
    view: "training",
    date: workout.performed_on,
    session: "workout",
    exercise: "press",
  });
});
