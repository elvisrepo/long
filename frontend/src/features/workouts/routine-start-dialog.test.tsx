import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { RoutineStartDialog } from "./routine-start-dialog";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
const set: api.RoutineSet = {
  id: "s",
  weight: null,
  reps: 8,
  distance: null,
  duration_seconds: null,
  display_order: 10,
};
const exercise: api.RoutineExercise = {
  id: "i",
  exercise_id: "e",
  exercise_name: "Bench",
  category_name: "Chest",
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  display_order: 10,
  sets: [set],
};
const preview: api.RoutineStartPreview = {
  day_id: "d",
  name: "Plan · Push",
  notes: "",
  performed_on: "2026-10-03",
  carry_forward: false,
  preview_token: "a".repeat(64),
  exercises: [
    {
      ...exercise,
      carry_reason: "Carry off",
      sets: [{ ...set, source: null }],
    },
  ],
};

function mount() {
  const navigate = vi.fn();
  const close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RoutineStartDialog
        owner="owner"
        dayId="d"
        destination="2026-10-03"
        busy={false}
        run={(action) => {
          void action();
        }}
        navigate={navigate}
        onClose={close}
      />
    </QueryClientProvider>,
  );
  return { navigate, close };
}

it("shows a read-only template preview and explicitly switches to carried values before starting", async () => {
  vi.mocked(api.getRoutineStartPreview).mockImplementation(
    async (_id, _date, carry) =>
      carry
        ? {
            ...preview,
            carry_forward: true,
            preview_token: "b".repeat(64),
            exercises: [
              {
                ...exercise,
                carry_reason: "Blank fields only",
                sets: [
                  {
                    ...set,
                    weight: "100.000",
                    source: {
                      workout_id: "w",
                      item_id: "past",
                      set_id: "old",
                      date: "2026-10-02",
                      fields: ["weight"],
                    },
                  },
                ],
              },
            ],
          }
        : preview,
  );
  vi.mocked(api.startRoutineDay).mockResolvedValue({
    performed_on: "2026-10-03",
  } as api.Workout);
  const { navigate } = mount();
  expect(await screen.findByText("8 reps")).toBeInTheDocument();
  expect(api.startRoutineDay).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "Fill blank fields from earlier completed sets",
    }),
  );
  expect(await screen.findByText("100 kg · 8 reps")).toBeInTheDocument();
  expect(screen.getByText(/2026-10-02.*weight/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Start planned workout" }),
  );
  await waitFor(() =>
    expect(api.startRoutineDay).toHaveBeenCalledWith("d", "2026-10-03", {
      carry_forward: true,
      preview_token: "b".repeat(64),
      selection: [{ item_id: "i", set_ids: ["s"] }],
    }),
  );
  expect(navigate).toHaveBeenCalledWith({ view: "home", date: "2026-10-03" });
});

it("does not invent empty history after read errors and cancellation never starts a workout", async () => {
  vi.mocked(api.getRoutineStartPreview)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(preview);
  const { close } = mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Routine preview couldn't load",
  );
  expect(
    screen.getByRole("button", { name: "Start planned workout" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh preview" }),
  );
  expect(await screen.findByText("8 reps")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Clear selection" }),
  );
  expect(
    screen.getByRole("button", { name: "Start planned workout" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Select all" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalled();
  expect(api.startRoutineDay).not.toHaveBeenCalled();
});

it("locks pending confirmation and requires a refreshed token after a stale-preview error", async () => {
  vi.mocked(api.getRoutineStartPreview).mockResolvedValue(preview);
  let reject!: (reason: Error) => void;
  vi.mocked(api.startRoutineDay).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  mount();
  await screen.findByText("8 reps");
  const start = screen.getByRole("button", { name: "Start planned workout" });
  await userEvent.click(start);
  expect(start).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.getByRole("checkbox", {
      name: "Fill blank fields from earlier completed sets",
    }),
  ).toBeDisabled();
  reject(new Error("Previous performance changed. Refresh the preview."));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Refresh the preview",
  );
  expect(start).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "Include routine exercise 1 set 1" }),
  ).toBeChecked();
  vi.mocked(api.getRoutineStartPreview).mockResolvedValue({
    ...preview,
    preview_token: "c".repeat(64),
  });
  vi.mocked(api.startRoutineDay).mockResolvedValue({
    performed_on: "2026-10-03",
  } as api.Workout);
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh preview" }),
  );
  await waitFor(() => expect(start).toBeEnabled());
  await userEvent.click(start);
  expect(api.startRoutineDay).toHaveBeenLastCalledWith("d", "2026-10-03", {
    carry_forward: false,
    preview_token: "c".repeat(64),
    selection: [{ item_id: "i", set_ids: ["s"] }],
  });
});
