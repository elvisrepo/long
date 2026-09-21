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

it("supports keyboard switching and saves the preference", async () => {
  const user = userEvent.setup();
  render(<ThemeToggle />);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(
    screen.getByRole("button", { name: "Switch to dark theme" }),
  ).toHaveFocus();
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("longevity-theme")).toBe("light");
});

it("still switches when storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage disabled", "SecurityError");
  });
  render(<ThemeToggle />);
  await userEvent.click(
    screen.getByRole("button", { name: "Switch to light theme" }),
  );
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
});

it("reflects a preference changed or cleared in another tab", () => {
  render(<ThemeToggle />);
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "longevity-theme",
        newValue: "light",
      }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeInTheDocument();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(
    screen.getByRole("button", { name: "Switch to light theme" }),
  ).toBeInTheDocument();
});
