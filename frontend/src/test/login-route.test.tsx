import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderRoute } from "./render-route";

describe("login route", () => {
  it("renders the login heading at /login", async () => {
    renderRoute("/login");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("renders an email input at /login", async () => {
    renderRoute("/login");

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("renders a password input at /login", async () => {
    renderRoute("/login");

    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a submit button at /login", async () => {
    renderRoute("/login");

    expect(
      await screen.findByRole("button", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("allows the user to type email and password", async () => {
    const user = userEvent.setup();

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");

    expect(emailInput).toHaveValue("user@example.com");
    expect(passwordInput).toHaveValue("secret123");
  });
});
