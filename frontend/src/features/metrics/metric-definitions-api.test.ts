import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  createMetricDefinition,
  getMetricDefinitions,
  updateMetricDefinition,
} from "./metric-definitions-api";

describe("getMetricDefinitions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    setAccessToken("access-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  test("fetches metric definitions with the stored access token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "metric-id",
            name: "Resting Heart Rate",
            slug: "resting_hr",
            unit: "bpm",
            category: "cardiovascular",
            min_value: 20,
            max_value: 220,
            is_default: true,
            is_active: true,
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await getMetricDefinitions();

    expect(fetch).toHaveBeenCalledWith("/api/v1/metrics/definitions/", {
      method: "GET",
      headers: {
        Authorization: "Bearer access-token",
      },
    });
    expect(result).toEqual([
      {
        id: "metric-id",
        name: "Resting Heart Rate",
        slug: "resting_hr",
        unit: "bpm",
        category: "cardiovascular",
        min_value: 20,
        max_value: 220,
        is_default: true,
        is_active: true,
      },
    ]);
  });

  test("fetches metric definitions including inactive custom metrics", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "metric-id",
            name: "Mood",
            slug: "mood",
            unit: "score",
            category: "custom",
            min_value: 1,
            max_value: 10,
            is_default: false,
            is_active: false,
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await getMetricDefinitions({ includeInactive: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/metrics/definitions/?include_inactive=true",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer access-token",
        },
      },
    );
    expect(result[0].is_active).toBe(false);
  });

  test("rejects when there is no access token", async () => {
    clearAccessToken();

    await expect(getMetricDefinitions()).rejects.toThrow(
      "Authentication required",
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  test("rejects when metric definitions fail to load", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(getMetricDefinitions()).rejects.toThrow(
      "Metric definitions failed to load",
    );
  });
});

describe("createMetricDefinition", () => {
  beforeEach(() => {
    // These tests execute the real helper and replace only the network boundary.
    vi.stubGlobal("fetch", vi.fn());
    setAccessToken("access-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  test("posts a custom metric definition with the access token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "metric-id",
          name: "Mood",
          slug: "mood",
          unit: "score",
          category: "custom",
          min_value: 1,
          max_value: 10,
          is_default: false,
        }),
        { status: 201 },
      ),
    );

    const result = await createMetricDefinition({
      name: "Mood",
      slug: "mood",
      unit: "score",
      minValue: 1,
      maxValue: 10,
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/metrics/definitions/", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Mood",
        slug: "mood",
        unit: "score",
        category: "custom",
        min_value: 1,
        max_value: 10,
      }),
    });
    expect(result.slug).toBe("mood");
  });

  test("requires an access token", async () => {
    clearAccessToken();

    await expect(
      createMetricDefinition({
        name: "Mood",
        slug: "mood",
        unit: "score",
        minValue: 1,
        maxValue: 10,
      }),
    ).rejects.toThrow("Authentication required");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("preserves backend validation errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        // Mirrors DRF's field-keyed validation error shape.
        JSON.stringify({
          slug: ["metric definition with this slug already exists."],
        }),
        { status: 400 },
      ),
    );

    await expect(
      createMetricDefinition({
        name: "Mood",
        slug: "mood",
        unit: "score",
        minValue: 1,
        maxValue: 10,
      }),
    ).rejects.toThrow("metric definition with this slug already exists.");
  });
});


describe("updateMetricDefinition", () => {
   beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
      setAccessToken("access-token");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      clearAccessToken();
    });

    test("patches a custom metric definition with the access token", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "metric-id",
            name: "Mood Score",
            slug: "mood",
            unit: "points",
            category: "custom",
            min_value: 0,
            max_value: 100,
            is_default: false,
          }),
          { status: 200 },
        ),
      );

      const result = await updateMetricDefinition("metric-id", {
        name: "Mood Score",
        unit: "points",
        minValue: 0,
        maxValue: 100,
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/metrics/definitions/metric-id/",
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer access-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Mood Score",
            unit: "points",
            min_value: 0,
            max_value: 100,
          }),
        },
      );
      expect(result).toEqual({
        id: "metric-id",
        name: "Mood Score",
        slug: "mood",
        unit: "points",
        category: "custom",
        min_value: 0,
        max_value: 100,
        is_default: false,
      });
    


    })

    test("requires an access token", async () => {
      clearAccessToken();

      await expect(
        updateMetricDefinition("metric-id", {
          name: "Mood Score",
        }),
      ).rejects.toThrow("Authentication required");

      expect(fetch).not.toHaveBeenCalled();
    });

    test("preserves backend validation errors", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            max_value: ["Max value must be greater than min value."],
          }),
          { status: 400 },
        ),
      );

      await expect(
        updateMetricDefinition("metric-id", {
          minValue: 100,
        }),
      ).rejects.toThrow("Max value must be greater than min value.");
    });

  test("patches a custom metric definition as inactive", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "metric-id",
          name: "Mood",
          slug: "mood",
          unit: "score",
          category: "custom",
          min_value: 1,
          max_value: 10,
          is_default: false,
        }),
        { status: 200 },
      ),
    );

    await updateMetricDefinition("metric-id", {
      isActive: false,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/metrics/definitions/metric-id/",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: false,
        }),
      },
    );
  });  
})
