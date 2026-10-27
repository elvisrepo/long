import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TrackingDateControls } from "./tracking-date-controls";

it("opens a compact date picker and selects an older date", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(
    <TrackingDateControls
      day="2026-10-27"
      today="2026-10-27"
      onSelectDay={select}
    />,
  );
  const field = screen.getByLabelText("Tracking date");
  expect(field).not.toBeVisible();
  const calendar = screen.getByRole("button", { name: "Choose date" });
  await user.click(calendar);
  expect(field).toBeVisible();
  fireEvent.change(field, { target: { value: "2026-09-01" } });
  expect(select).toHaveBeenCalledWith("2026-09-01");
  expect(field).not.toBeVisible();
  expect(calendar).toHaveFocus();
});

it("dismisses with Escape or an outside click without changing the date", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(
    <TrackingDateControls
      day="2026-09-01"
      today="2026-10-27"
      onSelectDay={select}
    />,
  );
  const calendar = screen.getByRole("button", { name: "Choose date" });
  await user.click(calendar);
  await user.keyboard("{Escape}");
  expect(screen.getByLabelText("Tracking date")).not.toBeVisible();
  expect(calendar).toHaveFocus();
  await user.click(calendar);
  await user.click(document.body);
  expect(screen.getByLabelText("Tracking date")).not.toBeVisible();
  expect(select).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Today" }));
  expect(select).toHaveBeenCalledWith("2026-10-27");
});
