import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderRoute } from "./render-route";
import { confirmPasswordReset } from "../features/auth/password-reset-api";

vi.mock("../features/auth/password-reset-api", () => ({
  confirmPasswordReset: vi.fn(),
}));

describe("reset password route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the password form for a valid reset link", async () => {
    renderRoute("/reset-password?uid=encoded-user-id&token=reset-token");

    expect(
      await screen.findByRole("heading", { name: /reset password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reset password/i }),
    ).toBeInTheDocument();
  });

  it("submits the link credentials and new password", async () => {
    const user = userEvent.setup();
    vi.mocked(confirmPasswordReset).mockResolvedValue();
    renderRoute("/reset-password?uid=encoded-user-id&token=reset-token");

    await user.type(
      await screen.findByLabelText(/^new password$/i),
      "new-strong-password-456",
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "new-strong-password-456",
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(confirmPasswordReset).toHaveBeenCalledWith({
      uid: "encoded-user-id",
      token: "reset-token",
      newPassword: "new-strong-password-456",
    });
    expect(
      await screen.findByText(/password has been reset successfully/i),
    ).toBeInTheDocument();
  });
});
