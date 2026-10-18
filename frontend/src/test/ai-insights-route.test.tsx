import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe } from "../features/auth/auth-me-api";
import {
  getAiPreview,
  getSavedAiReview,
  generateAiReview,
  getPersonalAiKey,
  savePersonalAiKey,
  removePersonalAiKey,
} from "../features/metrics/ai-insights-api";
import { renderRoute } from "./render-route";

vi.mock("../features/auth/auth-me-api", () => ({ getMe: vi.fn() }));
vi.mock("../features/metrics/ai-insights-api", () => ({
  getAiPreview: vi.fn(),
  getSavedAiReview: vi.fn(),
  generateAiReview: vi.fn(),
  getPersonalAiKey: vi.fn().mockResolvedValue({ has_personal_key: false }),
  savePersonalAiKey: vi.fn(),
  removePersonalAiKey: vi.fn(),
}));

const snapshot = {
  timezone: "UTC",
  period: { from: "2026-10-10", to: "2026-10-16" },
  previous_period: { from: "2026-10-03", to: "2026-10-09" },
  evidence: {
    hrv: {
      label: "Heart Rate Variability",
      unit: "ms",
      current: { daily_average: 44, observed_days: 1 },
      previous: { daily_average: null, observed_days: 0 },
      change: null,
      series: [],
    },
  },
};

