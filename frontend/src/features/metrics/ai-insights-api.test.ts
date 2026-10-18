import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  generateAiReview,
  getAiPreview,
  savePersonalAiKey,
} from "./ai-insights-api";

describe("AI insights requests", () => {
  afterEach(() => {
    clearAccessToken();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("queues a review and polls until the server result is ready", async () => {
    vi.useFakeTimers();
    setAccessToken("test-access");
    const result = {
      generated_at: "2026-10-17",
      review: { observations: [], suggestion: "Keep logging." },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "job-id" }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ready", result })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const review = generateAiReview(
      "Europe/Tirane",
      "z-ai/glm-5.3-flash",
      "month",
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(await review).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      timezone: "Europe/Tirane",
      consent: true,
      timeframe: "month",
      model: "z-ai/glm-5.3-flash",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("job_id=job-id");
  });

  it("requests the selected period when loading tracker data and saved history", async () => {
    setAccessToken("test-access");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ available: true })));
    vi.stubGlobal("fetch", fetchMock);
    await getAiPreview("Europe/Tirane", "day");
    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("timeframe")).toBe("day");
    expect(url.searchParams.get("timezone")).toBe("Europe/Tirane");
  });

  it("keeps polling when a queued review waits longer than four minutes", async () => {
    vi.useFakeTimers();
    setAccessToken("test-access");
    const result = { generated_at: "2026-10-18", review: { suggestions: [] } };
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, options) => {
        if (options?.method === "POST")
          return Promise.resolve(
            new Response(JSON.stringify({ job_id: "queued" }), { status: 202 }),
          );
        polls++;
        return Promise.resolve(
          new Response(
            JSON.stringify(
              polls > 150 ? { status: "ready", result } : { status: "pending" },
            ),
          ),
        );
      }),
    );
    const completed = generateAiReview("UTC").then(
      (result) => ({ result }),
      (error) => ({ error: error.message }),
    );
    await vi.advanceTimersByTimeAsync(304000);
    expect(await completed).toEqual({ result });
  });

  it("sends a personal key in the authenticated body, never the URL", async () => {
    setAccessToken("test-access");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ has_personal_key: true })),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await savePersonalAiKey("nvapi-test-personal")).toEqual({
      has_personal_key: true,
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toContain("nvapi-");
    expect(options.method).toBe("PUT");
    expect(options.headers.Authorization).toBe("Bearer test-access");
    expect(JSON.parse(options.body)).toEqual({
      api_key: "nvapi-test-personal",
    });
  });
});
