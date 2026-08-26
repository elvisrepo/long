import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSubscription } from "./subscriptions-api";
import { useCurrentSubscriptionQuery } from "./use-current-subscription-query";

vi.mock("./subscriptions-api", () => ({
  getCurrentSubscription: vi.fn(),
}));

const getCurrentSubscriptionMock = vi.mocked(getCurrentSubscription);

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCurrentSubscriptionQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the current authenticated user subscription", async () => {
    const queryClient = new QueryClient();

    getCurrentSubscriptionMock.mockResolvedValue({
      id: "subscription-id",
      status: "active",
      billing_portal_available: false,
      current_period_start: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
      price: null,
      plan: {
        code: "free",
        name: "Free",
        active_custom_metric_limit: 3,
        wearable_connection_limit: 1,
        automatic_sync_enabled: false,
        sync_interval_minutes: 30,
        analytics_enabled: false,
        csv_import_enabled: false,
      },
    });

    const { result } = renderHook(() => useCurrentSubscriptionQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getCurrentSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.plan.code).toBe("free");
  });
});
