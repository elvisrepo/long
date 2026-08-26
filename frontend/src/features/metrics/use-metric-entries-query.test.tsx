import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMetricEntries } from "./metric-entries-api";
import { useMetricEntriesQuery } from "./use-metric-entries-query";

vi.mock("./metric-entries-api", () => ({
  getMetricEntries: vi.fn(),
}));

const getMetricEntriesMock = vi.mocked(getMetricEntries);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep hook tests deterministic: one rejected API call should surface immediately.
        retry: false,
      },
    },
  });

  // React Query hooks need a QueryClientProvider even when the network helper is mocked.
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useMetricEntriesQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metric entries from the API helper", async () => {
    getMetricEntriesMock.mockResolvedValue([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-05T07:15:02Z",
      },
    ]);

    // Run this hook in a test environment, inside a React Query provider, and give me access to what the hook returns.
    const { result } = renderHook(() => useMetricEntriesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-05T07:15:02Z",
      },
    ]);
  });

  it("passes filters to the API helper", async () => {
    getMetricEntriesMock.mockResolvedValue([]);

    const filters = {
      metric: "resting_hr",
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-31T23:59:59Z",
    };

    const { result } = renderHook(() => useMetricEntriesQuery(filters), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getMetricEntriesMock).toHaveBeenCalledWith(filters);
  });
});
