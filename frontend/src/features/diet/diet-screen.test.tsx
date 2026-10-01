import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DietScreen } from "./diet-screen";
import {
  getDietCatalog,
  getDietEntries,
  saveDietItem,
  setDietCheckoff,
} from "./diet-api";
vi.mock("./diet-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DietScreen />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-10-01T12:00:00"));
  vi.mocked(getDietCatalog).mockResolvedValue({ sections: [], foods: [] });
  vi.mocked(getDietEntries).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
it("starts empty and allows section creation on any account", async () => {
  mount();
  expect(
    await screen.findByText("Build your food checklist"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add section" }));
  await userEvent.type(screen.getByLabelText("Section name"), "Protein");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveDietItem).toHaveBeenCalledWith("sections", undefined, {
      name: "Protein",
    }),
  );
});
it("records the selected date without moving the today-anchored history", async () => {
  vi.mocked(getDietCatalog).mockResolvedValue({
    sections: [
      { id: "s", name: "Protein", display_order: 10, is_active: true },
    ],
    foods: [
      {
        id: "f",
        section_id: "s",
        name: "Chicken",
        display_order: 10,
        is_active: true,
      },
    ],
  });
  mount();
  await screen.findByLabelText("Chicken");
  fireEvent.change(screen.getByLabelText("Tracking date"), {
    target: { value: "2026-09-20" },
  });
  await waitFor(() =>
    expect(getDietEntries).toHaveBeenCalledWith("2026-09-20", "2026-09-20"),
  );
  await userEvent.click(screen.getByLabelText("Chicken"));
  await waitFor(() =>
    expect(setDietCheckoff).toHaveBeenCalledWith("f", "2026-09-20", true),
  );
  expect(getDietEntries).toHaveBeenCalledWith("2026-09-25", "2026-10-01");
  expect(
    screen.getByRole("button", { name: /Thursday 1 October/ }),
  ).toBeInTheDocument();
});
it("shows errors rather than claiming a failed check-off was saved", async () => {
  vi.mocked(getDietCatalog).mockResolvedValue({
    sections: [
      { id: "s", name: "Protein", display_order: 10, is_active: true },
    ],
    foods: [
      {
        id: "f",
        section_id: "s",
        name: "Chicken",
        display_order: 10,
        is_active: true,
      },
    ],
  });
  vi.mocked(setDietCheckoff).mockRejectedValue(new Error("Could not save"));
  mount();
  await userEvent.click(await screen.findByLabelText("Chicken"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByLabelText("Chicken")).not.toBeChecked();
});
