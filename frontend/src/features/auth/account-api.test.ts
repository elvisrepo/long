import { afterEach, expect, it, vi } from "vitest";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./auth-session";
import { deleteAccount, downloadAccountData } from "./account-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAccessToken();
});

it("deletes with bearer authentication and password, then clears the access token", async () => {
  setAccessToken("access-token");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await deleteAccount("current password");
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/", {
    method: "DELETE",
    credentials: "include",
    headers: {
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: "current password" }),
  });
  expect(getAccessToken()).toBeNull();
});

it("keeps the session on failed deletion and displays the backend validation error", async () => {
  setAccessToken("access-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ password: ["Password is incorrect."] }), {
        status: 400,
      }),
    ),
  );
  await expect(deleteAccount("wrong")).rejects.toThrow(
    "Password is incorrect.",
  );
  expect(getAccessToken()).toBe("access-token");
});

it("downloads account JSON using bearer auth and releases the download URL", async () => {
  setAccessToken("access-token");
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"profile":{}}'));
  vi.stubGlobal("fetch", fetchMock);
  const create = vi.fn().mockReturnValue("blob:account");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("longevity-account.json");
    });
  await downloadAccountData();
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/export/", {
    headers: { Authorization: "Bearer access-token" },
  });
  expect(click).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:account");
  expect(document.querySelector("a[download]")).toBeNull();
});

it("requires authentication before making account requests", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(downloadAccountData()).rejects.toThrow(
    "Authentication required",
  );
  await expect(deleteAccount("password")).rejects.toThrow(
    "Authentication required",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
