import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMetricEntry } from "./metric-entries-api";
import { getConsistencyAnalytics } from "./consistency-analytics-api";
import { useConsistencyAnalyticsQuery } from "./use-consistency-analytics-query";
import { useCreateMetricEntryMutation } from "./use-create-metric-entry-mutation";

vi.mock("./metric-entries-api", () => ({
  createMetricEntry: vi.fn(),
}));
vi.mock("./consistency-analytics-api", () => ({
  getConsistencyAnalytics: vi.fn(),
}));

const createMetricEntryMock = vi.mocked(createMetricEntry);
const getConsistencyAnalyticsMock = vi.mocked(getConsistencyAnalytics);

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCreateMetricEntryMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a metric entry and invalidates metric-entry list queries", async () => {
    const queryClient = new QueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: "resting_hr",
      value: 58,
      recorded_at: "2026-03-05T07:15:00Z",
      source: "manual",
      context: {},
      created_at: "2026-03-05T07:15:02Z",
    });

    const { result } = renderHook(() => useCreateMetricEntryMutation(), {
      wrapper: createWrapper(queryClient),
    });

    const input = {
      metricDefinition: "resting_hr",
      value: 58,
      recordedAt: "2026-03-05T07:15:00Z",
      context: {},
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(createMetricEntryMock).toHaveBeenCalledWith(input);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["metric-entries"],
    });
  });

  it("refetches active consistency coverage after creating an entry", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    getConsistencyAnalyticsMock.mockResolvedValue({
      range_days: 7,
      dates: [],
      metrics: [],
      summary: {
        metrics_with_data: 1,
        total_metrics: 1,
        days_with_any_data: 1,
      },
    });
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: "resting_hr",
      value: 58,
      recorded_at: "2026-09-29T12:00:00Z",
      source: "manual",
      context: {},
      created_at: "2026-09-29T12:00:01Z",
    });
    const { result } = renderHook(
      () => ({
        mutation: useCreateMetricEntryMutation(),
        consistency: useConsistencyAnalyticsQuery(),
      }),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() =>
      expect(getConsistencyAnalyticsMock).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      await result.current.mutation.mutateAsync({
        metricDefinition: "resting_hr",
        value: 58,
        recordedAt: "2026-09-29T12:00:00Z",
        context: {},
      });
    });

    await waitFor(() =>
      expect(getConsistencyAnalyticsMock).toHaveBeenCalledTimes(2),
    );
  });
});
