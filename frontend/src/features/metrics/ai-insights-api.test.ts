import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import { generateAiReview, savePersonalAiKey } from "./ai-insights-api";

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
    const review = generateAiReview("Europe/Tirane", "z-ai/glm-5.3-flash");
    await vi.advanceTimersByTimeAsync(4000);
    expect(await review).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      timezone: "Europe/Tirane",
      consent: true,
      model: "z-ai/glm-5.3-flash",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("job_id=job-id");
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
