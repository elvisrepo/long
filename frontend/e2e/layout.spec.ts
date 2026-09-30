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

for (const width of [320, 1440]) {
  test(`checkout confirmation updates automatically at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    let reads = 0;
    await page.route("**/api/v1/subscriptions/current/", async (route) => {
      reads += 1;
      const paid = reads > 1;
      await route.fulfill({
        json: {
          id: "checkout-plan",
          status: "active",
          billing_portal_available: paid,
          current_period_start: null,
          current_period_end: null,
          cancel_at: null,
          cancel_at_period_end: false,
          price: null,
          plan: {
            code: paid ? "pro" : "free",
            name: paid ? "Pro" : "Free",
            active_custom_metric_limit: paid ? 10 : 3,
            wearable_connection_limit: paid ? 2 : 1,
            automatic_sync_enabled: paid,
            sync_interval_minutes: paid ? 15 : 30,
            analytics_enabled: paid,
            csv_import_enabled: paid,
            csv_export_enabled: paid,
          },
        },
      });
    });
    await page.goto("/settings?checkout=success");
    await expect(
      page.getByRole("status").filter({ hasText: "Checking automatically" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Pro is active." }),
    ).toHaveText("Pro is active.");
    await expect(
      page
        .getByRole("region", { name: "Current subscription" })
        .getByRole("heading", { name: "Pro" }),
    ).toBeVisible();
    expect(reads).toBe(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

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

for (const width of [320, 1440]) {
  test(`recovery tracking and custom tools at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let checked = false;
    let archived = false;
    let custom = false;
    const standard = {
      id: "massage-id",
      name: "Massage",
      description: "Post-exercise massage.",
      is_active: true,
      is_custom: false,
      evidence: {
        outcome: "doms",
        smd: -2.26,
        ci_lower: -3.05,
        ci_upper: -1.47,
        subjects: 158,
        experimental_groups: 14,
        citation: "Dupuy et al. (2018), Table 1",
        source_url:
          "https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00403/full",
      },
    };
    const standards = [
      standard,
      ...(
        [
          ["Active recovery", -0.94, -1.61, -0.28],
          ["Compression garments", -0.92, -1.34, -0.5],
          ["Cryotherapy / cryostimulation", -0.53, -1.04, -0.03],
          ["Water immersion", -0.47, -0.77, -0.18],
          ["Contrast water therapy", -0.4, -0.73, -0.07],
        ] as const
      ).map(([name, smd, ci_lower, ci_upper], index) => ({
        ...standard,
        id: `standard-${index}`,
        name,
        description: "",
        evidence: { ...standard.evidence, smd, ci_lower, ci_upper },
      })),
    ];
    const customTool = () => ({
      ...standard,
      id: "custom-id",
      name: "Sauna",
      description: "",
      is_custom: true,
      evidence: null,
      is_active: !archived,
    });
    await page.route("**/api/v1/recovery/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith("tools/") && request.method() === "POST") {
        custom = true;
        return route.fulfill({ status: 201, json: customTool() });
      }
      if (url.pathname.endsWith("tools/"))
        return route.fulfill({
          json: {
            tools: custom ? [...standards, customTool()] : standards,
            can_create_custom: true,
          },
        });
      if (url.pathname.includes("tools/custom-id/")) {
        archived =
          !!request.postDataJSON() && !request.postDataJSON().is_active;
        return route.fulfill({ json: customTool() });
      }
      if (url.pathname.endsWith("entries/"))
        return route.fulfill({
          json: checked
            ? [
                {
                  id: 1,
                  tool_id: standard.id,
                  performed_on: url.searchParams.get("date_to"),
                  created_at: recordedAt,
                },
              ]
            : [],
        });
      checked = request.method() === "PUT";
      return route.fulfill({
        status: checked ? 200 : 204,
        ...(checked ? { json: {} } : {}),
      });
    });
    await page.goto("/recovery");
    const checkbox = page.getByRole("checkbox", { name: "Massage" });
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("status")).toHaveText(
      "1 of 6 tools checked off",
    );
    await page.reload();
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await page.getByRole("textbox", { name: "Tool name" }).fill("Sauna");
    await page.getByRole("button", { name: "Add tool", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Sauna" })).toBeVisible();
    await expect(
      page.getByText("Not research-rated", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Archive Sauna" }).click();
    await expect(
      page.getByRole("button", { name: "Restore Sauna" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore Sauna" }).click();
    await expect(page.getByRole("checkbox", { name: "Sauna" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/layout/recovery-${width}.png`,
      fullPage: true,
    });
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
  const selector = page.getByRole("combobox", { name: "Color theme" });
  await selector.selectOption("light");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 247, 248)",
  );
  await selector.selectOption("sand");
  await expect(root).toHaveAttribute("data-theme", "sand");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(228, 219, 204)",
  );
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "sand");
  for (const path of ["/metrics", "/settings", "/login", "/register"]) {
    await page.goto(path);
    await expect(selector).toHaveValue("sand");
    await expect(root).toHaveAttribute("data-theme", "sand");
  }
  await selector.selectOption("dark");
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
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("sand");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sand");
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
  ...[320, 768, 1440].map((width) => ({ width, theme: "sand" })),
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
    const titleYByHeaderVariant: Record<string, number> = {};
    let titleSize: string | undefined;
    for (const [path, title] of views) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      if (width <= 680) {
        const logo = await page.locator(".app-logo").boundingBox();
        const selector = await page
          .getByRole("combobox", { name: "Color theme" })
          .boundingBox();
        expect(
          selector!.y + selector!.height / 2,
          "Logo and theme share the top row",
        ).toBeCloseTo(logo!.y + logo!.height / 2, 0);
      }
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
          headerVariant: document.querySelector(".page-breadcrumb")
            ? "breadcrumb"
            : "plain",
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
        // The breadcrumb row intentionally offsets titles on detail and
        // analytics pages. Rhythm is asserted within each header variant so a
        // page drifting out of its own composition still fails.
        titleYByHeaderVariant[bounds.headerVariant] ??= bounds.titleY;
        expect(
          bounds.titleY,
          `${path} (${bounds.headerVariant} header)`,
        ).toBeCloseTo(titleYByHeaderVariant[bounds.headerVariant], 0);
      }
      titleSize ??= bounds.titleSize;
      expect(bounds.titleSize, path).toBe(titleSize);
      if ([390, 768, 1440].includes(width) || theme !== "dark") {
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
  ...[320, 1440].map((width) => ({ width, theme: "sand" })),
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
      if (theme !== "dark")
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
      if (theme !== "dark") {
        await expect(dialog).toHaveCSS(
          "background-color",
          theme === "sand" ? "rgb(239, 231, 218)" : "rgb(255, 255, 255)",
        );
        await page.screenshot({
          path: testInfo.outputPath(`${action.replaceAll(" ", "_")}.png`),
        });
      }
    }
  });
}

for (const width of [320, 1440]) {
  test(`account export and deletion confirmation work at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await mockApi(page);
    await page.route("**/api/v1/me/export/", (route) =>
      route.fulfill({
        contentType: "application/json",
        headers: {
          "Content-Disposition":
            'attachment; filename="longevity-account.json"',
        },
        body: JSON.stringify({ schema_version: 1, profile: {} }),
      }),
    );
    let deletionAttempts = 0;
    await page.route("**/api/v1/me/", (route) => {
      expect(route.request().method()).toBe("DELETE");
      expect(route.request().postDataJSON()).toEqual({
        password: "test-password",
      });
      deletionAttempts++;
      return deletionAttempts === 1
        ? route.fulfill({
            status: 400,
            json: { password: ["Password is incorrect."] },
          })
        : route.fulfill({ status: 204 });
    });
    await page.goto("/settings");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download account data" }).click();
    expect((await downloading).suggestedFilename()).toBe(
      "longevity-account.json",
    );
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const confirm = dialog.getByRole("button", {
      name: "Delete account permanently",
    });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Current password").fill("test-password");
    await dialog.getByRole("checkbox").check();
    await page.screenshot({
      path: testInfo.outputPath("account-deletion.png"),
      fullPage: true,
    });
    await confirm.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Password is incorrect.",
    );
    await expect(dialog.getByLabel("Current password")).toHaveValue("");
    await dialog.getByLabel("Current password").fill("test-password");
    await confirm.click();
    await expect(page).toHaveURL(/\/login$/);
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
