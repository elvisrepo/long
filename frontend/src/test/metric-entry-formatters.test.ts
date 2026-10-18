import { describe, expect, it } from "vitest";

import {
  formatSleepDate,
  formatSleepWindow,
  formatChartAxisTick,
  formatMetricValue,
  formatMetricValueWithUnit,
} from "../features/metrics/metric-entry-formatters";

// Regression scenarios: noisy HRV values, fractional readings, integer readings,
// and consistent formatting in value labels, units and chart ticks.
describe("HRV formatting", () => {
  it("keeps floating-point noise out of HRV values and chart labels", () => {
    const value = 48.900000000000006;
    expect(formatMetricValue(value, "hrv")).toBe("48.9");
    expect(formatMetricValueWithUnit(value, "hrv", "ms")).toBe("48.9 ms");
    expect(formatChartAxisTick(value, "hrv", "ms")).toBe("48.9 ms");
    expect(formatMetricValue(48.96, "hrv")).toBe("49");
    expect(formatMetricValue(52, "hrv")).toBe("52");
  });
});

describe("sleep duration formatting", () => {
  it("renders decimal hours as hours and rounded minutes", () => {
    expect(formatMetricValue(7.5, "sleep_duration")).toBe("7h 30m");
    expect(formatMetricValue(7.999, "sleep_duration")).toBe("8h 00m");
    expect(formatMetricValue(-0.5, "sleep_duration")).toBe("-0h 30m");
    expect(formatMetricValueWithUnit(7.5, "sleep_duration", "hours")).toBe(
      "7h 30m",
    );
  });
});

describe("activity metric formatting", () => {
  it("preserves metre-scale distance and fractional active calories", () => {
    expect(formatMetricValueWithUnit(0.491, "distance", "km")).toBe("0.491 km");
    expect(
      formatMetricValueWithUnit(0.3, "total_calories_burned", "kcal"),
    ).toBe("0.3 kcal");
  });
});

describe("chart axis tick formatting", () => {
  it("trims binary float noise for custom metrics without changing integers", () => {
    expect(
      formatChartAxisTick(6.6000000000000005, "personal_score", "score"),
    ).toBe("6.6 score");
    expect(formatChartAxisTick(7, "personal_score", "score")).toBe("7 score");
    expect(formatChartAxisTick(8000, "steps", "steps")).toBe("8000 steps");
  });

  it("respects the body weight display precision on axis ticks", () => {
    expect(formatChartAxisTick(83.5999984741211, "body_weight", "kg")).toBe(
      "83.6 kg",
    );
  });

  it("keeps sleep duration ticks in hours and minutes", () => {
    expect(formatChartAxisTick(7.5, "sleep_duration", "hours")).toBe("7h 30m");
  });
});

describe("sleep window formatting", () => {
  it("renders the start and wake time in the viewer's timezone", () => {
    expect(
      formatSleepWindow(
        "2026-09-18T23:00:00Z",
        "2026-09-19T06:50:00Z",
        "Europe/Tirane",
      ),
    ).toBe("1:00 AM–8:50 AM");
  });

  it("renders the wake date in the same viewer timezone", () => {
    expect(formatSleepDate("2026-09-19T06:50:00Z", "Europe/Tirane")).toBe(
      "Sep 19, 2026",
    );
  });
});
