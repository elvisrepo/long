import { afterEach, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getMetricEntries } from "./metric-entries-api";

afterEach(() => {
  clearAccessToken();
  vi.restoreAllMocks();
});

it.each([
  ["distance", "daily-distance"],
  ["total_calories_burned", "daily-total-calories"],
])(
  "loads %s as daily totals in the requested timezone",
  async (metric, endpoint) => {
    setAccessToken("access-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    await getMetricEntries({
      metric,
      daily: true,
      timezone: "Europe/Tirane",
      limit: 7,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/metrics/entries/${endpoint}/?timezone=Europe%2FTirane&limit=7`,
      expect.objectContaining({ method: "GET" }),
    );
  },
);
