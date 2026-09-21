import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getWeightStepsAnalytics } from "./weight-steps-analytics-api";

describe("getWeightStepsAnalytics", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("fetches the selected range with the access token", async () => {
    setAccessToken("access-token");
    const responseBody = {
      range_days: 30 as const,
      series: [
        {
          date: "2026-09-19",
          weight_kg: 70.1,
          weight_7d_average_kg: 70.3,
          steps: 7300,
        },
      ],
      summary: {
        weight_start_kg: 70.1,
        weight_end_kg: 70.1,
        weight_change_kg: 0,
        average_daily_steps: 7300,
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await getWeightStepsAnalytics(30);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/metrics/analytics/weight-steps/?days=30",
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

    await expect(getWeightStepsAnalytics(30)).rejects.toThrow(
      "Pro analytics are required.",
    );
  });
});
