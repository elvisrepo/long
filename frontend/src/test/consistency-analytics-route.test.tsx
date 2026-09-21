import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useConsistencyAnalyticsQuery } from "../features/metrics/use-consistency-analytics-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-consistency-analytics-query", () => ({
  useConsistencyAnalyticsQuery: vi.fn(),
}));

describe("Consistency analytics route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders factual coverage and per-metric presence", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useConsistencyAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 7,
        dates: sevenDates,
        metrics: [
          {
            metric_definition_id: "weight-id",
            name: "Body Weight",
            slug: "body_weight",
            tracked_days: 5,
            current_window_streak_days: 2,
            last_recorded_at: "2026-09-21T07:00:00Z",
            day_presence: [true, true, false, true, true, false, true],
          },
          {
            metric_definition_id: "steps-id",
            name: "Steps",
            slug: "steps",
            tracked_days: 7,
            current_window_streak_days: 7,
            last_recorded_at: "2026-09-21T08:00:00Z",
            day_presence: [true, true, true, true, true, true, true],
          },
          {
            metric_definition_id: "resting-id",
            name: "Resting Heart Rate",
            slug: "resting_hr",
            tracked_days: 0,
            current_window_streak_days: 0,
            last_recorded_at: "2026-09-10T07:00:00Z",
            day_presence: [false, false, false, false, false, false, false],
          },
        ],
        summary: {
          metrics_with_data: 2,
          total_metrics: 6,
          days_with_any_data: 7,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useConsistencyAnalyticsQuery>);

    renderRoute("/analytics/consistency");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /consistency & coverage/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 6 metrics")).toBeInTheDocument();
    expect(screen.getByText("7 of 7 days")).toBeInTheDocument();
    expect(screen.getByText("Steps · 7/7")).toBeInTheDocument();
    expect(screen.getByText(/5 of 7 tracked days/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open body weight/i }),
    ).toHaveAttribute("href", "/metrics/body_weight");
    expect(
      screen.getByRole("link", {
        name: /body weight on 2026-09-17: no entry/i,
      }),
    ).toHaveAttribute("href", "/metrics/body_weight?date=2026-09-17");
    expect(
      screen.getByRole("link", {
        name: /steps on 2026-09-16: tracked/i,
      }),
    ).toHaveAttribute("href", "/metrics/steps?date=2026-09-16");

    const attention = screen.getByRole("region", { name: /needs attention/i });
    expect(
      within(attention).getByText(/last entry 11 days ago/i),
    ).toBeVisible();
    expect(
      within(attention).getByRole("link", {
        name: /open resting heart rate/i,
      }),
    ).toHaveAttribute("href", "/metrics/resting_hr");
  });

  it("renders loading and safe error states", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useConsistencyAnalyticsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useConsistencyAnalyticsQuery>);
    const route = renderRoute("/analytics/consistency");

    expect(
      await screen.findByRole("status", {
        name: /loading consistency analytics/i,
      }),
    ).toBeInTheDocument();

    route.unmount();
    vi.mocked(useConsistencyAnalyticsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Pro analytics are required."),
    } as ReturnType<typeof useConsistencyAnalyticsQuery>);
    renderRoute("/analytics/consistency");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pro analytics are required.",
    );
  });

  it("flags a daily metric after two UTC dates without data", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useConsistencyAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 7,
        dates: sevenDates,
        metrics: [
          {
            metric_definition_id: "sleep-id",
            name: "Sleep Duration",
            slug: "sleep_duration",
            tracked_days: 1,
            current_window_streak_days: 0,
            last_recorded_at: "2026-09-19T07:00:00Z",
            day_presence: [false, false, false, false, true, false, false],
          },
        ],
        summary: {
          metrics_with_data: 1,
          total_metrics: 1,
          days_with_any_data: 1,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useConsistencyAnalyticsQuery>);

    renderRoute("/analytics/consistency");

    const attention = await screen.findByRole("region", {
      name: /needs attention/i,
    });
    expect(within(attention).getByText(/last entry 2 days ago/i)).toBeVisible();
  });

  it("explains an empty seven-day window", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useConsistencyAnalyticsQuery).mockReturnValue({
      data: {
        range_days: 7,
        dates: sevenDates,
        metrics: [],
        summary: {
          metrics_with_data: 0,
          total_metrics: 0,
          days_with_any_data: 0,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useConsistencyAnalyticsQuery>);

    renderRoute("/analytics/consistency");

    expect(
      await screen.findByRole("heading", { name: /no active metrics/i }),
    ).toBeInTheDocument();
  });
});

const sevenDates = [
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
  "2026-09-20",
  "2026-09-21",
];