describe("Weekly AI insights", () => {
  afterEach(() => vi.resetAllMocks());

  it("saves a personal key, clears the password input, and can remove it", async () => {
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(getAiPreview).mockResolvedValue({ available: false, snapshot });
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: false });
    vi.mocked(savePersonalAiKey).mockImplementation(async () => {
      vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
      return { has_personal_key: true };
    });
    vi.mocked(removePersonalAiKey).mockImplementation(async () => {
      vi.mocked(getPersonalAiKey).mockResolvedValue({
        has_personal_key: false,
      });
      return { has_personal_key: false };
    });
    renderRoute("/analytics/ai");
    const input = await screen.findByLabelText("NVIDIA API key");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "nvapi-test-personal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(savePersonalAiKey).toHaveBeenCalledWith("nvapi-test-personal"),
    );
    await waitFor(() => expect(input).toHaveValue(""));
    fireEvent.click(await screen.findByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(removePersonalAiKey).toHaveBeenCalledTimes(1));
  });

  it("previews actual summary and only generates after consent and a click", async () => {
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(getAiPreview).mockResolvedValue({
      available: true,
      model: "nvidia/nemotron-3-super-120b-a12b",
      snapshot,
    });
    vi.mocked(generateAiReview).mockResolvedValue({
      snapshot,
      generated_at: "2026-10-17T12:00:00Z",
      review: {
        suggestions: [
          { text: "Keep tracking consistently.", evidence_keys: ["hrv"] },
        ],
      },
    });
    renderRoute("/analytics/ai");
    const button = await screen.findByRole("button", {
      name: "Generate suggestions",
    });
    expect(button).toBeDisabled();
    expect(await screen.findByText("44 ms · 1/7 days")).toBeInTheDocument();
    expect(
      screen.getByText("Model: nvidia/nemotron-3-super-120b-a12b"),
    ).toBeInTheDocument();
    expect(generateAiReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(
      await screen.findByText("Keep tracking consistently."),
    ).toBeInTheDocument();
    expect(screen.getByText("Keep tracking consistently.")).toBeInTheDocument();
    expect(generateAiReview).toHaveBeenCalledTimes(1);
  });

  it("shows only suggestions from older comprehensive reviews, preserving the tracker table", async () => {
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(getAiPreview).mockResolvedValue({ available: true, snapshot });
    vi.mocked(generateAiReview).mockResolvedValue({
      snapshot,
      generated_at: "2026-10-17T12:00:00Z",
      review: {
        overview: "Your activity changed alongside your sleep pattern.",
        sections: [
          "health",
          "activity",
          "workouts",
          "diet",
          "recovery",
          "stretching",
        ].map((key) => ({
          key,
          text: `Detailed ${key} analysis.\nCoverage is limited.`,
          evidence_keys: ["hrv"],
        })),
        connections: [
          {
            text: "Examine aligned activity and sleep dates.",
            evidence_keys: ["hrv"],
          },
        ],
        priorities: [
          {
            text: "Review your routine after the next week.",
            evidence_keys: ["hrv"],
          },
        ],
      },
    });
    renderRoute("/analytics/ai");
    const button = await screen.findByRole("button", {
      name: "Generate suggestions",
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(
      await screen.findByText("Review your routine after the next week."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Your activity changed alongside your sleep pattern."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Detailed diet analysis."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Examine aligned activity and sleep dates."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your tracker summary" }),
    ).toBeInTheDocument();
  });

  it("lets the user choose a model and generates with that selection", async () => {
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(getAiPreview).mockResolvedValue({
      available: true,
      snapshot,
      model: "nvidia/nemotron-3-super-120b-a12b",
      models: [
        { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super" },
        { id: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      ],
    });
    vi.mocked(generateAiReview).mockResolvedValue({
      snapshot,
      generated_at: "2026-10-17T12:00:00Z",
      model: "deepseek-ai/deepseek-v4.1-flash",
      review: {
        observations: [
          { text: "Selected model review.", evidence_keys: ["hrv"] },
        ],
        suggestion: "Compare the same exercise next week.",
      },
    });
    renderRoute("/analytics/ai");
    const selector = await screen.findByRole("combobox", {
      name: "Review model",
    });
    fireEvent.change(selector, {
      target: { value: "deepseek-ai/deepseek-v4.1-flash" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    expect(
      await screen.findByText("Compare the same exercise next week."),
    ).toBeInTheDocument();
    expect(generateAiReview).toHaveBeenCalledWith(
      expect.any(String),
      "deepseek-ai/deepseek-v4.1-flash",
      "week",
    );
    expect(selector).toHaveValue("deepseek-ai/deepseek-v4.1-flash");
  });

  it("shows provider availability and does not offer generation when unconfigured", async () => {
    vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
    vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
    vi.mocked(getAiPreview).mockResolvedValue({ available: false, snapshot });
    renderRoute("/analytics/ai");
    await waitFor(() =>
      expect(
        screen.getByText(/AI generation is not configured yet/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Generate suggestions" }),
    ).toBeDisabled();
    expect(generateAiReview).not.toHaveBeenCalled();
  });
});

it("restores the saved review on refresh without generating a new one", async () => {
  vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
  vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
  vi.mocked(getAiPreview).mockResolvedValue({
    available: true,
    snapshot,
    latest_review: {
      id: "saved-review",
      model: "z-ai/glm-5.3-flash",
      snapshot: { ...snapshot, timezone: "America/Los_Angeles" },
      generated_at: "2026-10-17T00:30:00Z",
      review: {
        observations: [
          { text: "Your saved weekly review.", evidence_keys: ["hrv"] },
        ],
        suggestion: "Try the same routine next week.",
      },
    },
    review_history: [
      {
        id: "saved-review",
        model: "z-ai/glm-5.3-flash",
        generated_at: "2026-10-17T00:30:00Z",
        timezone: "America/Los_Angeles",
        period_start: "2026-10-10",
        period_end: "2026-10-16",
      },
    ],
  });
  renderRoute("/analytics/ai");
  expect(
    await screen.findByText("Try the same routine next week."),
  ).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Saved reviews" })).toHaveValue(
    "saved-review",
  );
  expect(
    screen.getByText(/Generated 2026-10-16 17:30:00 · America\/Los_Angeles/),
  ).toBeInTheDocument();
  expect(generateAiReview).not.toHaveBeenCalled();
});

it("loads an older saved review with its original evidence", async () => {
  vi.clearAllMocks();
  vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
  vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
  const oldSnapshot = {
    ...snapshot,
    period: { from: "2026-10-03", to: "2026-10-09" },
    evidence: {
      hrv: {
        ...snapshot.evidence.hrv,
        current: { daily_average: 55, observed_days: 7 },
      },
    },
  };
  const older = {
    id: "older",
    model: "z-ai/glm-5.3-flash",
    snapshot: oldSnapshot,
    generated_at: "2026-10-10T12:00:00Z",
    review: {
      observations: [
        { text: "An older saved review.", evidence_keys: ["hrv"] },
      ],
      suggestion: "Compare the prior week.",
    },
  };
  vi.mocked(getAiPreview).mockResolvedValue({
    available: true,
    snapshot,
    latest_review: {
      ...older,
      id: "latest",
      snapshot,
      review: {
        observations: [
          { text: "Latest saved review.", evidence_keys: ["hrv"] },
        ],
        suggestion: "Current suggestion.",
      },
    },
    review_history: [
      {
        id: "latest",
        model: older.model,
        generated_at: "2026-10-17T12:00:00Z",
        timezone: "UTC",
        period_start: "2026-10-10",
        period_end: "2026-10-16",
      },
      {
        id: "older",
        model: older.model,
        generated_at: older.generated_at,
        timezone: "UTC",
        period_start: "2026-10-03",
        period_end: "2026-10-09",
      },
    ],
  });
  vi.mocked(getSavedAiReview).mockResolvedValue({
    status: "ready",
    result: older,
  });
  renderRoute("/analytics/ai");
  const selector = await screen.findByRole("combobox", {
    name: "Saved reviews",
  });
  fireEvent.change(selector, { target: { value: "older" } });
  expect(
    await screen.findByText("Compare the prior week."),
  ).toBeInTheDocument();
  expect(getSavedAiReview).toHaveBeenCalledWith("older");
  expect(screen.getByRole("table")).toHaveTextContent("55 ms · 7/7 days");
  expect(
    screen.getByText("Based on data: 2026-10-03 – 2026-10-09 · UTC"),
  ).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent(
    "2026-10-03 – 2026-10-09",
  );
  expect(
    screen.getByRole("combobox", { name: "Saved reviews" }),
  ).toHaveTextContent("Generated:");
  expect(generateAiReview).not.toHaveBeenCalled();
});

it("uses the selected data period for preview, generation and coverage without retaining another period's suggestions", async () => {
  vi.clearAllMocks();
  vi.mocked(getPersonalAiKey).mockResolvedValue({ has_personal_key: true });
  vi.mocked(getMe).mockResolvedValue({ email: "user@example.com" });
  vi.mocked(getAiPreview).mockImplementation(
    async (_zone, timeframe = "week") => ({
      available: true,
      snapshot: {
        ...snapshot,
        timeframe,
        days: timeframe === "day" ? 1 : timeframe === "month" ? 30 : 7,
      },
    }),
  );
  vi.mocked(generateAiReview).mockResolvedValue({
    snapshot: { ...snapshot, timeframe: "month", days: 30 },
    generated_at: "2026-10-18T12:00:00Z",
    review: {
      suggestions: [
        { text: "A monthly routine suggestion.", evidence_keys: ["hrv"] },
      ],
    },
  });
  renderRoute("/analytics/ai");
  const period = await screen.findByRole("combobox", { name: "Data period" });
  expect(period).toHaveValue("week");
  fireEvent.change(period, { target: { value: "month" } });
  await waitFor(() =>
    expect(getAiPreview).toHaveBeenLastCalledWith(expect.any(String), "month"),
  );
  expect(await screen.findByText("44 ms · 1/30 days")).toBeInTheDocument();
  expect(window.location.search).toContain("timeframe=month");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
  expect(
    await screen.findByText("A monthly routine suggestion."),
  ).toBeInTheDocument();
  expect(generateAiReview).toHaveBeenCalledWith(
    expect.any(String),
    undefined,
    "month",
  );
  fireEvent.change(period, { target: { value: "day" } });
  expect(await screen.findByText("44 ms · 1/1 day")).toBeInTheDocument();
  expect(
    screen.queryByText("A monthly routine suggestion."),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
