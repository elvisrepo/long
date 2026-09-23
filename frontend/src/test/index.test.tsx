import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreWebSession } from "../features/auth/auth-bootstrap";
import { logoutWeb } from "../features/auth/auth-logout-api";
import { getMe } from "../features/auth/auth-me-api";
import { createMetricEntry } from "../features/metrics/metric-entries-api";
import { useMetricDefinitionsQuery } from "../features/metrics/use-metric-definitions-query";
import { useMetricEntriesQuery } from "../features/metrics/use-metric-entries-query";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({
  getMe: vi.fn(),
}));

vi.mock("../features/auth/auth-logout-api", () => ({
  logoutWeb: vi.fn(),
}));

vi.mock("../features/auth/auth-bootstrap", () => ({
  restoreWebSession: vi.fn().mockResolvedValue({ access: "test-access-token" }),
}));

vi.mock("../features/metrics/use-metric-definitions-query", () => ({
  useMetricDefinitionsQuery: vi.fn(),
}));

vi.mock("../features/metrics/use-metric-entries-query", () => ({
  useMetricEntriesQuery: vi.fn(),
}));

vi.mock("../features/metrics/metric-entries-api", () => ({
  createMetricEntry: vi.fn(),
}));

vi.mock("../features/subscriptions/use-current-subscription-query", () => ({
  useCurrentSubscriptionQuery: vi.fn(),
}));

const createMetricEntryMock = vi.mocked(createMetricEntry);

function mockFreeSubscription() {
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: {
      id: "free-subscription-id",
      status: "active",
      billing_portal_available: false,
      current_period_start: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
      price: null,
      plan: {
        code: "free",
        name: "Free",
        active_custom_metric_limit: 3,
        wearable_connection_limit: 1,
        automatic_sync_enabled: false,
        sync_interval_minutes: 30,
        analytics_enabled: false,
        csv_import_enabled: false,
        csv_export_enabled: false,
      },
    },
    isPending: false,
    isError: false,
  } as ReturnType<typeof useCurrentSubscriptionQuery>);
}

function mockProSubscription() {
  vi.mocked(useCurrentSubscriptionQuery).mockReturnValue({
    data: {
      id: "pro-subscription-id",
      status: "active",
      billing_portal_available: true,
      current_period_start: "2026-07-02T00:00:00Z",
      current_period_end: "2026-08-02T00:00:00Z",
      cancel_at: null,
      cancel_at_period_end: false,
      price: {
        currency: "usd",
        unit_amount: 1000,
        billing_interval: "month",
      },
      plan: {
        code: "pro",
        name: "Pro",
        active_custom_metric_limit: 10,
        wearable_connection_limit: 2,
        automatic_sync_enabled: true,
        sync_interval_minutes: 15,
        analytics_enabled: true,
        csv_import_enabled: true,
        csv_export_enabled: true,
      },
    },
    isPending: false,
    isError: false,
  } as ReturnType<typeof useCurrentSubscriptionQuery>);
}

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
  mockLoadedMetricEntries();
}

function mockLoadedMetricDefinitionsWithManyMetrics() {
  vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
    data: [
      {
        id: "resting-hr-id",
        name: "Resting Heart Rate",
        slug: "resting_hr",
        unit: "bpm",
        category: "cardiovascular",
        min_value: 20,
        max_value: 220,
        is_default: true,
      },
      {
        id: "body-weight-id",
        name: "Body Weight",
        slug: "body_weight",
        unit: "kg",
        category: "body_composition",
        min_value: 20,
        max_value: 300,
        is_default: true,
      },
    ],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMetricDefinitionsQuery>);
  mockLoadedMetricEntries();
}

function mockLoadedMetricEntries(
  entries: NonNullable<ReturnType<typeof useMetricEntriesQuery>["data"]> = [],
) {
  mockMetricEntriesByFilters({ cardEntries: entries, recentEntries: entries });
}

