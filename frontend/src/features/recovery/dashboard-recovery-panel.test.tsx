import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardRecoveryPanel } from "./dashboard-recovery-panel";
import { getRecoveryEntries, getRecoveryTools } from "./recovery-api";

vi.mock("./recovery-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date("2026-10-01T12:00:00"));
  vi.mocked(getRecoveryTools).mockResolvedValue({
    can_create_custom: false,
    tools: [
      {
        id: "massage",
        name: "Massage",
        description: "",
        is_active: true,
        is_custom: false,
        evidence: null,
      },
    ],
  });
  vi.mocked(getRecoveryEntries).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

it("shows an honest empty state for all accounts", async () => {
  showPanel();
  expect(await screen.findByText("0 activities today")).toBeInTheDocument();
  expect(screen.getByText("0 of 7 days recorded")).toBeInTheDocument();
});

it("does not present unavailable data as zero activity", async () => {
  vi.mocked(getRecoveryEntries).mockRejectedValue(new Error("Offline"));
  showPanel();
  expect(
    await screen.findByText(
      "Recovery activities couldn't load. Open Recovery to retry.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("0 activities today")).not.toBeInTheDocument();
});

it("shows loading while activity data is unresolved", () => {
  vi.mocked(getRecoveryEntries).mockImplementation(() => new Promise(() => {}));
  showPanel();
  expect(screen.getByText("Loading recovery activities…")).toBeInTheDocument();
});
function showPanel() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DashboardRecoveryPanel />
    </QueryClientProvider>,
  );
}

it("shows today's tools and distinct recorded days without a recovery score", async () => {
  vi.mocked(getRecoveryEntries).mockResolvedValue([
    { id: 1, tool_id: "massage", performed_on: "2026-10-01", created_at: "" },
    { id: 2, tool_id: "massage", performed_on: "2026-09-30", created_at: "" },
    { id: 3, tool_id: "archived", performed_on: "2026-09-30", created_at: "" },
  ]);
  showPanel();
  expect(await screen.findByText("1 activity today")).toBeInTheDocument();
  expect(screen.getByText("2 of 7 days recorded")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Track recovery →" }),
  ).toHaveAttribute("href", "/recovery");
  expect(getRecoveryEntries).toHaveBeenCalledWith("2026-09-25", "2026-10-01");
});
