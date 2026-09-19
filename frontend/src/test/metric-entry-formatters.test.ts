import { describe, expect, it } from "vitest";

import {
  formatSleepDate,
  formatSleepWindow,
  formatMetricValue,
  formatMetricValueWithUnit,
} from "../features/metrics/metric-entry-formatters";

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
