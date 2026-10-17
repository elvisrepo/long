import { afterEach, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getMetricEntries } from "./metric-entries-api";
import { formatMetricValueWithUnit } from "./metric-entry-formatters";

afterEach(() => {
  clearAccessToken();
  vi.restoreAllMocks();
});

it.each([
  ["respiratory_rate", "daily-respiratory-rate"],
  ["skin_temperature", "daily-skin-temperature"],
])("loads %s daily medians", async (metric, endpoint) => {
  setAccessToken("token");
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: true,
      json: async () => [],
    } as unknown as Response);
  await getMetricEntries({ metric, daily: true, timezone: "UTC", limit: 7 });
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/v1/metrics/entries/${endpoint}/?timezone=UTC&limit=7`,
    expect.objectContaining({ method: "GET" }),
  );
});

it("formats breaths and negative skin changes without floating point noise", () => {
  expect(
    formatMetricValueWithUnit(
      16.700000000000003,
      "respiratory_rate",
      "breaths/min",
    ),
  ).toBe("16.7 breaths/min");
  expect(
    formatMetricValueWithUnit(-0.30000000000000004, "skin_temperature", "°C"),
  ).toBe("-0.3 °C");
});
