import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { BulkSetDialog } from "./bulk-set-dialog";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
const set: api.WorkoutSet = {
  id: "s1",
  display_order: 10,
  weight: "70.000",
  reps: 5,
  distance: null,
  duration_seconds: null,
  comment: "Keep me",
  is_completed: false,
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
  sets: [set, { ...set, id: "s2", reps: 6 }],
};
const workout: api.Workout = {
  id: "w1",
  name: "Push",
  performed_on: "2026-10-02",
  created_at: "2026-10-02",
  notes: "",
  is_finished: false,
  completed_set_count: 0,
  exercises: [item],
};
function mount(workouts = [workout]) {
  const close = vi.fn();
  const refresh = vi.fn();
  render(
    <BulkSetDialog
      workouts={workouts}
      exerciseId="e"
      busy={false}
      run={(action) => {
        void action();
      }}
      onClose={close}
      onRefresh={refresh}
    />,
  );
  return { close, refresh };
}

it("selects sets and previews completion without writing until confirmed", async () => {
  vi.mocked(api.bulkUpdateSets).mockResolvedValue({ affected_count: 2 });
  const { close } = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Completion"),
    "completed",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  expect(api.bulkUpdateSets).not.toHaveBeenCalled();
  const preview = screen.getByRole("region", { name: "Batch preview" });
  expect(within(preview).getAllByText(/Before:.*Planned/)).toHaveLength(2);
  expect(within(preview).getAllByText(/After:.*Completed/)).toHaveLength(2);
  await userEvent.click(
    screen.getByRole("button", { name: "Apply to 2 sets" }),
  );
  expect(api.bulkUpdateSets).toHaveBeenCalledWith({
    action: "update",
    changes: { is_completed: true },
    sets: item.sets.map((s) => ({ id: s.id, expected: s })),
  });
  expect(close).toHaveBeenCalled();
});

it("previews numeric changes and explicit comment clearing, not order or blank values", async () => {
  vi.mocked(api.bulkUpdateSets).mockResolvedValue({ affected_count: 2 });
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  await userEvent.type(screen.getByLabelText("Weight (kg)"), "80");
  await userEvent.click(
    screen.getByLabelText("Replace comments (blank clears them)"),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  expect(screen.getAllByText(/After: 80 kg/)).toHaveLength(2);
  expect(screen.getAllByText("Comment after: (cleared)")).toHaveLength(2);
  await userEvent.click(
    screen.getByRole("button", { name: "Back to selection" }),
  );
  expect(screen.getByLabelText("Weight (kg)")).toHaveValue(80);
  expect(
    screen.getByLabelText("Replace comments (blank clears them)"),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Apply to 2 sets" }),
  );
  expect(api.bulkUpdateSets).toHaveBeenCalledWith(
    expect.objectContaining({ changes: { weight: "80", comment: "" } }),
  );
});

it("deletion needs selection, preview and confirmation; cancel never writes", async () => {
  const { close } = mount();
  expect(
    screen.getByRole("button", { name: "Preview changes" }),
  ).toBeDisabled();
  await userEvent.click(screen.getAllByRole("checkbox")[0]);
  await userEvent.selectOptions(screen.getByLabelText("Action"), "delete");
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  expect(screen.getByText(/permanently removed/)).toBeInTheDocument();
  expect(screen.getByText("Comment before: Keep me")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete 1 set" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(api.bulkUpdateSets).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});

it("keeps duplicate occurrences independent and excludes finished workouts", async () => {
  vi.mocked(api.bulkUpdateSets).mockResolvedValue({ affected_count: 1 });
  mount([
    {
      ...workout,
      exercises: [item, { ...item, id: "i2", sets: [{ ...set, id: "s3" }] }],
    },
    {
      ...workout,
      id: "finished",
      is_finished: true,
      exercises: [{ ...item, id: "i3", sets: [{ ...set, id: "s4" }] }],
    },
  ]);
  expect(
    screen.getByRole("checkbox", { name: /Finished — reopen to edit/ }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("checkbox", { name: /entry 2 · set 1/ }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Action"), "delete");
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Delete 1 set" }));
  expect(api.bulkUpdateSets).toHaveBeenCalledWith({
    action: "delete",
    sets: [{ id: "s3", expected: { ...set, id: "s3" } }],
  });
});

it("locks pending writes and retains failed preview until explicit refresh", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.bulkUpdateSets).mockImplementation(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  const { close, refresh } = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Completion"),
    "completed",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Apply to 2 sets" }),
  );
  expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Back to selection" }),
  ).toBeDisabled();
  reject(new Error("A selected set changed; nothing was changed."));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh history");
  expect(
    screen.getByRole("region", { name: "Batch preview" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Apply to 2 sets" }),
  ).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh history" }),
  );
  expect(refresh).toHaveBeenCalled();
});

it("disables numeric fields across mixed units but permits shared completion", async () => {
  vi.mocked(api.bulkUpdateSets).mockResolvedValue({ affected_count: 3 });
  mount([
    {
      ...workout,
      exercises: [
        item,
        { ...item, id: "i2", weight_unit: "lb", sets: [{ ...set, id: "s3" }] },
      ],
    },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  expect(screen.getByLabelText("Weight (kg)")).toBeDisabled();
  expect(screen.getByLabelText("Reps")).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByLabelText("Completion"),
    "completed",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Apply to 3 sets" }),
  );
  expect(api.bulkUpdateSets).toHaveBeenCalledWith(
    expect.objectContaining({ changes: { is_completed: true } }),
  );
});

it("uses saved cardio fields and prevents an empty update", async () => {
  mount([
    {
      ...workout,
      exercises: [
        {
          ...item,
          tracking_type: "cardio",
          distance_unit: "mi",
          sets: [
            {
              ...set,
              weight: null,
              reps: null,
              distance: "3.000",
              duration_seconds: 1200,
            },
          ],
        },
      ],
    },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  expect(screen.queryByLabelText("Weight (kg)")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Distance (mi)")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose at least one change",
  );
  await userEvent.type(screen.getByLabelText("Duration (seconds)"), "1500");
  await userEvent.click(
    screen.getByRole("button", { name: "Preview changes" }),
  );
  expect(screen.getByText(/After: 3.000 mi · 1500 sec/)).toBeInTheDocument();
});

it("caps Select all at 100 without selecting unseen rows", async () => {
  mount([
    {
      ...workout,
      exercises: [
        {
          ...item,
          sets: Array.from({ length: 101 }, (_, n) => ({
            ...set,
            id: `s${n}`,
          })),
        },
      ],
    },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Select all editable sets" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("100 sets selected");
  const checkboxes = screen.getAllByRole("checkbox");
  expect(checkboxes[100]).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Clear selection" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("0 sets selected"),
  );
});
