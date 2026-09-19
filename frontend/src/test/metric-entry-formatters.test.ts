import { describe, expect, it } from "vitest";

import {
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
