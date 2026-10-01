import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardDietPanel } from "./dashboard-diet-panel";
import { getDietCatalog, getDietEntries } from "./diet-api";
vi.mock("./diet-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-10-01T12:00:00"));
  vi.mocked(getDietCatalog).mockResolvedValue({
    sections: [],
    foods: [
      {
        id: "f",
        name: "Chicken",
        section_id: "s",
        is_active: false,
        display_order: 10,
      },
    ],
  });
  vi.mocked(getDietEntries).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DashboardDietPanel />
    </QueryClientProvider>,
  );
}
it("shows a useful empty summary on every plan", async () => {
  mount();
  expect(
    await screen.findByText("No foods recorded today."),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Track foods →" })).toHaveAttribute(
    "href",
    "/diet",
  );
});
it("includes archived foods and counts distinct recorded days", async () => {
  vi.mocked(getDietEntries).mockResolvedValue([
    { id: 1, food_id: "f", performed_on: "2026-10-01", created_at: "" },
    { id: 2, food_id: "f", performed_on: "2026-09-30", created_at: "" },
  ]);
  mount();
  expect(await screen.findByText("Today: Chicken")).toBeInTheDocument();
  expect(screen.getByText(/Foods recorded on 2 of/)).toBeInTheDocument();
  expect(getDietEntries).toHaveBeenCalledWith("2026-09-25", "2026-10-01");
});
it("does not turn a loading error into a zero summary", async () => {
  vi.mocked(getDietEntries).mockRejectedValue(new Error("offline"));
  mount();
  expect(
    await screen.findByText("Diet couldn't load. Open Diet to retry."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("No foods recorded today."),
  ).not.toBeInTheDocument();
});
