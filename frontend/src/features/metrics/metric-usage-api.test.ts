import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getMetricUsage } from "./metric-usage-api";

describe("getMetricUsage", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
      setAccessToken("access-token");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      clearAccessToken();
    });

    test("fetches active custom metric usage", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            active_custom_metrics: {
              used: 2,
              limit: 3,
            },
          }),
          { status: 200 },
        ),
      );

      const result = await getMetricUsage();

      expect(fetch).toHaveBeenCalledWith("/api/v1/metrics/usage/", {
        method: "GET",
        headers: {
          Authorization: "Bearer access-token",
        },
      });

      expect(result).toEqual({
        active_custom_metrics: {
          used: 2,
          limit: 3,
        },
      });
    });
  });