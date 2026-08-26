import { describe, expect, it } from "vitest";

import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "./auth-session";

describe("auth session", () => {
  it("stores and returns the access token", () => {
    setAccessToken("test-access-token");

    expect(getAccessToken()).toBe("test-access-token");
  });

  it("clears the access token", () => {
    setAccessToken("test-access-token");

    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });
});
