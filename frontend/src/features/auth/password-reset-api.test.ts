import { afterEach, describe, expect, it, vi } from "vitest";

import {
  confirmPasswordReset,
  requestPasswordReset,
} from "./password-reset-api";

describe("requestPasswordReset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the email to the password reset request endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 202,
      }),
    );

    await requestPasswordReset("person@example.com");

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password/request/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "person@example.com" }),
    });
  });
});

describe("confirmPasswordReset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the token and new password to the confirm endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await confirmPasswordReset({
      uid: "encoded-user-id",
      token: "reset-token",
      newPassword: "new-strong-password-456",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password/confirm/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: "encoded-user-id",
        token: "reset-token",
        new_password: "new-strong-password-456",
      }),
    });
  });
});
