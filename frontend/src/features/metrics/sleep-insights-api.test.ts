import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getSleepInsights } from "./sleep-insights-api";

describe("getSleepInsights", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("fetches Sleep insights for the selected target", async () => {
    setAccessToken("access-token");
    const responseBody = {
      range_days: 7 as const,
      target_minutes: 450,
      series: [
        {
          date: "2026-09-19",
          duration_minutes: 410,
          period_start: "2026-09-18T23:00:00Z",
          recorded_at: "2026-09-19T05:50:00Z",
          shortfall_minutes: 40,
        },
      ],
      summary: {
        tracked_nights: 1,
        nights_under_target: 1,
        total_shortfall_minutes: 40,
        average_duration_minutes: 410,
        worst_night: {
          date: "2026-09-19",
          duration_minutes: 410,
        },
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await getSleepInsights(450);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/metrics/analytics/sleep/?target_minutes=450",
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

    await expect(getSleepInsights(450)).rejects.toThrow(
      "Pro analytics are required.",
    );
  });
});
