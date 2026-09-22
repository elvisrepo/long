import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../features/auth/auth-me-api";
import { useCreateMetricEntryMutation } from "../features/metrics/use-create-metric-entry-mutation";
import { useDeleteMetricEntryMutation } from "../features/metrics/use-delete-metric-entry-mutation";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useUpdateMetricEntryMutation } from "../features/metrics/use-update-metric-entry-mutation";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-definitions-query", () => ({
  useMetricDefinitionsQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-entries-query", () => ({
  useMetricEntriesQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-create-metric-entry-mutation", () => ({
  useCreateMetricEntryMutation: vi.fn(),
}));

vi.mock("../features/metrics/use-update-metric-entry-mutation", () => ({
  useUpdateMetricEntryMutation: vi.fn(),
}));

vi.mock("../features/metrics/use-delete-metric-entry-mutation", () => ({
  useDeleteMetricEntryMutation: vi.fn(),
}));

vi.mock("../features/subscriptions/use-current-subscription-query", () => ({
  useCurrentSubscriptionQuery: vi.fn(),
}));

const updateMetricEntryMutateAsyncMock = vi.fn();
const deleteMetricEntryMutateAsyncMock = vi.fn();
const createMetricEntryMutateAsyncMock = vi.fn();

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

function mockLoadedMetricEntries(
  entries: NonNullable<ReturnType<typeof useMetricEntriesQuery>["data"]> = [
    {
      id: 1,
      metric_definition: "resting_hr",
      value: 58,
      recorded_at: "2026-03-05T07:15:00Z",
      source: "manual",
      context: {},
      created_at: "2026-03-05T07:15:02Z",
    },
  ],
) {
  vi.mocked(useMetricEntriesQuery).mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricEntriesQuery>);
}

