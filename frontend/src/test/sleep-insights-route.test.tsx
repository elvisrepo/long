import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useSleepInsightsQuery } from "../features/metrics/use-sleep-insights-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-sleep-insights-query", () => ({
  useSleepInsightsQuery: vi.fn(),
}));

describe("Sleep Insights route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders factual seven-night sleep insights and estimated shortfall", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: {
        range_days: 7,
        target_minutes: 450,
        series: [
          emptyPoint("2026-09-15"),
          emptyPoint("2026-09-16"),
          emptyPoint("2026-09-17"),
          emptyPoint("2026-09-18"),
          sleepPoint("2026-09-19", 360, "2026-09-18T23:00:00Z"),
          sleepPoint("2026-09-20", 480, "2026-09-19T22:30:00Z"),
          sleepPoint("2026-09-21", 420, "2026-09-21T00:00:00Z"),
        ],
        summary: {
          tracked_nights: 3,
          nights_under_target: 2,
          total_shortfall_minutes: 120,
          average_duration_minutes: 420,
          worst_night: { date: "2026-09-19", duration_minutes: 360 },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(
      await screen.findByRole("heading", { level: 1, name: /sleep insights/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("2h 00m")).toBeInTheDocument();
    expect(
      screen.getByText(/calculated from 3 of 7 nights/i),
    ).toBeInTheDocument();
    expect(screen.getByText("7h 00m")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/sep 19 · 6h 00m/i)).toBeInTheDocument();
  });

  it("requests a recalculation when the nightly target changes", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: {
        range_days: 7,
        target_minutes: 450,
        series: Array.from({ length: 7 }, (_, index) =>
          emptyPoint(`2026-09-${String(15 + index).padStart(2, "0")}`),
        ),
        summary: {
          tracked_nights: 0,
          nights_under_target: 0,
          total_shortfall_minutes: 0,
          average_duration_minutes: null,
          worst_night: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");
    await screen.findByRole("heading", { name: /sleep insights/i });

    fireEvent.change(screen.getByLabelText(/nightly sleep target/i), {
      target: { value: "08:00" },
    });

    expect(useSleepInsightsQuery).toHaveBeenLastCalledWith(480);
  });

  it("shows an empty state when no nights were tracked", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: {
        range_days: 7,
        target_minutes: 450,
        series: Array.from({ length: 7 }, (_, index) =>
          emptyPoint(`2026-09-${String(15 + index).padStart(2, "0")}`),
        ),
        summary: {
          tracked_nights: 0,
          nights_under_target: 0,
          total_shortfall_minutes: 0,
          average_duration_minutes: null,
          worst_night: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(
      await screen.findByRole("heading", {
        name: /no sleep data in the last seven nights/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows a safe analytics error", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "free@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Pro analytics are required."),
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pro analytics are required.",
    );
  });

  it("announces the loading state", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(
      await screen.findByRole("status", { name: /loading sleep insights/i }),
    ).toBeInTheDocument();
  });

  it("redirects unauthenticated users to Login", async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error("Authentication credentials were not provided."),
    );
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });
});

function emptyPoint(date: string) {
  return {
    date,
    duration_minutes: null,
    period_start: null,
    recorded_at: null,
    shortfall_minutes: null,
  };
}

function sleepPoint(
  date: string,
  durationMinutes: number,
  periodStart: string,
) {
  return {
    date,
    duration_minutes: durationMinutes,
    period_start: periodStart,
    recorded_at: new Date(
      new Date(periodStart).getTime() + durationMinutes * 60_000,
    ).toISOString(),
    shortfall_minutes: Math.max(450 - durationMinutes, 0),
  };
}
