import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  getSleepTargetPreference,
  updateSleepTargetPreference,
} from "./sleep-target-preference-api";

describe("Sleep target preference API", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("reads the authenticated user's saved target", async () => {
    setAccessToken("access-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ target_minutes: 480 }),
    } as Response);

    await expect(getSleepTargetPreference()).resolves.toEqual({
      target_minutes: 480,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/metrics/preferences/sleep/",
      {
        method: "GET",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });

  it("updates the authenticated user's saved target", async () => {
    setAccessToken("access-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ target_minutes: 480 }),
    } as Response);

    await expect(updateSleepTargetPreference(480)).resolves.toEqual({
      target_minutes: 480,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/metrics/preferences/sleep/",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_minutes: 480 }),
      },
    );
  });
});
