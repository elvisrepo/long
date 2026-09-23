import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "./support/e2e-api";

test.beforeEach(async ({ request }) => {
  await resetE2eDatabase(request);
});

test("user can register, log in, visit settings, and log out", async ({
  page,
}) => {
  const uniqueEmail = "e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");

  await expect(page.getByRole("heading", { name: /register/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await expect(
    page.getByRole("heading", { name: /resting heart rate/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /add resting heart rate entry/i })
    .click();
  await page.getByLabel(/resting heart rate value/i).fill("58");
  await page
    .getByRole("button", { name: /save resting heart rate entry/i })
    .click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/58 bpm/i)).toBeVisible();

  await page
    .getByLabel(/filter recent entries by metric/i)
    .selectOption("resting_hr");
  await expect(page.getByText(/58 bpm/i)).toBeVisible();

  await page.getByRole("link", { name: /settings/i }).click();

  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

  await expect(page.getByText(new RegExp(uniqueEmail, "i"))).toBeVisible();

  await page.getByRole("button", { name: /logout/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
});

test("reload restores the same-origin session and rotates the refresh cookie", async ({
  context,
  page,
}) => {
  const email = "session-restore-e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  const refreshCookieBefore = (
    await context.cookies("http://127.0.0.1:5173")
  ).find((cookie) => cookie.name === "refresh_token");

  expect(refreshCookieBefore).toBeDefined();
  expect(refreshCookieBefore?.httpOnly).toBe(true);

  const refreshRequestPromise = page.waitForRequest(
    (request) =>
      request.url() === "http://127.0.0.1:5173/api/auth/web/refresh/" &&
      request.method() === "POST",
  );
  const refreshResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === "http://127.0.0.1:5173/api/auth/web/refresh/",
  );

  await page.reload();

  const refreshRequest = await refreshRequestPromise;
  const refreshResponse = await refreshResponsePromise;
  const requestHeaders = await refreshRequest.allHeaders();

  expect(requestHeaders["x-csrftoken"]).toBeTruthy();
  expect(requestHeaders.cookie).toContain("csrftoken=");
  expect(requestHeaders.cookie).toContain("refresh_token=");
  expect(refreshResponse.status()).toBe(200);

  const setCookieHeaders = (await refreshResponse.headersArray()).filter(
    (header) => header.name.toLowerCase() === "set-cookie",
  );

  expect(
    setCookieHeaders.some((header) =>
      header.value.startsWith("refresh_token="),
    ),
  ).toBe(true);

  const refreshCookieAfter = (
    await context.cookies("http://127.0.0.1:5173")
  ).find((cookie) => cookie.name === "refresh_token");

  expect(refreshCookieAfter).toBeDefined();
  expect(refreshCookieAfter?.value).not.toBe(refreshCookieBefore?.value);
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
});

test("user can see subscription plans and start mocked checkout", async ({
  page,
}) => {
  const uniqueEmail = "subscription-e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  const plansResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/subscriptions/plans/") &&
      response.status() === 200,
  );

  await page.getByRole("link", { name: /settings/i }).click();

  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /current plan/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /free/i })).toBeVisible();

  const plansResponse = await plansResponsePromise;
  const plans = await plansResponse.json();
  const proPlan = plans.find((plan: { code: string }) => plan.code === "pro");
  const monthlyPrice = proPlan?.prices.find(
    (price: { billing_interval: string }) => price.billing_interval === "month",
  );

  expect(monthlyPrice?.id).toEqual(expect.any(String));

  const availablePlans = page.getByRole("region", {
    name: /available plans/i,
  });

  await expect(
    availablePlans.getByRole("heading", { name: /pro/i }),
  ).toBeVisible();
  await expect(availablePlans.getByText(/\$10\.00 \/ month/i)).toBeVisible();
  await expect(availablePlans.getByText(/\$100\.00 \/ year/i)).toBeVisible();

  let checkoutRequestBody: unknown;

  await page.route("**/api/v1/subscriptions/checkout/", async (route) => {
    checkoutRequestBody = route.request().postDataJSON();

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://checkout.stripe.com/c/e2e-test-session",
      }),
    });
  });

  await page.route(
    "https://checkout.stripe.com/c/e2e-test-session",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>Mock Stripe Checkout</h1>",
      });
    },
  );

  await page.getByRole("button", { name: /upgrade to pro monthly/i }).click();

  expect(checkoutRequestBody).toEqual({
    price_id: monthlyPrice.id,
  });
  await expect(page).toHaveURL(
    "https://checkout.stripe.com/c/e2e-test-session",
  );
  await expect(
    page.getByRole("heading", { name: /mock stripe checkout/i }),
  ).toBeVisible();
});