function mockMetricEntryMutations() {
  createMetricEntryMutateAsyncMock.mockResolvedValue(undefined);
  updateMetricEntryMutateAsyncMock.mockResolvedValue(undefined);
  deleteMetricEntryMutateAsyncMock.mockResolvedValue(undefined);

  vi.mocked(useCreateMetricEntryMutation).mockReturnValue({
    mutateAsync: createMetricEntryMutateAsyncMock,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCreateMetricEntryMutation>);

  vi.mocked(useUpdateMetricEntryMutation).mockReturnValue({
    mutateAsync: updateMetricEntryMutateAsyncMock,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateMetricEntryMutation>);

  vi.mocked(useDeleteMetricEntryMutation).mockReturnValue({
    mutateAsync: deleteMetricEntryMutateAsyncMock,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteMetricEntryMutation>);
}

function mockAnalyticsEntitlement(analyticsEnabled: boolean) {
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: {
      id: "subscription-id",
      status: "active",
      billing_portal_available: false,
      current_period_start: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
      price: null,
      plan: {
        code: analyticsEnabled ? "pro" : "free",
        name: analyticsEnabled ? "Pro" : "Free",
        active_custom_metric_limit: analyticsEnabled ? 10 : 3,
        wearable_connection_limit: analyticsEnabled ? 2 : 1,
        automatic_sync_enabled: analyticsEnabled,
        sync_interval_minutes: analyticsEnabled ? 15 : 30,
        analytics_enabled: analyticsEnabled,
        csv_import_enabled: analyticsEnabled,
        csv_export_enabled: analyticsEnabled,
      },
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useCurrentSubscriptionQuery>);
}

describe("metric detail route", () => {
  beforeEach(() => {
    mockAnalyticsEntitlement(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders one metric and its entry history for an authenticated user", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /resting heart rate/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cardiovascular · bpm/i)).toBeInTheDocument();

    const summary = screen.getByRole("region", {
      name: /metric summary/i,
    });
    expect(within(summary).getByText(/latest value/i)).toBeInTheDocument();
    expect(within(summary).getByLabelText(/58 bpm/i)).toBeInTheDocument();
    expect(within(summary).getByText(/^1 entry$/i)).toBeInTheDocument();
    expect(within(summary).getByText(/20-220 bpm/i)).toBeInTheDocument();

    const history = screen.getByRole("region", {
      name: /metric entry history/i,
    });
    expect(
      within(history).getByRole("heading", { name: /entry history/i }),
    ).toBeInTheDocument();
    expect(within(history).getByText(/58 bpm/i)).toBeInTheDocument();
    expect(
      within(history).queryByText(/^sleep window:/i),
    ).not.toBeInTheDocument();
    expect(useMetricEntriesQuery).toHaveBeenCalledWith({
      metric: "resting_hr",
      limit: 50,
    });
  });

  it("redirects to /login when the user is not authenticated", async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error("Authentication credentials were not provided."),
    );
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("filters metric entries by the selected 30 day range", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    const beforeClick = new Date();
    await user.click(screen.getByRole("button", { name: /30d/i }));
    const afterClick = new Date();

    const lastFilters = vi.mocked(useMetricEntriesQuery).mock.calls.at(-1)?.[0];
    const earliestExpectedFrom = new Date(beforeClick);
    const latestExpectedFrom = new Date(afterClick);
    earliestExpectedFrom.setUTCDate(earliestExpectedFrom.getUTCDate() - 30);
    latestExpectedFrom.setUTCDate(latestExpectedFrom.getUTCDate() - 30);

    expect(lastFilters).toMatchObject({
      metric: "resting_hr",
      from: expect.any(String),
      limit: 50,
    });
    expect(new Date(lastFilters?.from ?? "").getTime()).toBeGreaterThanOrEqual(
      earliestExpectedFrom.getTime() - 1000,
    );
    expect(new Date(lastFilters?.from ?? "").getTime()).toBeLessThanOrEqual(
      latestExpectedFrom.getTime() + 1000,
    );
  });

  it("filters to a linked UTC date and prefills a manual entry on that date", async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr?date=2026-09-16");

    expect(
      await screen.findByText(/entries for sep 16, 2026 \(utc\)/i),
    ).toBeInTheDocument();
    expect(useMetricEntriesQuery).toHaveBeenCalledWith({
      metric: "resting_hr",
      from: "2026-09-16T00:00:00.000Z",
      to: "2026-09-16T23:59:59.999Z",
      limit: 50,
    });
    expect(
      screen.getByRole("link", { name: /clear selected date/i }),
    ).toHaveAttribute("href", "/metrics/resting_hr");

    await user.click(
      screen.getByRole("button", { name: /add resting heart rate entry/i }),
    );
    const recordedAt = screen.getByLabelText(/recorded at/i);
    expect((recordedAt as HTMLInputElement).value).toMatch(/^2026-09-16T/);
  });

  it("keeps the selected range filter stable across rerenders", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(screen.getByRole("button", { name: /7d/i }));
    const firstRangeFilters = vi
      .mocked(useMetricEntriesQuery)
      .mock.calls.at(-1)?.[0];

    await user.click(screen.getByRole("button", { name: /7d/i }));
    const secondRangeFilters = vi
      .mocked(useMetricEntriesQuery)
      .mock.calls.at(-1)?.[0];

    expect(secondRangeFilters).toEqual(firstRangeFilters);
  });

  it("shows a simple trend overview from oldest to latest entry", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-05T07:15:02Z",
      },
      {
        id: 2,
        metric_definition: "resting_hr",
        value: 56,
        recorded_at: "2026-03-01T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-01T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    const trend = screen.getByRole("region", {
      name: /trend overview/i,
    });

    const summary = screen.getByRole("region", {
      name: /metric summary/i,
    });
    expect(within(summary).getByText(/^2 entries$/i)).toBeInTheDocument();

    expect(
      within(trend).getByRole("heading", { name: /trend overview/i }),
    ).toBeInTheDocument();
    expect(
      within(trend).getByRole("img", {
        name: /resting heart rate trend chart/i,
      }),
    ).toBeInTheDocument();
    expect(within(trend).getByText(/56 to 58 bpm/i)).toBeInTheDocument();

    const trendStats = trend.querySelector(".trend-grid") as HTMLElement;
    expect(within(trend).getByText(/oldest/i)).toBeInTheDocument();
    expect(within(trendStats).getByText(/56 bpm/i)).toBeInTheDocument();
    expect(within(trendStats).getByText(/^latest$/i)).toBeInTheDocument();
    expect(within(trendStats).getByText(/58 bpm/i)).toBeInTheDocument();
    expect(within(trendStats).getByText(/\+2 bpm/i)).toBeInTheDocument();
  });

  it("explains that a single day of data cannot show a trend yet", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const trend = await screen.findByRole("region", {
      name: /trend overview/i,
    });
    expect(
      within(trend).getByText(/only one day of data/i),
    ).toBeInTheDocument();
  });

  it("collapses long entry history behind a show-all toggle", async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries(
      [58, 57, 56, 55, 54, 53, 52].map((value, index) => ({
        id: index + 1,
        metric_definition: "resting_hr",
        value,
        recorded_at: `2026-03-${String(10 - index).padStart(2, "0")}T07:15:00Z`,
        source: "manual",
        context: {},
        created_at: `2026-03-${String(10 - index).padStart(2, "0")}T07:15:02Z`,
      })),
    );
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const history = await screen.findByRole("region", {
      name: /metric entry history/i,
    });
    expect(within(history).queryByText("52 bpm")).not.toBeInTheDocument();
    expect(within(history).getByText("54 bpm")).toBeInTheDocument();

    await user.click(
      within(history).getByRole("button", { name: "Show all 7 entries" }),
    );
    expect(within(history).getByText("52 bpm")).toBeInTheDocument();

    await user.click(
      within(history).getByRole("button", { name: "Show fewer" }),
    );
    expect(within(history).queryByText("52 bpm")).not.toBeInTheDocument();
  });

  it("collapses the history preview when the range filter changes", async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries(
      [58, 57, 56, 55, 54, 53, 52].map((value, index) => ({
        id: index + 1,
        metric_definition: "resting_hr",
        value,
        recorded_at: `2026-03-${String(10 - index).padStart(2, "0")}T07:15:00Z`,
        source: "manual",
        context: {},
        created_at: `2026-03-${String(10 - index).padStart(2, "0")}T07:15:02Z`,
      })),
    );
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const history = await screen.findByRole("region", {
      name: /metric entry history/i,
    });
    await user.click(
      within(history).getByRole("button", { name: "Show all 7 entries" }),
    );
    expect(within(history).getByText("52 bpm")).toBeInTheDocument();

    const trend = screen.getByRole("region", { name: /trend overview/i });
    await user.click(within(trend).getByRole("button", { name: "30d" }));

    expect(within(history).queryByText("52 bpm")).not.toBeInTheDocument();
    expect(
      within(history).getByRole("button", { name: "Show all 7 entries" }),
    ).toBeInTheDocument();
  });

  it("shows short entry history without a toggle", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const history = await screen.findByRole("region", {
      name: /metric entry history/i,
    });
    expect(within(history).getByText("58 bpm")).toBeInTheDocument();
    expect(
      within(history).queryByRole("button", { name: /show all/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the single-day note once two days of data exist", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-05T07:15:02Z",
      },
      {
        id: 2,
        metric_definition: "resting_hr",
        value: 56,
        recorded_at: "2026-03-01T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-03-01T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const trend = await screen.findByRole("region", {
      name: /trend overview/i,
    });
    expect(
      within(trend).queryByText(/only one day of data/i),
    ).not.toBeInTheDocument();
  });

  it("formats body-weight floating-point noise in the latest value", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "body-weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "body_weight",
        value: 83.5999984741211,
        recorded_at: "2026-08-05T07:15:00Z",
        source: "samsung_health",
        context: {},
        created_at: "2026-08-05T07:15:02Z",
      },
      {
        id: 2,
        metric_definition: "body_weight",
        value: 87,
        recorded_at: "2026-05-19T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-05-19T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    const summary = await screen.findByRole("region", {
      name: /metric summary/i,
    });

    expect(within(summary).getByLabelText(/83\.6 kg/i)).toBeInTheDocument();

    const trend = screen.getByRole("region", { name: /trend overview/i });
    expect(within(trend).getByText(/-3\.4 kg/i)).toBeInTheDocument();

    const history = screen.getByRole("region", {
      name: /metric entry history/i,
    });
    expect(within(history).getByText(/^83\.6 kg$/i)).toBeInTheDocument();
  });

  it("shows Body Weight context and saved notes", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "body-weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "body_weight",
        value: 83.6,
        recorded_at: "2026-08-05T07:15:00Z",
        source: "manual",
        context: { notes: "After morning walk" },
        created_at: "2026-08-05T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    await screen.findByRole("heading", { name: /body weight/i });

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(
      within(breadcrumb).getByRole("link", { name: /^metrics$/i }),
    ).toHaveAttribute("href", "/metrics");
    expect(screen.getByText(/body composition · kg/i)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /trend overview/i })).getByRole(
        "button",
        { name: /^all$/i },
      ),
    ).toHaveAttribute("aria-pressed", "true");

    const history = screen.getByRole("region", {
      name: /metric entry history/i,
    });
    expect(
      within(history).getByText(/after morning walk/i),
    ).toBeInTheDocument();

    await user.click(
      within(history).getByRole("button", { name: /edit body weight entry/i }),
    );
    const valueInput = within(history).getByLabelText(/body weight value/i);
    expect(valueInput).toHaveAttribute("type", "number");
    expect(valueInput).toHaveAttribute("min", "20");
    expect(valueInput).toHaveAttribute("max", "400");
    expect(valueInput).toHaveAttribute("step", "0.1");
  });

  it("links Pro users from Body Weight to the Weight and Steps comparison", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    mockAnalyticsEntitlement(true);
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    expect(
      await screen.findByRole("link", { name: /compare with steps/i }),
    ).toHaveAttribute("href", "/analytics/weight-steps");
  });

  it("does not show the Weight and Steps comparison link to Free users", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "free@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    expect(
      await screen.findByRole("heading", { name: /body weight/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /compare with steps/i }),
    ).not.toBeInTheDocument();
  });

  it("links Pro users from Steps to the Weight and Steps comparison", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    mockAnalyticsEntitlement(true);
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "steps-id",
          name: "Steps",
          slug: "steps",
          unit: "steps",
          category: "activity",
          min_value: 0,
          max_value: 200000,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/steps");

    expect(
      await screen.findByRole("link", { name: /compare with weight/i }),
    ).toHaveAttribute("href", "/analytics/weight-steps");
  });

  it("links Pro users from Sleep Duration to Sleep Insights", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "pro@example.com" });
    mockAnalyticsEntitlement(true);
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "sleep-id",
          name: "Sleep Duration",
          slug: "sleep_duration",
          unit: "hours",
          category: "recovery",
          min_value: 0,
          max_value: 24,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/sleep_duration");

    expect(
      await screen.findByRole("link", { name: /view sleep insights/i }),
    ).toHaveAttribute("href", "/analytics/sleep");
  });

  it("adds a numeric entry from a non-weight metric detail page", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await user.click(
      await screen.findByRole("button", {
        name: /add resting heart rate entry/i,
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /add resting heart rate entry/i,
    });
    await user.type(
      within(dialog).getByLabelText(/resting heart rate value/i),
      "61",
    );
    fireEvent.change(within(dialog).getByLabelText(/recorded at/i), {
      target: { value: "2026-09-20T09:15" },
    });
    await user.type(
      within(dialog).getByLabelText(/resting heart rate notes/i),
      "Before coffee",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    );

    expect(createMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      metricDefinition: "resting_hr",
      value: 61,
      recordedAt: new Date("2026-09-20T09:15").toISOString(),
      context: { notes: "Before coffee" },
    });
  });

  it("adds a manual weight entry from the Body Weight detail page", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "body-weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    await user.click(
      await screen.findByRole("button", { name: /add weight entry/i }),
    );

    const dialog = screen.getByRole("dialog", {
      name: /add body weight entry/i,
    });
    await user.type(
      within(dialog).getByLabelText(/body weight value/i),
      "72.4",
    );
    fireEvent.change(within(dialog).getByLabelText(/recorded at/i), {
      target: { value: "2026-09-20T08:30" },
    });
    await user.type(
      within(dialog).getByLabelText(/body weight notes/i),
      "Morning weigh-in",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save weight entry/i }),
    );

    expect(createMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      metricDefinition: "body_weight",
      value: 72.4,
      recordedAt: new Date("2026-09-20T08:30").toISOString(),
      context: { notes: "Morning weigh-in" },
    });
    expect(
      screen.queryByRole("dialog", { name: /add body weight entry/i }),
    ).not.toBeInTheDocument();
  });

  it("rejects a weight outside the Body Weight accepted range", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "body-weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/body_weight");

    await user.click(
      await screen.findByRole("button", { name: /add weight entry/i }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /add body weight entry/i,
    });
    fireEvent.change(within(dialog).getByLabelText(/body weight value/i), {
      target: { value: "401" },
    });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);

    expect(createMetricEntryMutateAsyncMock).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /between 20 and 400 kg/i,
    );
  });

  it("keeps the weight form open when saving fails", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "body-weight-id",
          name: "Body Weight",
          slug: "body_weight",
          unit: "kg",
          category: "body_composition",
          min_value: 20,
          max_value: 400,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();
    createMetricEntryMutateAsyncMock.mockRejectedValue(
      new Error("Weight entry failed to save"),
    );

    renderRoute("/metrics/body_weight");

    await user.click(
      await screen.findByRole("button", { name: /add weight entry/i }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /add body weight entry/i,
    });
    await user.type(
      within(dialog).getByLabelText(/body weight value/i),
      "72.4",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save weight entry/i }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /weight entry failed to save/i,
    );
    expect(
      screen.getByRole("dialog", { name: /add body weight entry/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/body weight value/i)).toHaveValue(
      72.4,
    );
  });

  it("shows an empty state when the metric has no entries", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    const emptyState = screen
      .getByText(/no entries recorded yet/i)
      .closest(".empty-state") as HTMLElement;

    expect(emptyState).toHaveTextContent(
      /use add resting heart rate entry above to record your first value/i,
    );
    expect(
      within(emptyState).queryByRole("link", { name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("updates an entry from the metric history", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "manual",
        context: { notes: "before walk" },
        created_at: "2026-03-05T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(
      screen.getByRole("button", { name: /edit resting heart rate entry/i }),
    );
    await user.clear(screen.getByLabelText(/resting heart rate value/i));
    await user.type(screen.getByLabelText(/resting heart rate value/i), "62");
    await user.clear(screen.getByLabelText(/resting heart rate notes/i));
    await user.type(
      screen.getByLabelText(/resting heart rate notes/i),
      "after walk",
    );
    await user.click(
      screen.getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    );

    expect(updateMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      id: 1,
      input: {
        value: 62,
        recordedAt: "2026-03-05T07:15:00Z",
        context: { notes: "after walk" },
      },
    });
  });

  it("adds Sleep Duration from bedtime and wake time", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "sleep-duration-id",
          name: "Sleep Duration",
          slug: "sleep_duration",
          unit: "hours",
          category: "sleep",
          min_value: 0,
          max_value: 24,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([]);
    mockMetricEntryMutations();

    renderRoute("/metrics/sleep_duration");

    await user.click(
      await screen.findByRole("button", {
        name: /add sleep duration entry/i,
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /add sleep duration entry/i,
    });
    fireEvent.change(within(dialog).getByLabelText(/^bedtime$/i), {
      target: { value: "2026-09-19T01:00" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^wake time$/i), {
      target: { value: "2026-09-19T08:50" },
    });
    await user.type(
      within(dialog).getByLabelText(/sleep duration notes/i),
      "Felt rested",
    );

    expect(
      within(dialog).getByText(/calculated duration: 7h 50m/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: /save sleep duration entry/i,
      }),
    );

    expect(createMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      metricDefinition: "sleep_duration",
      periodStart: new Date("2026-09-19T01:00").toISOString(),
      recordedAt: new Date("2026-09-19T08:50").toISOString(),
      context: { notes: "Felt rested" },
    });
  });

  it("updates manual sleep from bedtime and wake time", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "sleep-duration-id",
          name: "Sleep Duration",
          slug: "sleep_duration",
          unit: "hours",
          category: "sleep",
          min_value: 0,
          max_value: 24,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "sleep_duration",
        value: 7.5,
        period_start: "2026-09-18T23:00:00Z",
        recorded_at: "2026-09-19T06:30:00Z",
        source: "manual",
        context: {},
        created_at: "2026-09-19T06:30:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/sleep_duration");

    await screen.findByRole("heading", { name: /sleep duration/i });
    await user.click(
      screen.getByRole("button", { name: /edit sleep duration entry/i }),
    );
    await user.clear(screen.getByLabelText(/^bedtime$/i));
    await user.type(screen.getByLabelText(/^bedtime$/i), "2026-09-19T00:30");
    await user.clear(screen.getByLabelText(/^wake time$/i));
    await user.type(screen.getByLabelText(/^wake time$/i), "2026-09-19T08:30");
    await user.click(
      screen.getByRole("button", { name: /save sleep duration entry/i }),
    );

    expect(updateMetricEntryMutateAsyncMock).toHaveBeenCalledWith({
      id: 1,
      input: {
        periodStart: new Date("2026-09-19T00:30").toISOString(),
        recordedAt: new Date("2026-09-19T08:30").toISOString(),
        context: { notes: "" },
      },
    });
  });

  it("deletes an entry from the metric history", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(
      screen.getByRole("button", {
        name: /delete resting heart rate entry/i,
      }),
    );

    expect(deleteMetricEntryMutateAsyncMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /delete resting heart rate entry/i }),
    ).toHaveTextContent(/permanently/i);

    await user.click(screen.getByRole("button", { name: /^delete entry$/i }));

    expect(deleteMetricEntryMutateAsyncMock).toHaveBeenCalledWith(1);
  });

  it("labels wearable entries and does not offer manual edit actions", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "resting_hr",
        value: 58,
        recorded_at: "2026-03-05T07:15:00Z",
        source: "samsung_health",
        context: {},
        created_at: "2026-03-05T07:15:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    const history = await screen.findByRole("region", {
      name: /metric entry history/i,
    });

    expect(within(history).getByText(/samsung health/i)).toBeInTheDocument();
    expect(
      within(history).queryByRole("button", {
        name: /edit resting heart rate entry/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(history).queryByRole("button", {
        name: /delete resting heart rate entry/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the local sleep window for a synced sleep entry", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: [
        {
          id: "sleep-duration-id",
          name: "Sleep Duration",
          slug: "sleep_duration",
          unit: "hours",
          category: "sleep",
          min_value: 0,
          max_value: 24,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "sleep_duration",
        value: 7.833333,
        period_start: "2026-09-18T23:00:00Z",
        recorded_at: "2026-09-19T06:50:00Z",
        source: "samsung_health",
        context: {},
        created_at: "2026-09-19T06:50:02Z",
      },
    ]);
    mockMetricEntryMutations();

    renderRoute("/metrics/sleep_duration");

    const history = await screen.findByRole("region", {
      name: /metric entry history/i,
    });

    const summary = screen.getByRole("region", { name: /metric summary/i });
    expect(within(summary).getByLabelText(/^7h 50m$/i)).toBeInTheDocument();
    expect(within(summary).queryByText(/^hours$/i)).not.toBeInTheDocument();
    expect(within(history).getByText(/^sleep window:/i)).toBeInTheDocument();
  });

  it("shows an error when updating an entry fails", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();
    updateMetricEntryMutateAsyncMock.mockRejectedValue(
      new Error("Metric entry failed to update"),
    );

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(
      screen.getByRole("button", { name: /edit resting heart rate entry/i }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    );

    expect(
      await screen.findByText(/metric entry failed to update/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    ).toBeInTheDocument();
  });

  it("prevents saving an empty entry value", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(
      screen.getByRole("button", { name: /edit resting heart rate entry/i }),
    );
    await user.clear(screen.getByLabelText(/resting heart rate value/i));
    await user.click(
      screen.getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    );

    expect(updateMetricEntryMutateAsyncMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/enter a numeric value before saving/i),
    ).toBeInTheDocument();
  });

  it("prevents saving a non-numeric entry value", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries();
    mockMetricEntryMutations();

    renderRoute("/metrics/resting_hr");

    await screen.findByRole("heading", {
      level: 1,
      name: /resting heart rate/i,
    });

    await user.click(
      screen.getByRole("button", { name: /edit resting heart rate entry/i }),
    );
    await user.clear(screen.getByLabelText(/resting heart rate value/i));
    await user.type(screen.getByLabelText(/resting heart rate value/i), "abc");
    await user.click(
      screen.getByRole("button", {
        name: /save resting heart rate entry/i,
      }),
    );

    expect(updateMetricEntryMutateAsyncMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/enter a numeric value before saving/i),
    ).toBeInTheDocument();
  });
});
