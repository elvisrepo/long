import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { getStretchEntries, setStretchCheckoff } from "./stretching-api";

describe("Stretching API", () => {
  beforeEach(() => {
    setAccessToken("test-access");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );
  });
  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it("uses bearer auth and explicit date bounds", async () => {
    await getStretchEntries("2026-10-03", "2026-10-09");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/stretching/entries/?date_from=2026-10-03&date_to=2026-10-09",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-access",
        }),
      }),
    );
  });

  it("uses PUT and DELETE for daily check-offs", async () => {
    await setStretchCheckoff("exercise-id", "2026-10-09", true);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/stretching/entries/exercise-id/2026-10-09/",
      expect.objectContaining({ method: "PUT", body: "{}" }),
    );
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await setStretchCheckoff("exercise-id", "2026-10-09", false);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/stretching/entries/exercise-id/2026-10-09/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
