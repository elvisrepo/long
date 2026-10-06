import { afterEach, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  getWorkoutCatalog,
  getWorkoutRange,
  saveWorkoutSet,
  deleteWorkoutItem,
  getProgressPage,
  copyWorkout,
} from "./workout-api";

afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
});
it("posts selective-copy occurrence IDs and set IDs without performance fields", async () => {
  setAccessToken("workout-token");
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "copy" })));
  vi.stubGlobal("fetch", fetcher);
  await copyWorkout("source", "2026-10-03", [
    { item_id: "occurrence", set_ids: ["set"] },
  ]);
  expect(fetcher.mock.calls[0][0]).toBe(
    "/api/v1/workouts/sessions/source/copy/",
  );
  const init = fetcher.mock.calls[0][1];
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({
    performed_on: "2026-10-03",
    selection: [{ item_id: "occurrence", set_ids: ["set"] }],
  });
});
it("requests all-time summaries through an owned same-origin exercise path", async () => {
  setAccessToken("workout-token");
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        count: 0,
        next: null,
        previous: null,
        results: [],
        types: [],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await getProgressPage("exercise", "2026-10-02", "estimated_1rm", 5, 500);
  expect(fetcher.mock.calls[0][0]).toBe(
    "/api/v1/workouts/exercises/exercise/progress/?date_to=2026-10-02&metric=estimated_1rm&reps=5&limit=500&offset=500",
  );
});

it("paginates its own API path rather than following arbitrary next URLs", async () => {
  setAccessToken("workout-token");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ id: "a" }],
          next: "https://untrusted.test/steal",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ id: "b" }], next: null })),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await getWorkoutRange("2026-10-01", "2026-10-02")).toEqual([
    { id: "a" },
    { id: "b" },
  ]);
  expect(fetcher.mock.calls[1][0]).toBe(
    "/api/v1/workouts/sessions/?date_from=2026-10-01&date_to=2026-10-02&limit=100&offset=1",
  );
});
it("preserves partial set edits and reports nested validation errors", async () => {
  setAccessToken("workout-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reps: ["Enter a positive value."] }), {
        status: 400,
      }),
    ),
  );
  await expect(
    saveWorkoutSet("i", "s", { is_completed: true }),
  ).rejects.toThrow("reps: Enter a positive value.");
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/workouts/sets/s/",
    expect.objectContaining({ method: "PATCH", body: '{"is_completed":true}' }),
  );
});
it("accepts an empty successful DELETE response", async () => {
  setAccessToken("workout-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  await expect(deleteWorkoutItem("sets", "s")).resolves.toBeUndefined();
});
it("requires a bearer token and never fetches without one", async () => {
  vi.stubGlobal("fetch", vi.fn());
  clearAccessToken();
  await expect(getWorkoutCatalog()).rejects.toThrow("Authentication required");
  expect(fetch).not.toHaveBeenCalled();
  setAccessToken("workout-token");
  vi.mocked(fetch).mockResolvedValue(
    new Response('{"categories":[],"exercises":[]}'),
  );
  await getWorkoutCatalog();
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/workouts/catalog/",
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer workout-token",
      }),
    }),
  );
});
