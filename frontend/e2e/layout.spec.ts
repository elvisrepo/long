import { expect, test, type Page } from "@playwright/test";

const definitions = [
  {
    id: "weight",
    slug: "body_weight",
    name: "Body Weight",
    unit: "kg",
    category: "body_composition",
    min_value: 20,
    max_value: 300,
    is_default: true,
    is_active: true,
  },
  {
    id: "sleep",
    slug: "sleep_duration",
    name: "Sleep Duration",
    unit: "hours",
    category: "recovery",
    min_value: 0,
    max_value: 24,
    is_default: true,
    is_active: true,
  },
  {
    id: "steps",
    slug: "steps",
    name: "Steps",
    unit: "steps",
    category: "activity",
    min_value: 0,
    max_value: 100000,
    is_default: true,
    is_active: true,
  },
  {
    id: "custom",
    slug: "personal_score",
    name: "Personal wellbeing and energy score",
    unit: "score",
    category: "custom",
    min_value: 0,
    max_value: 10,
    is_default: false,
    is_active: true,
  },
];
const date = "2026-09-21";
const recordedAt = `${date}T07:00:00Z`;
const entries = definitions.map((definition, index) => ({
  id: index + 1,
  metric_definition: definition.slug,
  value: [84, 7.5, 8000, 7][index],
  period_start:
    definition.slug === "sleep_duration" ? "2026-09-20T23:30:00Z" : null,
  recorded_at: recordedAt,
  created_at: recordedAt,
  source: "manual",
  context: {},
}));

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: unknown;
    if (url.pathname.endsWith("/csrf/")) json = {};
    else if (url.pathname.endsWith("/refresh/"))
      json = { access: "layout-fixture" };
    else if (url.pathname.endsWith("/me/"))
      json = { email: "layout@example.test" };
    else if (url.pathname.endsWith("/definitions/")) json = definitions;
    else if (url.pathname.endsWith("/entries/"))
      json = entries.filter(
        (entry) =>
          !url.searchParams.has("metric") ||
          entry.metric_definition === url.searchParams.get("metric"),
      );
    else if (url.pathname.endsWith("/usage/"))
      json = { active_custom_metrics: { used: 1, limit: 10 } };
    else if (url.pathname.endsWith("/current/"))
      json = {
        id: "plan",
        status: "active",
        billing_portal_available: true,
        current_period_end: null,
        cancel_at: null,
        price: {
          unit_amount: 1000,
          currency: "usd",
          billing_interval: "month",
        },
        plan: {
          name: "Pro",
          code: "pro",
          active_custom_metric_limit: 10,
          wearable_connection_limit: 2,
          automatic_sync_enabled: true,
          sync_interval_minutes: 15,
          analytics_enabled: true,
          csv_import_enabled: true,
          csv_export_enabled: true,
        },
      };
    else if (url.pathname.endsWith("/plans/")) json = [];
    else if (url.pathname.endsWith("/preferences/sleep/"))
      json = { target_minutes: 450 };
    else if (url.pathname.endsWith("/analytics/sleep/"))
      json = {
        range_days: 7,
        target_minutes: 450,
        series: [
          {
            date,
            duration_minutes: 450,
            shortfall_minutes: 0,
            recorded_at: recordedAt,
            period_start: "2026-09-20T23:30:00Z",
          },
        ],
        summary: {
          tracked_nights: 1,
          nights_under_target: 0,
          total_shortfall_minutes: 0,
          average_duration_minutes: 450,
          worst_night: { date, duration_minutes: 450 },
        },
      };
    else if (url.pathname.endsWith("/weight-steps/"))
      json = {
        range_days: 30,
        series: [
          { date, weight_kg: 84, weight_7d_average_kg: 84, steps: 8000 },
        ],
        summary: {
          weight_start_kg: 84,
          weight_end_kg: 84,
          weight_change_kg: 0,
          average_daily_steps: 8000,
        },
      };
    else if (url.pathname.endsWith("/consistency/"))
      json = {
        range_days: 7,
        dates: Array.from({ length: 7 }, (_, i) => `2026-09-${15 + i}`),
        metrics: definitions.map((definition) => ({
          metric_definition_id: definition.id,
          name: definition.name,
          slug: definition.slug,
          tracked_days: 1,
          current_window_streak_days: 1,
          last_recorded_at: recordedAt,
          day_presence: [false, false, false, false, false, false, true],
        })),
        summary: {
          metrics_with_data: 4,
          total_metrics: 4,
          days_with_any_data: 1,
        },
      };
    else
      return route.fulfill({
        status: 404,
        json: { detail: "Unexpected fixture request" },
      });
    await route.fulfill({ json });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("theme switch persists across pages and reloads, including authentication", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("html");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 247, 248)",
  );
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  for (const path of ["/metrics", "/settings", "/login", "/register"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeVisible();
    await expect(root).toHaveAttribute("data-theme", "light");
  }
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(13, 17, 21)",
  );
});

