import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-me-api", () => ({
  getMe: vi.fn(),
}));

import { getMe } from "./auth-me-api";
import { useMeQuery } from "./use-me-query";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMeQuery", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns the current user when getMe succeeds", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    const { result } = renderHook(() => useMeQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      email: "user@example.com",
    });
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it("returns an error state when getMe fails", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("Token is invalid."));

    const { result } = renderHook(() => useMeQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error("Token is invalid."));
  });
});
