import { afterEach, expect, it, vi } from "vitest";
import { setAccessToken, clearAccessToken } from "../auth/auth-session";
import { getPersonalInfo, updatePersonalInfo } from "./personal-info-api";

afterEach(() => {
  vi.unstubAllGlobals();
  clearAccessToken();
});

it("authenticates profile reads and sends only the explicit profile fields on save", async () => {
  setAccessToken("profile-token");
  const fetchMock = vi.fn().mockImplementation(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  await getPersonalInfo();
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/", {
    method: "GET",
    headers: { Authorization: "Bearer profile-token" },
  });
  const input = {
    date_of_birth: "1990-04-20",
    sex: "male" as const,
    height_cm: 180,
  };
  await updatePersonalInfo(input);
  expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/me/", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer profile-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
});

it("does not request personal data without authentication", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(getPersonalInfo()).rejects.toThrow("Authentication required");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reports known field validation and hides unexpected backend error details", async () => {
  setAccessToken("profile-token");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"height_cm":["Must be at least 50."]}', { status: 400 }),
    )
    .mockResolvedValueOnce(
      new Response('{"detail":"private backend detail"}', { status: 500 }),
    );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    updatePersonalInfo({ date_of_birth: null, sex: null, height_cm: 20 }),
  ).rejects.toThrow("Height: Must be at least 50.");
  await expect(getPersonalInfo()).rejects.toThrow(
    "Personal info failed to load. Please try again.",
  );
});
