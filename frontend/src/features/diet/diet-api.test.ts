import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  getDietCatalog,
  getDietEntries,
  saveDietItem,
  setDietCheckoff,
} from "./diet-api";
beforeEach(() => {
  setAccessToken("diet-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response("[]", { status: 200 })),
  );
});
afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
});
it("requires authentication", async () => {
  clearAccessToken();
  await expect(getDietCatalog()).rejects.toThrow("Authentication required");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses bearer authentication and bounded calendar date reads", async () => {
  await getDietEntries("2026-09-25", "2026-10-01");
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/diet/entries/?date_from=2026-09-25&date_to=2026-10-01",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer diet-token" }),
    }),
  );
});
it("sends section/food edits and idempotent check-offs", async () => {
  await saveDietItem("foods", undefined, { name: "Chicken", section_id: "s" });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/v1/diet/foods/",
    expect.objectContaining({
      method: "POST",
      body: '{"name":"Chicken","section_id":"s"}',
    }),
  );
  await saveDietItem("sections", "s", { is_active: false });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/v1/diet/sections/s/",
    expect.objectContaining({ method: "PATCH", body: '{"is_active":false}' }),
  );
  await setDietCheckoff("f", "2026-10-01", true);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/v1/diet/entries/f/2026-10-01/",
    expect.objectContaining({ method: "PUT", body: "{}" }),
  );
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await setDietCheckoff("f", "2026-10-01", false);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/v1/diet/entries/f/2026-10-01/",
    expect.objectContaining({ method: "DELETE" }),
  );
});
it.each([{ detail: "Restore section" }, { name: ["Duplicate name"] }])(
  "surfaces server validation errors",
  async (payload) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 400 }),
    );
    await expect(getDietCatalog()).rejects.toThrow(
      String(Object.values(payload)[0]),
    );
  },
);
