import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useSleepInsightsQuery } from "../features/metrics/use-sleep-insights-query";
import {
  useSleepTargetPreferenceQuery,
  useUpdateSleepTargetPreferenceMutation,
} from "../features/metrics/use-sleep-target-preference";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-sleep-insights-query", () => ({
  useSleepInsightsQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-sleep-target-preference", () => ({
  useSleepTargetPreferenceQuery: vi.fn(),
  useUpdateSleepTargetPreferenceMutation: vi.fn(),
}));

const updateSleepTargetMutateAsyncMock = vi.fn();

describe("Sleep Insights route", () => {
  beforeEach(() => {
    mockSleepTargetPreference(450);
    updateSleepTargetMutateAsyncMock.mockResolvedValue({
      target_minutes: 450,
    });
    vi.mocked(useUpdateSleepTargetPreferenceMutation).mockReturnValue({
      mutateAsync: updateSleepTargetMutateAsyncMock,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useUpdateSleepTargetPreferenceMutation>);
  });

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
    const averageTile = screen.getByText("Average sleep").closest("article");
    expect(averageTile).not.toBeNull();
    expect(
      within(averageTile as HTMLElement).getByText("7h 00m"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/sep 19 · 6h 00m/i)).toBeInTheDocument();
  });

  it("celebrates a week with no shortfall instead of shouting zero", async () => {
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
          emptyPoint("2026-09-19"),
          emptyPoint("2026-09-20"),
          sleepPoint("2026-09-21", 480, "2026-09-20T22:30:00Z"),
        ],
        summary: {
          tracked_nights: 1,
          nights_under_target: 0,
          total_shortfall_minutes: 0,
          average_duration_minutes: 480,
          worst_night: { date: "2026-09-21", duration_minutes: 480 },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    expect(await screen.findByText(/no shortfall/i)).toBeInTheDocument();
    expect(screen.queryByText("0h 00m")).not.toBeInTheDocument();
  });

  it("labels each tracked bar with its readable duration", async () => {
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

    const chart = await screen.findByRole("img", {
      name: /nightly sleep duration/i,
    });
    expect(within(chart).getByText("8h 00m")).toBeInTheDocument();
    expect(within(chart).getByText("6h 00m")).toBeInTheDocument();
    expect(within(chart).queryByText("—")).not.toBeInTheDocument();
  });

  it("exposes per-night values to assistive technology", async () => {
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
          emptyPoint("2026-09-19"),
          emptyPoint("2026-09-20"),
          sleepPoint("2026-09-21", 480, "2026-09-20T22:30:00Z"),
        ],
        summary: {
          tracked_nights: 1,
          nights_under_target: 0,
          total_shortfall_minutes: 0,
          average_duration_minutes: 480,
          worst_night: { date: "2026-09-21", duration_minutes: 480 },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSleepInsightsQuery>);

    renderRoute("/analytics/sleep");

    const chart = await screen.findByRole("img", {
      name: /nightly sleep duration/i,
    });
    expect(chart).toHaveAttribute(
      "aria-label",
      expect.stringContaining("8h 00m"),
    );
  });

  it("keeps summary tiles short with one shared timezone footnote", async () => {
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

    await screen.findByRole("heading", { level: 1, name: /sleep insights/i });
    expect(screen.getByText("Avg bedtime")).toBeInTheDocument();
    expect(screen.getByText("Avg wake time")).toBeInTheDocument();
    expect(screen.getByText("Shortest night")).toBeInTheDocument();
    expect(screen.getByText("Under target")).toBeInTheDocument();
    expect(
      screen.queryByText(/average bedtime · local time/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/local timezone/i)).toBeInTheDocument();
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

  it("initializes from the saved target and persists a changed target", async () => {
    mockSleepTargetPreference(480);
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    vi.mocked(useSleepInsightsQuery).mockReturnValue({
      data: {
        range_days: 7,
        target_minutes: 480,
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

    const targetInput = await screen.findByLabelText(/nightly sleep target/i);
    expect(targetInput).toHaveValue("08:00");
    fireEvent.change(targetInput, { target: { value: "08:30" } });
    fireEvent.click(screen.getByRole("button", { name: /save target/i }));

    expect(updateSleepTargetMutateAsyncMock).toHaveBeenCalledWith(510);
  });

  it("shows a target save failure", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    mockEmptySleepInsights();
    vi.mocked(useUpdateSleepTargetPreferenceMutation).mockReturnValue({
      mutateAsync: updateSleepTargetMutateAsyncMock,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error("Sleep target could not be saved."),
    } as unknown as ReturnType<typeof useUpdateSleepTargetPreferenceMutation>);

    renderRoute("/analytics/sleep");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sleep target could not be saved.",
    );
  });

  it("announces target saving and saved states", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    mockEmptySleepInsights();
    vi.mocked(useUpdateSleepTargetPreferenceMutation).mockReturnValue({
      mutateAsync: updateSleepTargetMutateAsyncMock,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useUpdateSleepTargetPreferenceMutation>);

    const route = renderRoute("/analytics/sleep");

    expect(
      await screen.findByRole("button", { name: /saving/i }),
    ).toBeDisabled();

    route.unmount();
    vi.mocked(useUpdateSleepTargetPreferenceMutation).mockReturnValue({
      mutateAsync: updateSleepTargetMutateAsyncMock,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    } as unknown as ReturnType<typeof useUpdateSleepTargetPreferenceMutation>);
    renderRoute("/analytics/sleep");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Target saved.",
    );
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

function mockSleepTargetPreference(targetMinutes: number) {
  vi.mocked(useSleepTargetPreferenceQuery).mockReturnValue({
    data: { target_minutes: targetMinutes },
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useSleepTargetPreferenceQuery>);
}

function mockEmptySleepInsights() {
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
