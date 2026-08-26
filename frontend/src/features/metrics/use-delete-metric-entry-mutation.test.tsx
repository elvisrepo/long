import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteMetricEntry } from "./metric-entries-api";
import { useDeleteMetricEntryMutation } from "./use-delete-metric-entry-mutation";

vi.mock("./metric-entries-api", () => ({
  deleteMetricEntry: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useDeleteMetricEntryMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes a metric entry and invalidates metric entry queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(deleteMetricEntry).mockResolvedValue();

    const { result } = renderHook(() => useDeleteMetricEntryMutation(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(1);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(deleteMetricEntry).toHaveBeenCalledWith(1);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["metric-entries"],
    });
  });
});
