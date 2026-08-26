import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken, setAccessToken } from "../auth/auth-session";
import {
  createSubscriptionCheckout,
  createSubscriptionPortal,
  getCurrentSubscription,
  getSubscriptionPlans,
} from "./subscriptions-api";

describe("getCurrentSubscription", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("fetches the authenticated user current subscription", async () => {
    setAccessToken("access-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "subscription-id",
        status: "active",
        billing_portal_available: false,
        current_period_start: null,
        current_period_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        price: null,
        plan: {
          code: "free",
          name: "Free",
          active_custom_metric_limit: 3,
          wearable_connection_limit: 1,
          automatic_sync_enabled: false,
          sync_interval_minutes: 30,
          analytics_enabled: false,
          csv_import_enabled: false,
        },
      }),
    } as Response);

    const result = await getCurrentSubscription();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/subscriptions/current/", {
      method: "GET",
      headers: {
        Authorization: "Bearer access-token",
      },
    });
    expect(result.plan.code).toBe("free");
    expect(result.billing_portal_available).toBe(false);
    expect(result.price).toBeNull();
  });

  it("rejects without an access token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getCurrentSubscription()).rejects.toThrow(
      "Authentication required",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getSubscriptionPlans", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("fetches the public plan catalog with active prices", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          code: "pro",
          name: "Pro",
          active_custom_metric_limit: 10,
          wearable_connection_limit: 2,
          automatic_sync_enabled: true,
          sync_interval_minutes: 15,
          analytics_enabled: true,
          csv_import_enabled: true,
          is_default: false,
          prices: [
            {
              id: "price-id",
              currency: "usd",
              unit_amount: 1000,
              billing_interval: "month",
            },
          ],
        },
      ],
    } as Response);

    const result = await getSubscriptionPlans();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/subscriptions/plans/", {
      method: "GET",
    });
    expect(result[0]?.prices[0]?.id).toBe("price-id");
  });
});

describe("createSubscriptionCheckout", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("posts the selected internal price id with the access token", async () => {
    setAccessToken("access-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://checkout.stripe.com/c/test-session",
      }),
    } as Response);

    const result = await createSubscriptionCheckout({
      priceId: "price-id",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/subscriptions/checkout/", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_id: "price-id",
      }),
    });
    expect(result.url).toBe("https://checkout.stripe.com/c/test-session");
  });

  it("rejects without an access token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      createSubscriptionCheckout({
        priceId: "price-id",
      }),
    ).rejects.toThrow("Authentication required");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws backend validation detail when checkout creation fails", async () => {
    setAccessToken("access-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        price_id: ["You are already subscribed to this price."],
      }),
    } as Response);

    await expect(
      createSubscriptionCheckout({
        priceId: "price-id",
      }),
    ).rejects.toThrow("You are already subscribed to this price.");
  });
});

describe("createSubscriptionPortal", () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it("creates an authenticated Customer Portal session", async () => {
    setAccessToken("access-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://billing.stripe.com/p/test-session",
      }),
    } as Response);

    const result = await createSubscriptionPortal();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/subscriptions/portal/", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
      },
    });
    expect(result.url).toBe("https://billing.stripe.com/p/test-session");
  });

  it("rejects without an access token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(createSubscriptionPortal()).rejects.toThrow(
      "Authentication required",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the backend detail when portal creation fails", async () => {
    setAccessToken("access-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: "Unable to create Customer Portal session.",
      }),
    } as Response);

    await expect(createSubscriptionPortal()).rejects.toThrow(
      "Unable to create Customer Portal session.",
    );
  });
});
