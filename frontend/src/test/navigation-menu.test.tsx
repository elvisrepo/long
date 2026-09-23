import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useMetricUsageQuery } from "../features/metrics/use-metric-usage-query";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-bootstrap", () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: "test-access-token" }),
}));

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-definitions-query", () => ({
  useMetricDefinitionsQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-entries-query", () => ({
  useMetricEntriesQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-usage-query", () => ({
  useMetricUsageQuery: vi.fn(),
}));

vi.mock("../features/subscriptions/use-current-subscription-query", () => ({
  useCurrentSubscriptionQuery: vi.fn(),
}));

function mockAuthenticatedShell() {
  vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
  vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricDefinitionsQuery>);
  vi.mocked(useMetricEntriesQuery).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricEntriesQuery>);
  vi.mocked(useMetricUsageQuery).mockReturnValue({
    data: { active_custom_metrics: { used: 0, limit: 10 } },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricUsageQuery>);
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCurrentSubscriptionQuery>);
}

describe("navigation menu", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("toggles the navigation panel from the menu button", async () => {
    const user = userEvent.setup();
    mockAuthenticatedShell();

    renderRoute("/");

    const menuButton = await screen.findByRole("button", { name: /menu/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    mockAuthenticatedShell();

    renderRoute("/");

    const menuButton = await screen.findByRole("button", { name: /menu/i });
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(menuButton);
  });

  it("closes the menu when tapping outside the navigation", async () => {
    const user = userEvent.setup();
    mockAuthenticatedShell();

    renderRoute("/");

    const menuButton = await screen.findByRole("button", { name: /menu/i });
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await user.click(
      await screen.findByRole("heading", { level: 1, name: /dashboard/i }),
    );
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu after navigating to a destination", async () => {
    const user = userEvent.setup();
    mockAuthenticatedShell();

    renderRoute("/");

    const menuButton = await screen.findByRole("button", { name: /menu/i });
    await user.click(menuButton);

    const navigation = screen.getByRole("navigation", {
      name: /primary navigation/i,
    });
    await user.click(within(navigation).getByRole("link", { name: "Metrics" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Metrics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /menu/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