test("user can create a custom metric and log it from the dashboard", async ({
  page,
}) => {
  const uniqueEmail = "custom-metric-e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await page.getByRole("link", { name: /metrics/i }).click();

  await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible();

  await page.getByRole("button", { name: /new custom metric/i }).click();
  const customMetricDialog = page.getByRole("dialog", {
    name: /create custom metric/i,
  });

  await customMetricDialog.getByLabel(/name/i).fill("Mood");
  await customMetricDialog.getByLabel(/slug/i).fill("mood");
  await customMetricDialog.getByLabel(/unit/i).fill("score");
  await customMetricDialog.getByLabel(/min value/i).fill("1");
  await customMetricDialog.getByLabel(/max value/i).fill("10");
  await customMetricDialog
    .getByRole("button", { name: /^create custom metric$/i })
    .click();

  await expect(customMetricDialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /mood/i })).toBeVisible();

  await page.getByRole("link", { name: /dashboard/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await page.getByRole("button", { name: /add mood entry/i }).click();
  await expect(page.getByLabel(/mood value/i)).toBeVisible();

  await page.getByLabel(/mood value/i).fill("7");
  await page.getByRole("button", { name: /save mood entry/i }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/7 score/i)).toBeVisible();
});

test("user can archive and reactivate a custom metric", async ({ page }) => {
  const uniqueEmail = "archive-metric-e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(uniqueEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await page.getByRole("link", { name: /metrics/i }).click();

  await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible();

  await page.getByRole("button", { name: /new custom metric/i }).click();
  const customMetricDialog = page.getByRole("dialog", {
    name: /create custom metric/i,
  });

  await customMetricDialog.getByLabel(/name/i).fill("Mood");
  await customMetricDialog.getByLabel(/slug/i).fill("mood");
  await customMetricDialog.getByLabel(/unit/i).fill("score");
  await customMetricDialog.getByLabel(/min value/i).fill("1");
  await customMetricDialog.getByLabel(/max value/i).fill("10");
  await customMetricDialog
    .getByRole("button", { name: /^create custom metric$/i })
    .click();

  const activeMetrics = page.getByLabel(/available metrics/i);

  await expect(
    activeMetrics.getByRole("heading", { name: /mood/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /deactivate mood/i }).click();
  const deactivateDialog = page.getByRole("dialog", {
    name: /deactivate mood/i,
  });
  await expect(deactivateDialog.getByText(/entries are kept/i)).toBeVisible();
  await deactivateDialog
    .getByRole("button", { name: /^deactivate metric$/i })
    .click();

  await expect(
    activeMetrics.getByRole("heading", { name: /mood/i }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: /show archived/i }).click();

  const archivedMetrics = page.getByRole("region", {
    name: /archived custom metrics/i,
  });

  await expect(
    archivedMetrics.getByRole("heading", { name: /mood/i }),
  ).toBeVisible();
  await expect(
    archivedMetrics.locator(".archived-status-pill").filter({
      hasText: /^Archived$/,
    }),
  ).toBeVisible();

  await archivedMetrics
    .getByRole("button", { name: /reactivate mood/i })
    .click();

  await expect(
    archivedMetrics.getByRole("heading", { name: /mood/i }),
  ).not.toBeVisible();
  await expect(
    activeMetrics.getByRole("heading", { name: /mood/i }),
  ).toBeVisible();

  await page.getByRole("link", { name: /dashboard/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await page.getByRole("button", { name: /add mood entry/i }).click();
  await expect(page.getByLabel(/mood value/i)).toBeVisible();
});

test("failed login stays on login page and shows an error", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill("missing-user@example.com");
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await expect(page.getByText(/invalid credentials/i)).toBeVisible();
});

test("duplicate registration stays on register page and shows an error", async ({
  page,
}) => {
  const email = "duplicate-e2e-user@example.com";
  const password = "Secret123!Strong";

  await page.goto("/register");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();

  await page.goto("/register");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /register/i })).toBeVisible();

  await expect(
    page.getByText(/a user with that email already exists/i),
  ).toBeVisible();
});

