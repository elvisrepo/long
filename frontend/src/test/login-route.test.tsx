import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setAccessToken } from "../features/auth/auth-session";
import { getMe } from "../features/auth/auth-me-api";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";

vi.mock("../features/auth/auth-api", () => ({
  loginWeb: vi.fn(),
}));

vi.mock("../features/auth/auth-session", () => ({
  setAccessToken: vi.fn(),
}));

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-definitions-query", () => ({
  useMetricDefinitionsQuery: vi.fn(),
}));

import { renderRoute } from "./render-route";
import { loginWeb } from "../features/auth/auth-api";

function mockLoadedMetricDefinitions() {
  vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
    data: [
      {
        id: "metric-id",
        name: "Resting Heart Rate",
        slug: "resting_hr",
        unit: "bpm",
        category: "cardiovascular",
        min_value: 20,
        max_value: 220,
        is_default: true,
      },
    ],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricDefinitionsQuery>);
}

describe("login route", () => {
  beforeEach(() => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

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

  it("submits credentials to loginWeb from /login", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb).mockResolvedValue({
      access: "test-access-token",
    });

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(loginWeb).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "secret123",
      });
    });
  });

  it("shows the login error message when loginWeb rejects", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb).mockRejectedValue(new Error("Invalid credentials."));

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "wrong-password");
    await user.click(submitButton);

    expect(
      await screen.findByText(/invalid credentials\./i),
    ).toBeInTheDocument();
  });

  it("disables the login button while login is in progress", async () => {
    const user = userEvent.setup();

    let resolveLogin: ((value: { access: string }) => void) | undefined;

    vi.mocked(loginWeb).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();

    resolveLogin?.({ access: "test-access-token" });
  });

  it("clears a previous login error after a successful submit", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb)
      .mockRejectedValueOnce(new Error("Invalid credentials."))
      .mockResolvedValueOnce({ access: "test-access-token" });

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "wrong-password");
    await user.click(submitButton);

    expect(
      await screen.findByText(/invalid credentials\./i),
    ).toBeInTheDocument();

    await user.clear(passwordInput);
    await user.type(passwordInput, "secret123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.queryByText(/invalid credentials\./i),
      ).not.toBeInTheDocument();
    });
  });

  it("redirects to the dashboard after a successful login", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb).mockResolvedValue({
      access: "test-access-token",
    });
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");
    await user.click(submitButton);

    expect(
      await screen.findByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it("stores the access token after a successful login", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb).mockResolvedValue({
      access: "test-access-token",
    });

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);
    const submitButton = await screen.findByRole("button", { name: /login/i });

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(setAccessToken).toHaveBeenCalledWith("test-access-token");
    });
  });

  it("fetches the current user after a successful login redirect", async () => {
    const user = userEvent.setup();

    vi.mocked(loginWeb).mockResolvedValue({
      access: "test-access-token",
    });

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    renderRoute("/login");

    await user.type(await screen.findByLabelText(/email/i), "user@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /login/i }));

    expect(
      await screen.findByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument();

    expect(getMe).toHaveBeenCalled();
  });
});
