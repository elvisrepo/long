import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMetricEntries } from "./metric-entries-api";
import { useDashboardMetricEntriesQuery } from "./use-dashboard-metric-entries-query";

vi.mock("./metric-entries-api", () => ({
  getMetricEntries: vi.fn(),
}));

describe("useDashboardMetricEntriesQuery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("loads a bounded recent slice for every metric independently", async () => {
    vi.mocked(getMetricEntries).mockImplementation(async ({ metric }) => [
      {
        id: metric === "steps" ? 1 : 2,
        metric_definition: metric ?? "",
        value: metric === "steps" ? 45 : 83.2,
        period_start: null,
        recorded_at: "2026-09-28T12:00:00Z",
        source: "fitbit",
        context: {},
        created_at: "2026-09-28T12:00:01Z",
      },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useDashboardMetricEntriesQuery(["steps", "hrv", "body_weight"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getMetricEntries).toHaveBeenCalledWith({
      metric: "steps",
      limit: 7,
      daily: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    expect(getMetricEntries).toHaveBeenCalledWith({
      metric: "hrv",
      limit: 7,
      daily: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    expect(getMetricEntries).toHaveBeenCalledWith({
      metric: "body_weight",
      limit: 50,
    });
    expect(result.current.data.map((entry) => entry.metric_definition)).toEqual(
      ["steps", "hrv", "body_weight"],
    );
  });
});
