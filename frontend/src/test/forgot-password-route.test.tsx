import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderRoute } from "./render-route";
import { requestPasswordReset } from "../features/auth/password-reset-api";

vi.mock("../features/auth/password-reset-api", () => ({
  requestPasswordReset: vi.fn(),
}));

describe("forgot password route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the reset request form at /forgot-password", async () => {
    renderRoute("/forgot-password");

    expect(
      await screen.findByRole("heading", { name: /forgot password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send reset link/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("requests a reset link and shows the generic completion message", async () => {
    const user = userEvent.setup();
    vi.mocked(requestPasswordReset).mockResolvedValue();
    renderRoute("/forgot-password");

    await user.type(
      await screen.findByLabelText(/email/i),
      "person@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(requestPasswordReset).toHaveBeenCalledWith("person@example.com");
    expect(
      await screen.findByText(
        /if an account exists, a reset link has been sent/i,
      ),
    ).toBeInTheDocument();
  });
});
