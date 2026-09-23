import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getConsistencyAnalytics } from "./consistency-analytics-api";

describe("getConsistencyAnalytics", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("fetches authenticated consistency analytics", async () => {
    setAccessToken("access-token");
    const responseBody = {
      range_days: 7,
      dates: ["2026-09-21"],
      metrics: [],
      summary: {
        metrics_with_data: 0,
        total_metrics: 6,
        days_with_any_data: 0,
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await getConsistencyAnalytics();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/metrics/analytics/consistency/",
      {
        method: "GET",
        headers: { Authorization: "Bearer access-token" },
      },
    );
    expect(result).toEqual(responseBody);
  });

  it("preserves a safe backend error detail", async () => {
    setAccessToken("access-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Pro analytics are required." }),
    } as Response);

    await expect(getConsistencyAnalytics()).rejects.toThrow(
      "Pro analytics are required.",
    );
  });
});
