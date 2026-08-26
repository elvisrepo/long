import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-session", () => ({
  getAccessToken: vi.fn(),
}));

import { getAccessToken } from "./auth-session";
import { getMe } from "./auth-me-api.ts";

describe("getMe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the stored access token to fetch the current user", async () => {
    vi.mocked(getAccessToken).mockReturnValue("test-access-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ email: "user@example.com" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await getMe();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me/", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-access-token",
      },
    });

    expect(result).toEqual({
      email: "user@example.com",
    });
  });

  it("throws when there is no access token in session", async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);

    await expect(getMe()).rejects.toThrow("Missing access token");
  });

  it("preserves backend error detail when the me request fails", async () => {
    vi.mocked(getAccessToken).mockReturnValue("test-access-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Token is invalid." }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(getMe()).rejects.toThrow("Token is invalid.");
  });
  it("throws a generic error when the me request fails without detail", async () => {
    vi.mocked(getAccessToken).mockReturnValue("test-access-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 401,
      }),
    );

    await expect(getMe()).rejects.toThrow("Failed to fetch current user");
  });
});
