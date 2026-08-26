import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscriptionPortal } from "./subscriptions-api";
import { useCreateSubscriptionPortalMutation } from "./use-create-subscription-portal-mutation";

vi.mock("./subscriptions-api", () => ({
  createSubscriptionPortal: vi.fn(),
}));

const createSubscriptionPortalMock = vi.mocked(createSubscriptionPortal);

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCreateSubscriptionPortalMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Customer Portal session", async () => {
    const queryClient = new QueryClient();

    createSubscriptionPortalMock.mockResolvedValue({
      url: "https://billing.stripe.com/p/test-session",
    });

    const { result } = renderHook(() => useCreateSubscriptionPortalMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(createSubscriptionPortalMock).toHaveBeenCalledOnce();
  });
});
