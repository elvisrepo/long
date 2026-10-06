import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutExportDialog } from "./workout-export-dialog";
import type { Workout } from "./workout-api";
const source: Workout = {
  id: "w",
  name: "Workout",
  performed_on: "2026-10-03",
  notes: "Private note",
  is_finished: false,
  created_at: "",
  completed_set_count: 0,
  exercises: [],
};

it("previews without notes, copies only on request and offers manual copy after clipboard rejection", async () => {
  const user = userEvent.setup();
  const write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("Denied"));
  render(<WorkoutExportDialog workout={source} onClose={vi.fn()} />);
  expect(write).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText("Workout summary") as HTMLTextAreaElement).value,
  ).not.toContain("Private note");
  await user.click(
    screen.getByLabelText("Include session notes and set comments"),
  );
  expect(
    (screen.getByLabelText("Workout summary") as HTMLTextAreaElement).value,
  ).toContain("Private note");
  await user.click(screen.getByRole("button", { name: "Copy summary" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "copy the preview manually",
  );
  write.mockResolvedValue();
  await user.click(screen.getByRole("button", { name: "Copy summary" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Summary copied");
});
