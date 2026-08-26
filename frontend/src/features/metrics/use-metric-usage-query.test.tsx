import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { getMetricUsage } from "./metric-usage-api";
import { useMetricUsageQuery } from "./use-metric-usage-query";

vi.mock("./metric-usage-api", () => ({
  getMetricUsage: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useMetricUsageQuery", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns active custom metric usage", async () => {
    vi.mocked(getMetricUsage).mockResolvedValueOnce({
      active_custom_metrics: {
        used: 2,
        limit: 3,
      },
    });

    const { result } = renderHook(() => useMetricUsageQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      active_custom_metrics: {
        used: 2,
        limit: 3,
      },
    });
    expect(getMetricUsage).toHaveBeenCalledOnce();
  });
});
