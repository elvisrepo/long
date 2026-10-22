import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
it("requires restoring an archived section before restoring its foods", async () => {
  const section = {
    id: "s",
    name: "Protein",
    display_order: 10,
    is_active: false,
  };
  const food = {
    id: "f",
    section_id: "s",
    name: "Chicken",
    display_order: 10,
    is_active: false,
  };
  vi.mocked(getDietCatalog).mockImplementation(async () => ({
    sections: [{ ...section }],
    foods: [{ ...food }],
  }));
  vi.mocked(saveDietItem).mockImplementation(async (kind, _id, data) => {
    const item = kind === "sections" ? section : food;
    Object.assign(item, data);
    return { ...item };
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Manage checklist" }),
  );
  await userEvent.click(screen.getByLabelText("Actions for Chicken"));
  expect(
    screen.getByRole("button", { name: "Restore Chicken" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByLabelText("Actions for Protein"));
  await userEvent.click(
    screen.getByRole("button", { name: "Restore Protein" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Restore Chicken" }),
    ).toBeEnabled(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Restore Chicken" }),
  );
  await waitFor(() =>
    expect(saveDietItem).toHaveBeenLastCalledWith("foods", "f", {
      is_active: true,
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Done managing" }));
  expect(
    await screen.findByRole("checkbox", { name: "Chicken" }),
  ).toBeEnabled();
});
it("keeps date, recent history and archived recorded-food undo above the checklist", async () => {
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
        is_active: false,
      },
    ],
  });
  vi.mocked(getDietEntries).mockResolvedValue([
    {
      id: 1,
      food_id: "f",
      performed_on: "2026-10-01",
      created_at: "2026-10-01T10:00:00Z",
    },
  ]);
  mount();
  const context = await screen.findByRole("region", { name: "Daily tracking" });
  expect(within(context).getByLabelText("Tracking date")).toBeInTheDocument();
  expect(
    within(context).getAllByRole("button", { name: /October|September/ }),
  ).toHaveLength(7);
  const section = screen.getByRole("region", { name: "Protein" });
  expect(
    context.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await userEvent.click(within(context).getByText(/Recorded foods/));
  await userEvent.click(
    within(context).getByRole("button", { name: "Remove Chicken check-off" }),
  );
  expect(setDietCheckoff).toHaveBeenCalledWith("f", "2026-10-01", false);
});
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
it("uses management menus and returns edit-dialog focus to the food action", async () => {
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
  const checkbox = await screen.findByRole("checkbox", { name: "Chicken" });
  expect(screen.queryByText("Actions for Chicken")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Manage checklist" }),
  );
  expect(checkbox).toBeDisabled();
  const action = screen.getByLabelText("Actions for Chicken");
  await userEvent.click(action);
  await userEvent.click(screen.getByRole("button", { name: "Edit Chicken" }));
  expect(screen.getByLabelText("Food name")).toHaveValue("Chicken");
  expect(screen.getByLabelText("Display order")).toHaveValue(10);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(action).toHaveFocus();
  expect(saveDietItem).not.toHaveBeenCalled();
  await userEvent.click(action);
  await userEvent.click(screen.getByRole("button", { name: "Edit Chicken" }));
  fireEvent.change(screen.getByLabelText("Food name"), {
    target: { value: "Eggs" },
  });
  fireEvent.change(screen.getByLabelText("Display order"), {
    target: { value: "0" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveDietItem).toHaveBeenCalledWith("foods", "f", {
      name: "Eggs",
      display_order: 0,
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

it("shows loading instead of zero foods while a selected date is fetching", async () => {
  let resolveDay!: (entries: []) => void;
  vi.mocked(getDietEntries).mockImplementation(async (from, to) => {
    if (from === "2026-09-20" && from === to)
      return new Promise<[]>((resolve) => {
        resolveDay = resolve;
      });
    return [];
  });
  mount();
  await screen.findByText("Build your food checklist");
  fireEvent.change(screen.getByLabelText("Tracking date"), {
    target: { value: "2026-09-20" },
  });
  expect(await screen.findByText("Loading foods…")).toBeInTheDocument();
  expect(screen.queryByText(/0 foods recorded/)).not.toBeInTheDocument();
  resolveDay([]);
  expect(await screen.findByText(/0 foods recorded/)).toBeInTheDocument();
});
