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
  await user.click(screen.getByRole("button", { name: "Options" }));
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

it("shares only selected sets and keeps export details behind Options", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(
    <WorkoutExportDialog
      workout={{
        ...source,
        exercises: [
          {
            id: "e",
            exercise_id: "library",
            exercise_name: "Bench press",
            tracking_type: "strength",
            weight_unit: "kg",
            distance_unit: "km",
            display_order: 1,
            sets: [70, 80].map((weight, index) => ({
              id: `s${index}`,
              weight: String(weight),
              reps: 5,
              distance: null,
              duration_seconds: null,
              comment: "",
              is_completed: true,
              display_order: index,
            })),
          },
        ],
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "Select all" })).toBeChecked();
  expect(screen.queryByLabelText("Workout summary")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("checkbox", { name: "Select Bench press set 1" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Select Bench press" }),
  ).toBePartiallyChecked();
  await user.click(screen.getByRole("button", { name: "Share", exact: true }));
  await user.click(
    screen.getByRole("button", { name: "Copy summary", exact: true }),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining("80 kg"));
  expect(write.mock.lastCall?.[0]).not.toContain("70 kg");
  await user.click(screen.getByRole("checkbox", { name: "Select all" }));
  await user.click(screen.getByRole("checkbox", { name: "Select all" }));
  expect(
    screen.getByRole("button", { name: "Share", exact: true }),
  ).toBeDisabled();
});

it("opens the native share sheet only on request and treats cancellation quietly", async () => {
  const share = vi
    .fn()
    .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  try {
    render(<WorkoutExportDialog workout={source} onClose={vi.fn()} />);
    expect(share).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Share", exact: true }),
    );
    expect(share).toHaveBeenCalledWith({
      title: source.name,
      text: expect.stringContaining(source.performed_on),
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Share", exact: true }),
    ).toBeEnabled();
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});

it("offers WhatsApp, Gmail and Email when native sharing is unavailable without silently copying", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(<WorkoutExportDialog workout={source} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Share", exact: true }));
  expect(screen.getByRole("dialog", { name: "Share to" })).toBeVisible();
  const whatsapp = screen.getByRole("link", { name: "WhatsApp" });
  expect(
    new URL(whatsapp.getAttribute("href")!).searchParams.get("text"),
  ).toContain(source.performed_on);
  expect(whatsapp.getAttribute("href")).not.toContain("Private");
  expect(screen.getByRole("link", { name: "Gmail" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
    "href",
    expect.stringContaining("mailto:"),
  );
  expect(write).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(
    screen.queryByRole("dialog", { name: "Share to" }),
  ).not.toBeInTheDocument();
});

it("offers app choices when the native share request fails", async () => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi.fn().mockRejectedValue(new Error("Unavailable")),
  });
  try {
    render(<WorkoutExportDialog workout={source} onClose={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Share", exact: true }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Share to" }),
    ).toBeVisible();
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});