function mockMetricEntriesByFilters({
  cardEntries = [],
  recentEntries = [],
}: {
  cardEntries?: NonNullable<ReturnType<typeof useMetricEntriesQuery>["data"]>;
  recentEntries?: NonNullable<ReturnType<typeof useMetricEntriesQuery>["data"]>;
}) {
  vi.mocked(useMetricEntriesQuery).mockImplementation((filters) => {
    const entries =
      filters?.limit === 50 && !filters.metric ? cardEntries : recentEntries;

    return {
      data: entries,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricEntriesQuery>;
  });
}

function utcDaysAgoIso(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(7, 15, 0, 0);
  return date.toISOString();
}

describe("dashboard route", () => {
  beforeEach(() => {
    mockFreeSubscription();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders the dashboard for an authenticated user", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();

    renderRoute("/");

    expect(
      await screen.findByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /resting heart rate/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no readings yet/i)).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", {
      name: /primary navigation/i,
    });
    expect(
      within(navigation).getByRole("link", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "Metrics" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByTitle("Signed in as user@example.com"),
    ).toHaveTextContent("U");
    expect(
      within(navigation).getByRole("button", { name: "Logout" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", { name: "Login" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", { name: "Register" }),
    ).not.toBeInTheDocument();
  });

  it("shows compact metrics in one page when there are six or fewer", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    mockLoadedMetricDefinitionsWithManyMetrics();
    mockLoadedMetricEntries([
      {
        id: 1,
        metric_definition: "body_weight",
        value: 83.6,
        recorded_at: "2026-09-21T07:15:00Z",
        source: "manual",
        context: {},
        created_at: "2026-09-21T07:15:02Z",
      },
    ]);

    renderRoute("/");

    const rail = await screen.findByRole("region", { name: "Health metrics" });
    expect(rail).toHaveClass("dashboard-metric-rail");
    expect(within(rail).getAllByRole("group")).toHaveLength(1);
    expect(within(rail).getAllByRole("article")).toHaveLength(2);
    expect(
      within(rail).getByRole("link", { name: /body weight/i }),
    ).toHaveAttribute("href", "/metrics/body_weight");
    expect(
      within(rail).getByRole("button", { name: /add body weight entry/i }),
    ).toBeInTheDocument();
    expect(within(rail).queryByText(/latest reading/i)).not.toBeInTheDocument();
    expect(within(rail).queryByText(/manual entry/i)).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Scroll metrics right" }),
    ).not.toBeInTheDocument();
  });

  it("paginates additional metrics six at a time", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: Array.from({ length: 7 }, (_, index) => ({
        id: `metric-${index + 1}`,
        name: `Metric ${index + 1}`,
        slug: `metric_${index + 1}`,
        unit: "score",
        category: "custom",
        min_value: 0,
        max_value: 100,
        is_default: false,
        is_active: true,
      })),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries();

    renderRoute("/");

    const rail = await screen.findByRole("region", { name: "Health metrics" });
    const pages = within(rail).getAllByRole("group");
    expect(pages).toHaveLength(2);
    expect(within(pages[0]).getAllByRole("article")).toHaveLength(6);
    expect(within(pages[1]).getAllByRole("article")).toHaveLength(1);

    Object.defineProperty(rail, "clientWidth", { value: 400 });
    const scrollBy = vi.fn();
    rail.scrollBy = scrollBy;
    await userEvent.click(
      screen.getByRole("button", { name: "Scroll metrics right" }),
    );
    expect(scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
  });

  it("logs out from the shared authenticated navigation", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    vi.mocked(logoutWeb).mockResolvedValue();
    mockLoadedMetricDefinitions();

    renderRoute("/");

    await userEvent.click(
      await screen.findByRole("button", { name: "Logout" }),
    );

    expect(logoutWeb).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: "Login" }),
    ).toBeInTheDocument();
  });

  it("redirects to /login when the user is not authenticated", async () => {
    vi.mocked(getMe).mockRejectedValue(
      new Error("Authentication credentials were not provided."),
    );

    renderRoute("/");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("waits for auth bootstrap before rendering the protected dashboard", async () => {
    let resolveRestore: (() => void) | undefined;

    // Pending promise
    vi.mocked(restoreWebSession).mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = () => resolve(undefined as never);
      }),
    );

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();

    renderRoute("/");

    expect(screen.getByText(/restoring session/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /dashboard/i }),
    ).not.toBeInTheDocument();

    // Finish bootstrap manually
    resolveRestore?.();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows a loading state while metric definitions are loading", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries();

    renderRoute("/");

    expect(
      await screen.findByText(/loading metric definitions/i),
    ).toBeInTheDocument();
  });

  it("shows an error state when metric definitions fail to load", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    vi.mocked(useMetricDefinitionsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockLoadedMetricEntries();

    renderRoute("/");

    expect(
      await screen.findByText(/metric definitions failed to load/i),
    ).toBeInTheDocument();
  });

  it("logs a resting heart rate metric entry from the dashboard", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: "resting_hr",
      value: 58,
      recorded_at: "2026-03-05T07:15:00Z",
      source: "manual",
      context: {},
      created_at: "2026-03-05T07:15:02Z",
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    expect(
      screen.queryByLabelText(/resting heart rate value/i),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /add resting heart rate entry/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /add resting heart rate entry/i }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/resting heart rate value/i), "58");
    await user.click(
      screen.getByRole("button", { name: /save resting heart rate entry/i }),
    );

    expect(createMetricEntryMock).toHaveBeenCalledWith({
      metricDefinition: "resting_hr",
      value: 58,
      recordedAt: expect.any(String),
      context: { notes: "" },
    });
  });

  it("logs manual sleep from bedtime and wake time", async () => {
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
    mockLoadedMetricEntries();
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: "sleep_duration",
      value: 7 + 50 / 60,
      period_start: "2026-09-18T23:00:00Z",
      recorded_at: "2026-09-19T06:50:00Z",
      source: "manual",
      context: {},
      created_at: "2026-09-19T06:50:02Z",
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });
    await user.click(
      screen.getByRole("button", { name: /add sleep duration entry/i }),
    );
    await user.type(screen.getByLabelText(/^bedtime$/i), "2026-09-19T01:00");
    await user.type(screen.getByLabelText(/^wake time$/i), "2026-09-19T08:50");

    expect(
      screen.getByText(/calculated duration: 7h 50m/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /save sleep duration entry/i }),
    );

    expect(createMetricEntryMock).toHaveBeenCalledWith({
      metricDefinition: "sleep_duration",
      periodStart: new Date("2026-09-19T01:00").toISOString(),
      recordedAt: new Date("2026-09-19T08:50").toISOString(),
      context: { notes: "" },
    });
  });

  it("rejects a manual sleep wake time that is not later than bedtime", async () => {
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
    mockLoadedMetricEntries();

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });
    await user.click(
      screen.getByRole("button", { name: /add sleep duration entry/i }),
    );
    await user.type(screen.getByLabelText(/^bedtime$/i), "2026-09-19T08:50");
    await user.type(screen.getByLabelText(/^wake time$/i), "2026-09-19T01:00");
    await user.click(
      screen.getByRole("button", { name: /save sleep duration entry/i }),
    );

    expect(
      screen.getByText(/enter a sleep window between 0 and 24 hours/i),
    ).toBeInTheDocument();
    expect(createMetricEntryMock).not.toHaveBeenCalled();
  });

  it("clears the metric entry value after logging succeeds", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    createMetricEntryMock.mockResolvedValue({
      id: 1,
      metric_definition: "resting_hr",
      value: 58,
      recorded_at: "2026-03-05T07:15:00Z",
      source: "manual",
      context: {},
      created_at: "2026-03-05T07:15:02Z",
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    await user.click(
      screen.getByRole("button", { name: /add resting heart rate entry/i }),
    );
    const valueInput = screen.getByLabelText(/resting heart rate value/i);

    await user.type(valueInput, "58");
    await user.click(
      screen.getByRole("button", { name: /save resting heart rate entry/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("shows an error when metric entry logging fails", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    createMetricEntryMock.mockRejectedValue(
      new Error("Metric entry failed to save"),
    );

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    await user.click(
      screen.getByRole("button", { name: /add resting heart rate entry/i }),
    );
    await user.type(screen.getByLabelText(/resting heart rate value/i), "58");
    await user.click(
      screen.getByRole("button", { name: /save resting heart rate entry/i }),
    );

    expect(
      await screen.findByText(/metric entry failed to save/i),
    ).toBeInTheDocument();
  });

  it("shows logged metric entries on the dashboard", async () => {
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

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    expect(screen.getAllByText(/resting heart rate/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole("heading", { name: /recent entries/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /metric entries/i })).getByText(
        /samsung health/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/58 bpm/i)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /metric entries/i })).getByText(
        /mar 5, 2026, 7:15 am/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows a recent trend in a metric card with multiple values", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 2,
          metric_definition: "resting_hr",
          value: 58,
          recorded_at: "2026-03-06T07:15:00Z",
          source: "samsung_health",
          context: {},
          created_at: "2026-03-06T07:15:02Z",
        },
        {
          id: 1,
          metric_definition: "resting_hr",
          value: 61,
          recorded_at: "2026-03-05T07:15:00Z",
          source: "samsung_health",
          context: {},
          created_at: "2026-03-05T07:15:02Z",
        },
      ],
      recentEntries: [],
    });

    renderRoute("/");

    expect(
      await screen.findByRole("img", {
        name: /resting heart rate recent trend/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows a locked Pro insights prompt for Free users", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();

    renderRoute("/");

    const insights = await screen.findByRole("region", {
      name: /pro insights/i,
    });

    expect(
      within(insights).getByRole("heading", { name: /pro insights/i }),
    ).toBeInTheDocument();
    expect(
      within(insights).getByText(/upgrade to pro for insights/i),
    ).toBeInTheDocument();
    expect(
      within(insights).queryByRole("link", { name: /weight × steps/i }),
    ).not.toBeInTheDocument();
    expect(
      within(insights).queryByRole("link", { name: /consistency/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Pro insights when analytics are enabled", async () => {
    mockProSubscription();
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitionsWithManyMetrics();
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: "resting_hr",
          value: 61,
          recorded_at: "2026-03-06T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-06T07:15:02Z",
        },
        {
          id: 2,
          metric_definition: "body_weight",
          value: 87,
          recorded_at: "2026-03-01T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-01T07:15:02Z",
        },
      ],
      recentEntries: [],
    });

    renderRoute("/");

    const insights = await screen.findByRole("region", {
      name: /pro insights/i,
    });

    expect(
      within(insights).getByRole("link", { name: /weight × steps/i }),
    ).toHaveAttribute("href", "/analytics/weight-steps");
    expect(
      within(insights).getByRole("link", { name: /sleep insights/i }),
    ).toHaveAttribute("href", "/analytics/sleep");
    expect(
      within(insights).getByRole("link", { name: /consistency/i }),
    ).toHaveAttribute("href", "/analytics/consistency");
  });

  it("shows Pro insight previews from loaded entries", async () => {
    mockProSubscription();
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
          max_value: 300,
          is_default: true,
        },
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
        {
          id: "steps-id",
          name: "Steps",
          slug: "steps",
          unit: "steps",
          category: "activity",
          min_value: 0,
          max_value: 100000,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMetricDefinitionsQuery>);
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: "sleep_duration",
          value: 7.5,
          recorded_at: utcDaysAgoIso(1),
          source: "manual",
          context: {},
          created_at: utcDaysAgoIso(1),
        },
        {
          id: 2,
          metric_definition: "sleep_duration",
          value: 7,
          recorded_at: utcDaysAgoIso(3),
          source: "manual",
          context: {},
          created_at: utcDaysAgoIso(3),
        },
        {
          id: 3,
          metric_definition: "body_weight",
          value: 84,
          recorded_at: utcDaysAgoIso(1),
          source: "manual",
          context: {},
          created_at: utcDaysAgoIso(1),
        },
        {
          id: 4,
          metric_definition: "steps",
          value: 8000,
          recorded_at: utcDaysAgoIso(0),
          source: "manual",
          context: {},
          created_at: utcDaysAgoIso(0),
        },
      ],
      recentEntries: [],
    });

    renderRoute("/");

    const insights = await screen.findByRole("region", {
      name: /pro insights/i,
    });
    const sleepLink = within(insights).getByRole("link", {
      name: /sleep insights/i,
    });
    expect(sleepLink).toHaveTextContent("Latest 7h 30m · 2 of 7 nights");
    const weightStepsLink = within(insights).getByRole("link", {
      name: /weight × steps/i,
    });
    expect(weightStepsLink).toHaveTextContent("84 kg · 8000 steps");
    const consistencyLink = within(insights).getByRole("link", {
      name: /consistency/i,
    });
    expect(consistencyLink).toHaveTextContent("3 of 7 days with data");
  });

  it("shows empty Pro insight previews when there is no data", async () => {
    mockProSubscription();
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitionsWithManyMetrics();
    mockMetricEntriesByFilters({ cardEntries: [], recentEntries: [] });

    renderRoute("/");

    const insights = await screen.findByRole("region", {
      name: /pro insights/i,
    });
    expect(
      within(insights).getByRole("link", { name: /sleep insights/i }),
    ).toHaveTextContent(/no sleep data yet/i);
    expect(
      within(insights).getByRole("link", { name: /weight × steps/i }),
    ).toHaveTextContent(/no weight or steps yet/i);
    expect(
      within(insights).getByRole("link", { name: /consistency/i }),
    ).toHaveTextContent(/no recent data/i);
  });

  it("limits recent entries on the dashboard", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 50 });
    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 5 });
  });

  it("keeps export controls out of Recent Entries", async () => {
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    mockLoadedMetricDefinitions();
    mockProSubscription();
    renderRoute("/");
    await screen.findByRole("heading", { name: /dashboard/i });
    expect(
      screen.queryByRole("button", { name: /export/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/export from/i)).not.toBeInTheDocument();
  });

  it("shows card latest values from entries beyond the five-entry recent list", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitionsWithManyMetrics();
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: "resting_hr",
          value: 61,
          recorded_at: "2026-03-06T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-06T07:15:02Z",
        },
        {
          id: 2,
          metric_definition: "body_weight",
          value: 87,
          recorded_at: "2026-03-01T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-01T07:15:02Z",
        },
      ],
      recentEntries: [
        {
          id: 3,
          metric_definition: "resting_hr",
          value: 61,
          recorded_at: "2026-03-06T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-06T07:15:02Z",
        },
      ],
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    const bodyWeightCard = screen
      .getByRole("heading", { name: /body weight/i })
      .closest(".metric-card") as HTMLElement;

    expect(bodyWeightCard).toHaveTextContent(/87\s*kg/i);
    expect(
      screen.getAllByRole("link", { name: /resting heart rate/i }),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: /body weight/i })).toHaveAttribute(
      "href",
      "/metrics/body_weight",
    );
  });

  it("formats body-weight floating-point noise across the dashboard", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitionsWithManyMetrics();
    const noisyBodyWeightEntry = {
      id: 1,
      metric_definition: "body_weight",
      value: 83.5999984741211,
      recorded_at: "2026-08-05T07:15:00Z",
      source: "samsung_health",
      context: {},
      created_at: "2026-08-05T07:15:02Z",
    };
    mockMetricEntriesByFilters({
      cardEntries: [noisyBodyWeightEntry],
      recentEntries: [noisyBodyWeightEntry],
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    const bodyWeightCard = screen
      .getByRole("heading", { name: /body weight/i })
      .closest(".metric-card") as HTMLElement;
    const recentEntries = screen.getByRole("region", {
      name: /metric entries/i,
    });

    expect(bodyWeightCard).toHaveTextContent(/83\.6\s*kg/i);
    expect(within(recentEntries).getByText(/^83\.6 kg$/i)).toBeInTheDocument();
  });

  it("keeps card latest values unfiltered when recent entries are filtered", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitionsWithManyMetrics();
    mockMetricEntriesByFilters({
      cardEntries: [
        {
          id: 1,
          metric_definition: "resting_hr",
          value: 61,
          recorded_at: "2026-03-06T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-06T07:15:02Z",
        },
        {
          id: 2,
          metric_definition: "body_weight",
          value: 87,
          recorded_at: "2026-03-01T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-01T07:15:02Z",
        },
      ],
      recentEntries: [
        {
          id: 3,
          metric_definition: "body_weight",
          value: 87,
          recorded_at: "2026-03-01T07:15:00Z",
          source: "manual",
          context: {},
          created_at: "2026-03-01T07:15:02Z",
        },
      ],
    });

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    await user.selectOptions(
      screen.getByLabelText(/filter recent entries by metric/i),
      "body_weight",
    );

    const restingHeartRateCard = screen
      .getByRole("heading", { name: /resting heart rate/i })
      .closest(".metric-card") as HTMLElement;

    expect(useMetricEntriesQuery).toHaveBeenCalledWith({ limit: 50 });
    expect(useMetricEntriesQuery).toHaveBeenLastCalledWith({
      metric: "body_weight",
      limit: 5,
    });
    expect(restingHeartRateCard).toHaveTextContent(/61\s*bpm/i);
  });

  it("filters recent entries by selected metric", async () => {
    const user = userEvent.setup();

    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });
    mockLoadedMetricDefinitions();

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    await user.selectOptions(
      screen.getByLabelText(/filter recent entries by metric/i),
      "resting_hr",
    );

    expect(useMetricEntriesQuery).toHaveBeenLastCalledWith({
      metric: "resting_hr",
      limit: 5,
    });
  });

  it("links metric cards to their metric detail pages", async () => {
    vi.mocked(getMe).mockResolvedValue({
      email: "user@example.com",
    });

    mockLoadedMetricDefinitions();
    mockLoadedMetricEntries([]);

    renderRoute("/");

    const metricLink = await screen.findByRole("link", {
      name: /resting heart rate/i,
    });

    expect(metricLink).toHaveAttribute("href", "/metrics/resting_hr");
  });

  it("links recent entries to their metric detail pages", async () => {
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
    ]);

    renderRoute("/");

    await screen.findByRole("heading", { name: /dashboard/i });

    const recentEntries = screen.getByRole("region", {
      name: /metric entries/i,
    });
    const entryLink = within(recentEntries).getByRole("link", {
      name: /resting heart rate/i,
    });

    expect(entryLink).toHaveAttribute("href", "/metrics/resting_hr");
  });
});
