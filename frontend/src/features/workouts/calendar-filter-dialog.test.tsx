import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CalendarFilterDialog } from "./calendar-filter-dialog";
import { emptyCalendarFilters } from "./calendar-filters";
it("keeps filter changes local until Apply and retains an invalid numeric draft", async () => {
  const apply = vi.fn(),
    close = vi.fn();
  render(
    <CalendarFilterDialog
      filters={emptyCalendarFilters()}
      exercises={new Map([["bench", "Bench"]])}
      categories={["Chest", "Triceps"]}
      colour={() => "#dc2626"}
      busy={false}
      onApply={apply}
      onClose={close}
    />,
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Calendar exercise" }),
    "bench",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Chest", exact: true }),
  );
  expect(apply).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("Weight value"), "100.0001");
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("three decimal places");
  await userEvent.clear(screen.getByLabelText("Weight value"));
  await userEvent.type(screen.getByLabelText("Weight value"), "100");
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      exercise: { id: "bench", name: "Bench" },
      categories: ["Chest"],
      weight: { operator: "gte", value: "100" },
    }),
  );
  expect(close).toHaveBeenCalled();
});
it("uses the recorded weight unit for the selected exercise", async () => {
  const apply = vi.fn();
  render(
    <CalendarFilterDialog
      filters={emptyCalendarFilters()}
      exercises={new Map([["bench", "Bench"]])}
      weightUnits={new Map([["bench", "lb"]])}
      categories={[]}
      colour={() => "#81909c"}
      busy={false}
      onApply={apply}
      onClose={vi.fn()}
    />,
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Calendar exercise" }),
    "bench",
  );
  expect(screen.getByRole("combobox", { name: "Weight unit" })).toHaveValue(
    "lb",
  );
});

it("discards a changed draft when cancelled", async () => {
  const apply = vi.fn(),
    close = vi.fn();
  render(
    <CalendarFilterDialog
      filters={emptyCalendarFilters()}
      exercises={new Map()}
      categories={["Chest"]}
      colour={() => "#dc2626"}
      busy={false}
      onApply={apply}
      onClose={close}
    />,
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Chest", exact: true }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(apply).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
