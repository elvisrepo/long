import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  createRecoveryTool,
  getRecoveryEntries,
  getRecoveryTools,
  setRecoveryCheckoff,
  updateRecoveryTool,
} from "./recovery-api";

describe("Recovery API", () => {
  beforeEach(() => {
    setAccessToken("test-access");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () => new Response("[]", { status: 200 })),
    );
  });
  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it("requires authentication before making a request", async () => {
    clearAccessToken();
    await expect(getRecoveryTools()).rejects.toThrow("Authentication required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses bearer auth and an explicit calendar range", async () => {
    await getRecoveryEntries("2026-09-24", "2026-09-30");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/recovery/entries/?date_from=2026-09-24&date_to=2026-09-30",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-access",
        }),
      }),
    );
  });

  it("uses idempotent PUT and DELETE for daily check-offs", async () => {
    await setRecoveryCheckoff("tool-id", "2026-09-30", true);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/recovery/entries/tool-id/2026-09-30/",
      expect.objectContaining({ method: "PUT", body: "{}" }),
    );
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await setRecoveryCheckoff("tool-id", "2026-09-30", false);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/recovery/entries/tool-id/2026-09-30/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends only custom-tool fields and archive state", async () => {
    await createRecoveryTool("Sauna");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/recovery/tools/",
      expect.objectContaining({ method: "POST", body: '{"name":"Sauna"}' }),
    );
    await updateRecoveryTool("tool-id", false);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/recovery/tools/tool-id/",
      expect.objectContaining({ method: "PATCH", body: '{"is_active":false}' }),
    );
  });

  it.each([{ detail: "Pro required" }, { name: ["Name is required"] }])(
    "surfaces backend errors",
    async (payload) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 403 }),
      );
      await expect(createRecoveryTool("Sauna")).rejects.toThrow(
        Object.values(payload)[0] instanceof Array
          ? "Name is required"
          : "Pro required",
      );
    },
  );

  it("handles non-JSON failures", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Unavailable", { status: 502 }),
    );
    await expect(getRecoveryTools()).rejects.toThrow("Recovery request failed");
  });
});
