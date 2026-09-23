import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Playwright backend startup probe", () => {
  it("uses the canonical versioned liveness endpoint", () => {
    const config = readFileSync("playwright.config.ts", "utf8");

    expect(config).toContain("http://127.0.0.1:8001/api/v1/health/live/");
    expect(config).not.toContain("http://127.0.0.1:8001/health/");
  });
});
