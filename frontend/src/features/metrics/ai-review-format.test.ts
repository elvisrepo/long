import { expect, it } from "vitest";
import {
  formatEvidencePeriod,
  formatReviewRange,
  formatReviewExact,
} from "./ai-review-format";
it("formats compact date ranges without losing year boundaries or local generation time", () => {
  expect(formatReviewRange({ from: "2026-10-20", to: "2026-10-26" })).toBe(
    "20–26 Oct 2026",
  );
  expect(formatReviewRange({ from: "2026-09-27", to: "2026-10-26" })).toBe(
    "27 Sept–26 Oct 2026",
  );
  expect(formatReviewRange({ from: "2025-12-29", to: "2026-01-04" })).toBe(
    "29 Dec 2025 – 4 Jan 2026",
  );
  expect(formatReviewRange({ from: "2026-10-26", to: "2026-10-26" })).toBe(
    "26 Oct 2026",
  );
  expect(formatReviewExact("2026-10-17T00:30:00Z", "America/Los_Angeles")).toBe(
    "2026-10-16 17:30:00",
  );
});
it("preserves missingness, real zeroes and measurement coverage", () => {
  expect(
    formatEvidencePeriod({ daily_average: null, observed_days: 0 }, "ms", 7),
  ).toBe("No measurements");
  expect(
    formatEvidencePeriod({ daily_average: 0, observed_days: 1 }, "°C", 7),
  ).toBe("0 °C · 1/7 days");
  expect(formatEvidencePeriod({ count: 0, logged_days: 0 }, "", 1)).toBe(
    "0 logged · 0/1 day",
  );
});