test("user can open a metric detail page from the dashboard", async ({
  page,
}) => {
  await page.goto("/register");

  const email = `metric-detail-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /register/i }).click();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await page
    .getByRole("button", { name: /add resting heart rate entry/i })
    .click();
  await page.getByLabel(/resting heart rate value/i).fill("58");
  await page
    .getByRole("button", { name: /save resting heart rate entry/i })
    .click();

  await expect(page.getByText(/58 bpm/i)).toBeVisible();

  await page
    .getByRole("link", { name: /resting heart rate/i })
    .first()
    .click();

  await expect(page).toHaveURL(/\/metrics\/resting_hr$/);
  await expect(
    page.getByRole("heading", { name: /resting heart rate/i }),
  ).toBeVisible();
  await expect(page.getByText(/cardiovascular · bpm/i)).toBeVisible();
  await expect(page.getByText("Latest value", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/58 bpm/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /entry history/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /edit resting heart rate entry/i })
    .click();
  await page.getByLabel(/resting heart rate value/i).fill("62");
  await page.getByLabel(/resting heart rate notes/i).fill("after walk");
  await page
    .getByRole("button", { name: /save resting heart rate entry/i })
    .click();

  await expect(page.getByLabel(/62 bpm/i)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /metric entry history/i })
      .getByText(/62 bpm/i),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /delete resting heart rate entry/i })
    .click();

  const deleteDialog = page.getByRole("dialog", {
    name: /delete resting heart rate entry/i,
  });
  await expect(deleteDialog.getByText(/permanently removes/i)).toBeVisible();
  await deleteDialog.getByRole("button", { name: /^delete entry$/i }).click();

  await expect(page.getByText(/no entries recorded yet/i)).toBeVisible();

  await page
    .getByRole("button", { name: /add resting heart rate entry/i })
    .click();
  const addHeartRateDialog = page.getByRole("dialog", {
    name: /add resting heart rate entry/i,
  });
  await addHeartRateDialog.getByLabel(/resting heart rate value/i).fill("59");
  await addHeartRateDialog
    .getByRole("button", { name: /save resting heart rate entry/i })
    .click();
  await expect(addHeartRateDialog).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: /metric entry history/i })
      .getByText(/59 bpm/i),
  ).toBeVisible();

  await page.goto("/metrics/body_weight");
  await page.getByRole("button", { name: /add weight entry/i }).click();

  const addWeightDialog = page.getByRole("dialog", {
    name: /add body weight entry/i,
  });
  await addWeightDialog.getByLabel(/body weight value/i).fill("72.4");
  await addWeightDialog
    .getByLabel(/body weight notes/i)
    .fill("Morning weigh-in");
  await addWeightDialog
    .getByRole("button", { name: /save weight entry/i })
    .click();

  await expect(addWeightDialog).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: /metric entry history/i })
      .getByText(/72\.4 kg/i),
  ).toBeVisible();
  await expect(page.getByText(/morning weigh-in/i)).toBeVisible();
});
