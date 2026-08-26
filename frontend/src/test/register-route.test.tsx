import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderRoute } from "./render-route";

import userEvent from "@testing-library/user-event";
import { registerWeb } from "../features/auth/register-api";

vi.mock("../features/auth/register-api", () => ({
  registerWeb: vi.fn(),
}));

describe("register route", () => {
  it("renders the register heading at /register", async () => {
    renderRoute("/register");

    expect(
      await screen.findByRole("heading", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("renders an email input at /register", async () => {
    renderRoute("/register");

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("renders a password input at /register", async () => {
    renderRoute("/register");

    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a submit button at /register", async () => {
    renderRoute("/register");

    expect(
      await screen.findByRole("button", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("submits registration values to registerWeb from /register", async () => {
    const user = userEvent.setup();

    vi.mocked(registerWeb).mockResolvedValue();

    renderRoute("/register");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /register/i }));

    expect(registerWeb).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret123",
    });
  });

  it("redirects to /login after successful registration", async () => {
    const user = userEvent.setup();

    vi.mocked(registerWeb).mockResolvedValue();

    renderRoute("/register");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /register/i }));

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("shows the registration error when registerWeb rejects", async () => {
    const user = userEvent.setup();

    vi.mocked(registerWeb).mockRejectedValue(
      new Error("A user with this email already exists."),
    );

    renderRoute("/register");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/a user with this email already exists\./i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /register/i }),
    ).toBeInTheDocument();
  });

  it("disables the register button while registration is in progress", async () => {
    const user = userEvent.setup();
    let resolveRegister: (() => void) | undefined;

    vi.mocked(registerWeb).mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = () => resolve();
      }),
    );

    renderRoute("/register");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");

    const submitButton = await screen.findByRole("button", {
      name: /register/i,
    });

    await user.click(submitButton);

    expect(submitButton).toBeDisabled();

    resolveRegister?.();
  });

  it("clears a previous registration error after a successful submit", async () => {
    const user = userEvent.setup();

    vi.mocked(registerWeb)
      .mockRejectedValueOnce(
        new Error("A user with this email already exists."),
      )
      .mockResolvedValueOnce();

    renderRoute("/register");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /register/i }));

    expect(
      await screen.findByText(/a user with this email already exists\./i),
    ).toBeInTheDocument();

    await user.clear(await screen.findByLabelText(/email/i));
    await user.type(await screen.findByLabelText(/email/i), "new@example.com");
    await user.click(await screen.findByRole("button", { name: /register/i }));

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(/a user with this email already exists\./i),
    ).not.toBeInTheDocument();
  });
});