test("theme remains usable when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    });
  });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

const views = [
  ["/", "Dashboard"],
  ["/metrics", "Metrics"],
  ["/settings", "Settings"],
  ["/metrics/body_weight", "Body Weight"],
  ["/metrics/sleep_duration", "Sleep Duration"],
  ["/metrics/personal_score", "Personal wellbeing and energy score"],
  ["/analytics/weight-steps", "Weight × Steps"],
  ["/analytics/sleep", "Sleep Insights"],
  ["/analytics/consistency", "Consistency & Coverage"],
];

const layoutCases = [
  ...[320, 390, 640, 768, 1024, 1440, 1920].map((width) => ({
    width,
    theme: "dark",
  })),
  ...[320, 768, 1440].map((width) => ({ width, theme: "light" })),
];
for (const { width, theme } of layoutCases) {
  test(`${theme} signed-in pages share responsive alignment at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("longevity-theme", theme),
      theme,
    );
    let titleY: number | undefined;
    let titleSize: string | undefined;
    for (const [path, title] of views) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      // Wait for async content, including charts and Settings cards.
      if (path === "/settings")
        await expect(
          page.getByRole("button", { name: "Manage subscription" }),
        ).toBeVisible();
      if (path === "/metrics")
        await expect(
          page.getByRole("button", {
            name: "Edit Personal wellbeing and energy score",
          }),
        ).toBeVisible();
      const bounds = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const section = main.querySelector(":scope > section")!;
        const header = document.querySelector(".app-header-inner")!;
        const style = getComputedStyle(main);
        const headerStyle = getComputedStyle(header);
        const title = main.querySelector("h1")!;
        return {
          titleY: title.getBoundingClientRect().y,
          titleSize: getComputedStyle(title).fontSize,
          pageX: section.getBoundingClientRect().x,
          pageWidth: section.getBoundingClientRect().width,
          mainX: main.getBoundingClientRect().x + parseFloat(style.paddingLeft),
          mainWidth:
            main.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
          headerX:
            header.getBoundingClientRect().x +
            parseFloat(headerStyle.paddingLeft),
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      expect(bounds.pageX, path).toBeCloseTo(bounds.mainX, 0);
      expect(bounds.pageWidth, path).toBeCloseTo(bounds.mainWidth, 0);
      expect(bounds.pageX, path).toBeCloseTo(bounds.headerX, 0);
      expect(bounds.documentWidth, path).toBeLessThanOrEqual(bounds.viewport);
      if (width >= 768) {
        titleY ??= bounds.titleY;
        expect(bounds.titleY, path).toBeCloseTo(titleY, 0);
      }
      titleSize ??= bounds.titleSize;
      expect(bounds.titleSize, path).toBe(titleSize);
      if ([390, 768, 1440].includes(width) || theme === "light") {
        await page.screenshot({
          path: testInfo.outputPath(
            `${path.replaceAll("/", "_") || "dashboard"}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });
}

for (const { width, theme } of [
  ...[320, 768, 1440].map((width) => ({ width, theme: "dark" })),
  ...[320, 1440].map((width) => ({ width, theme: "light" })),
]) {
  test(`${theme} auth pages and dialogs fit the viewport at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 600 });
    await page.addInitScript(
      (theme) => localStorage.setItem("longevity-theme", theme),
      theme,
    );
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      const panel = page.locator(".auth-panel");
      await expect(panel).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds!.width).toBeLessThanOrEqual(440);
      expect(bounds!.x * 2 + bounds!.width).toBeCloseTo(width, 0);
      if (theme === "light")
        await page.screenshot({
          path: testInfo.outputPath(`${path.slice(1)}.png`),
          fullPage: true,
        });
    }
    for (const [path, action] of [
      ["/metrics/body_weight", "Add weight entry"],
      ["/metrics/sleep_duration", "Add Sleep Duration entry"],
      ["/metrics", "+ New custom metric"],
      ["/metrics", "Deactivate Personal wellbeing and energy score"],
      ["/settings", "Export health data"],
    ]) {
      await page.goto(path);
      await page.getByRole("button", { name: action, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(16);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 16);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (theme === "light") {
        await expect(dialog).toHaveCSS(
          "background-color",
          "rgb(255, 255, 255)",
        );
        await page.screenshot({
          path: testInfo.outputPath(`${action.replaceAll(" ", "_")}.png`),
        });
      }
    }
  });
}

test("unknown pages offer navigation within the shared page layout", async ({
  page,
}) => {
  await page.goto("/not-a-real-page");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
});
