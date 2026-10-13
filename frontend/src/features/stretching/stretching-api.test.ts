import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  createCustomStretch,
  getStretchEntries,
  getStretchPreferences,
  setStretchCheckoff,
  updateStretchPreferences,
} from "./stretching-api";

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

  it("loads and updates the authenticated user's catalog preferences", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          show_shared_exercises: false,
          hidden_exercise_ids: ["exercise-id"],
        }),
        { status: 200 },
      ),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          show_shared_exercises: true,
          hidden_exercise_ids: ["exercise-id"],
        }),
        { status: 200 },
      ),
    );
    await getStretchPreferences();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/stretching/preferences/",
      expect.objectContaining({ method: "GET" }),
    );

    await updateStretchPreferences({ show_shared_exercises: true });
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/stretching/preferences/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ show_shared_exercises: true }),
      }),
    );
  });

  it("posts custom stretch fields as authenticated multipart form data", async () => {
    await createCustomStretch({
      phase: "upper-body",
      name: "Desk release",
      description: "A cue.",
      dosage: "30 seconds",
    });
    const [path, options] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/v1/stretching/exercises/");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({ Authorization: "Bearer test-access" });
    expect(options?.body).toBeInstanceOf(FormData);
    const form = options?.body as FormData;
    expect(form.get("phase")).toBe("upper-body");
    expect(form.get("name")).toBe("Desk release");
    expect(form.get("description")).toBe("A cue.");
  });
});
