import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMetricEntry } from "./metric-entries-api";
import { useCreateMetricEntryMutation } from "./use-create-metric-entry-mutation";

vi.mock("./metric-entries-api", () => ({
  createMetricEntry: vi.fn(),
}));

const createMetricEntryMock = vi.mocked(createMetricEntry);

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
});
