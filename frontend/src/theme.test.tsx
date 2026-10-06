import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeToggle } from "./components/theme-toggle";
import { setTheme } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  act(() => setTheme("dark"));
  localStorage.clear();
});

it("offers only dark and light themes and saves the selected preference", async () => {
  const user = userEvent.setup();
  render(<ThemeToggle />);
  await user.tab();
  const selector = screen.getByRole("combobox", { name: "Color theme" });
  expect(selector).toHaveFocus();
  expect(selector).toHaveTextContent("DarkLight");
  expect(selector.querySelectorAll("option")).toHaveLength(2);
  for (const theme of ["light", "dark"]) {
    await user.selectOptions(selector, theme);
    expect(document.documentElement).toHaveAttribute("data-theme", theme);
    expect(localStorage.getItem("longevity-theme")).toBe(theme);
  }
});

it("still switches when storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage disabled", "SecurityError");
  });
  render(<ThemeToggle />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Color theme" }),
    "light",
  );
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
});

it("reflects a preference changed or cleared in another tab", () => {
  render(<ThemeToggle />);
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "longevity-theme",
        newValue: "sand",
      }),
    ),
  );
  expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue(
    "dark",
  );
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue(
    "dark",
  );
});
