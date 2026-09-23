import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useWeightStepsAnalyticsQuery } from "../features/metrics/use-weight-steps-analytics-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-weight-steps-analytics-query", () => ({
  useWeightStepsAnalyticsQuery: vi.fn(),
}));

describe("weight and steps analytics route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders the Pro overlay and summary from backend analytics", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [
          {
            date: "2026-09-18",
            weight_kg: 70.4,
            weight_7d_average_kg: 70.4,
            steps: 6000,
          },
          {
            date: "2026-09-19",
            weight_kg: 70.1,
            weight_7d_average_kg: 70.25,
            steps: 7300,
          },
        ],
        summary: {
          weight_start_kg: 70.4,
          weight_end_kg: 70.1,
          weight_change_kg: -0.3,
          average_daily_steps: 6650,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(
      await screen.findByRole("heading", { level: 1, name: /weight × steps/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("70.4 → 70.1 kg")).toBeInTheDocument();
    expect(
      screen.getByText(/latest trailing 7-day average 70\.3 kg/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/trailing 7-day mean of your daily weigh-ins/i),
    ).toBeInTheDocument();
    expect(screen.getByText("6,650 / day")).toBeInTheDocument();
    expect(useWeightStepsAnalyticsQuery).toHaveBeenCalledWith(30);
  });

  it("labels the breadcrumb with human metric names instead of slugs", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [
          {
            date: "2026-09-19",
            weight_kg: 70.1,
            weight_7d_average_kg: 70.1,
            steps: 7300,
          },
        ],
        summary: {
          weight_start_kg: 70.1,
          weight_end_kg: 70.1,
          weight_change_kg: 0,
          average_daily_steps: 7300,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    const breadcrumb = await screen.findByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(
      within(breadcrumb).getByRole("link", { name: "Body Weight" }),
    ).toBeInTheDocument();
    expect(
      within(breadcrumb).getByRole("link", { name: "Steps" }),
    ).toBeInTheDocument();
  });

  it("explains that a single day cannot show a comparison trend yet", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [
          {
            date: "2026-09-19",
            weight_kg: 70.1,
            weight_7d_average_kg: 70.1,
            steps: 7300,
          },
        ],
        summary: {
          weight_start_kg: 70.1,
          weight_end_kg: 70.1,
          weight_change_kg: 0,
          average_daily_steps: 7300,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(
      await screen.findByText(/only one day of data in this range/i),
    ).toBeInTheDocument();
  });

  it("hides the single-day note once two days of data exist", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [
          {
            date: "2026-09-18",
            weight_kg: 70.4,
            weight_7d_average_kg: 70.4,
            steps: 6000,
          },
          {
            date: "2026-09-19",
            weight_kg: 70.1,
            weight_7d_average_kg: 70.25,
            steps: 7300,
          },
        ],
        summary: {
          weight_start_kg: 70.4,
          weight_end_kg: 70.1,
          weight_change_kg: -0.3,
          average_daily_steps: 6650,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    await screen.findByRole("heading", { level: 1, name: /weight × steps/i });
    expect(
      screen.queryByText(/only one day of data in this range/i),
    ).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to Login", async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error("Authentication credentials were not provided."),
    );
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("requests a new range when the user selects 7 days", async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [
          {
            date: "2026-09-19",
            weight_kg: null,
            weight_7d_average_kg: null,
            steps: null,
          },
        ],
        summary: {
          weight_start_kg: null,
          weight_end_kg: null,
          weight_change_kg: null,
          average_daily_steps: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);
    renderRoute("/analytics/weight-steps");
    await screen.findByRole("heading", { name: /weight × steps/i });

    await user.click(screen.getByRole("button", { name: "7d" }));

    expect(useWeightStepsAnalyticsQuery).toHaveBeenLastCalledWith(7);
  });

  it("shows the backend entitlement error to a Free user", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "free@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Pro analytics are required."),
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pro analytics are required.",
    );
  });

  it("shows an empty state when the selected range has no data", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 30,
        series: [],
        summary: {
          weight_start_kg: null,
          weight_end_kg: null,
          weight_change_kg: null,
          average_daily_steps: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(
      await screen.findByRole("heading", {
        name: /no comparison data in this range/i,
      }),
    ).toBeInTheDocument();
  });

  it("announces the loading state", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useWeightStepsAnalyticsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeightStepsAnalyticsQuery>);

    renderRoute("/analytics/weight-steps");

    expect(
      await screen.findByRole("status", {
        name: /loading weight and steps analytics/i,
      }),
    ).toBeInTheDocument();
  });
});
