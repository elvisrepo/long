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

test("custom metric modal contains keyboard focus and restores its opener", async ({
  page,
}) => {
  await page.goto("/metrics");
  const opener = page.getByRole("button", {
    name: "+ New metric",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Create custom metric" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
      "Tab must not reach background controls",
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("metric deactivation modal contains focus and restores its opener", async ({
  page,
}) => {
  await page.goto("/metrics");
  const opener = page.getByText("⋯", { exact: true });
  await opener.click();
  const archive = page.getByRole("button", {
    name: "Archive Personal wellbeing and energy score",
    exact: true,
  });
  await archive.click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("workout completion labels meet text contrast in both themes", async ({
  page,
}) => {
  await page.goto("/workouts");
  const ratios: Record<string, number[]> = {};
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    ratios[theme] = await page.evaluate(() => {
      const root = document.querySelector("main")!;
      const fixture = document.createElement("div");
      fixture.className = "workout-screen";
      fixture.innerHTML = `
        <div style="background: var(--surface)">
          <span class="workout-badge workout-status workout-status--completed">Completed</span>
        </div>
        <div class="workout-calendar-grid">
          <button aria-pressed="false"><small><span class="workout-calendar-count training">T1</span></small></button>
          <button aria-pressed="true"><small><span class="workout-calendar-count training">T1</span></small></button>
        </div>`;
      root.append(fixture);
      const luminance = (color: string) => {
        const values = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
        const linear = values.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const effectiveBackground = (element: HTMLElement) => {
        const composite = (front: number[], back: number[]) => {
          const alpha = front[3] ?? 1;
          return [0, 1, 2].map(
            (index) => front[index] * alpha + back[index] * (1 - alpha),
          );
        };
        let background = [255, 255, 255];
        const ancestors: HTMLElement[] = [];
        for (
          let node: HTMLElement | null = element;
          node;
          node = node.parentElement
        )
          ancestors.push(node);
        for (const node of ancestors.reverse()) {
          const color = getComputedStyle(node).backgroundColor;
          const channels = color.match(/[\d.]+/g)?.map(Number);
          if (channels) background = composite(channels, background);
        }
        return `rgb(${background.map(Math.round).join(", ")})`;
      };
      const targets = [
        ...fixture.querySelectorAll<HTMLElement>(
          ".workout-status--completed, .workout-calendar-count.training",
        ),
      ];
      const ratios = targets.map((element) => {
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(effectiveBackground(element));
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
      fixture.remove();
      return ratios;
    });
  }
  for (const [theme, themeRatios] of Object.entries(ratios)) {
    expect(
      Math.min(...themeRatios),
      `${theme} workout status text contrast`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("UI fonts are loaded locally instead of relying on system fallbacks", async ({
  page,
}) => {
  await page.goto("/metrics");
  await expect(
    page.getByRole("heading", { name: "Metrics", exact: true }),
  ).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => font.family.replaceAll('"', ""));
  });
  expect(fonts).toContain("DM Sans Variable");
  expect(fonts).toContain("DM Mono");
});

test("metric dialogs retain backdrop dismissal without dismissing on dialog padding", async ({
  page,
}) => {
  await page.goto("/metrics");
  const opener = page.getByRole("button", {
    name: "+ New metric",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await dialog.click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("Diet reveals its date field from a compact calendar control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/diet");
  const field = page.getByLabel("Tracking date", { exact: true });
  await expect(field).not.toBeVisible();
  await page.getByRole("button", { name: "Choose date" }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS("font-size", "16px");
  expect((await field.boundingBox())!.height).toBeCloseTo(44, 0);
});

for (const width of [320, 390, 560, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`Compact tracking dates at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      await page.route("**/api/v1/stretching/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        const json = path.endsWith("exercises/")
          ? {
              phases: [
                { slug: "lower-body", name: "Lower body", exercises: [] },
                { slug: "upper-body", name: "Upper body", exercises: [] },
              ],
            }
          : path.endsWith("preferences/")
            ? { show_shared_exercises: true, hidden_exercise_ids: [] }
            : [];
        return route.fulfill({ json });
      });
      for (const path of ["/recovery", "/diet", "/stretching"]) {
        await page.goto(path);
        const context = page.getByRole("region", {
          name: "Daily tracking",
          exact: true,
        });
        const field = context.getByLabel("Tracking date");
        await expect(field).toBeAttached();
        await expect(field).not.toBeVisible();
        await expect(
          context.getByRole("button", { name: "Previous day" }),
        ).toHaveCount(0);
        await expect(
          context.getByRole("button", { name: "Next day" }),
        ).toHaveCount(0);
        const days = context
          .getByRole("group", { name: "Last 7 days" })
          .getByRole("button");
        await expect(days).toHaveCount(7);
        const today = await field.inputValue();
        const labels = await days.allTextContents();
        await context.getByRole("button", { name: "Choose date" }).click();
        await expect(field).toBeFocused();
        const fieldBox = (await field.boundingBox())!;
        expect(fieldBox.x).toBeGreaterThanOrEqual(0);
        expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(width);
        await field.fill("2026-09-01");
        await expect(field).not.toBeVisible();
        await expect(field).toHaveValue("2026-09-01");
        expect(await days.allTextContents()).toEqual(labels);
        await days.first().click();
        await expect(days.first()).toHaveAttribute("aria-pressed", "true");
        await context
          .getByRole("button", { name: "Today", exact: true })
          .click();
        await expect(field).toHaveValue(today);
        await context.screenshot({
          path: testInfo.outputPath(`${path.slice(1)}-dates.png`),
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      }
    });
  }
}

test("mobile Diet puts daily context before its food checklist", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  await mockApi(page);
  await page.route("**/api/v1/diet/catalog/", (route) =>
    route.fulfill({
      json: {
        sections: [
          {
            id: "protein",
            name: "Protein",
            display_order: 10,
            is_active: true,
          },
        ],
        foods: [
          {
            id: "beans",
            section_id: "protein",
            name: "Beans",
            display_order: 10,
            is_active: true,
          },
        ],
      },
    }),
  );
  await page.goto("/diet");

  const food = page.getByRole("checkbox", { name: "Beans", exact: true });
  const summary = page.getByRole("region", { name: "Daily tracking" });
  await expect(food).toBeVisible();
  await expect(summary).toBeVisible();
  expect((await food.boundingBox())!.y).toBeGreaterThan(
    (await summary.boundingBox())!.y,
  );
  await page.screenshot({
    path: testInfo.outputPath("diet-mobile-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("diet-desktop-light.png"),
    fullPage: true,
  });
});

test("dashboard icon controls keep square touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/api/v1/metrics/definitions/", (route) =>
    route.fulfill({
      json: [
        ...definitions,
        ...Array.from({ length: 3 }, (_, i) => ({
          ...definitions[3],
          id: `extra-${i}`,
          slug: `extra_${i}`,
          name: `Extra metric ${i}`,
        })),
      ],
    }),
  );
  await page.goto("/");
  await expect(page.locator(".metric-card-add").first()).toBeVisible();
  for (const selector of [
    ".metric-card-add",
    ".dashboard-rail-controls button",
  ]) {
    const box = (await page.locator(selector).first().boundingBox())!;
    expect(box.width).toBeCloseTo(44, 0);
    expect(box.height).toBeCloseTo(44, 0);
  }
});

for (const theme of ["dark", "light"]) {
  for (const width of [320, 390, 1440]) {
    test(`${theme} shared controls align across tracking pages at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      await page.route("**/api/v1/workouts/catalog/", (route) =>
        route.fulfill({
          json: {
            categories: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Chest",
                is_active: true,
                display_order: 0,
              },
            ],
            exercises: [],
            preferences: { bar_kg: "20.000", bar_lb: "45.000" },
          },
        }),
      );
      for (const path of [
        "/diet",
        "/recovery",
        "/workouts",
        "/workouts?view=exercises",
      ]) {
        await page.goto(path);
        const expectedTitle = path.includes("exercises")
          ? "All exercises · Longevity"
          : path.startsWith("/workouts")
            ? "Workouts · Longevity"
            : `${path === "/diet" ? "Diet" : "Recovery"} · Longevity`;
        await expect(page).toHaveTitle(expectedTitle);
        const compact = path === "/diet" || path === "/recovery";
        if (compact)
          await page.getByRole("button", { name: "Choose date" }).click();
        const field = page.getByLabel("Tracking date", { exact: true });
        await expect(field).toBeVisible();
        const input = (await field.boundingBox())!;
        for (const name of compact ? [] : ["Previous day", "Next day"]) {
          const box = (await page
            .getByRole("button", { name, exact: true })
            .boundingBox())!;
          expect(box.y + box.height, path).toBeCloseTo(
            input.y + input.height,
            0,
          );
          expect(box.height, path).toBeCloseTo(44, 0);
          expect(box.width, path).toBeGreaterThanOrEqual(44);
        }
        await expect(field).toHaveCSS("font-size", "16px");
        expect(input.height, path).toBeCloseTo(44, 0);
        if (!compact) expect(input.width, path).toBeCloseTo(160, 0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          path,
        ).toBe(true);
        if (path.includes("exercises")) {
          const heading = (await page
            .locator(".workout-library-category-heading")
            .boundingBox())!;
          const edit = (await page
            .getByRole("button", { name: "Edit category Chest", exact: true })
            .boundingBox())!;
          expect(heading.y + heading.height / 2).toBeCloseTo(
            edit.y + edit.height / 2,
            0,
          );
          const search = page.getByLabel("Search exercises", { exact: true });
          await expect(search).toHaveCSS("font-size", "16px");
          expect((await search.boundingBox())!.height).toBeCloseTo(44, 0);
          const checkbox = page.getByRole("checkbox", {
            name: "Show archived",
            exact: true,
          });
          const box = (await checkbox.boundingBox())!;
          expect(box.width).toBeCloseTo(box.height, 0);
          expect(box.height).toBeLessThan(24);
        }
        if (width === 1440) {
          const search = path.includes("exercises")
            ? page.getByLabel("Search exercises", { exact: true })
            : null;
          const action =
            path === "/diet"
              ? page.getByRole("button", {
                  name: "Manage checklist",
                  exact: true,
                })
              : search
                ? page.getByRole("button", {
                    name: "New exercise",
                    exact: true,
                  })
                : null;
          if (action) {
            const fieldBox = search ? (await search.boundingBox())! : input;
            const buttonBox = (await action.boundingBox())!;
            expect(buttonBox.y + buttonBox.height).toBeCloseTo(
              fieldBox.y + fieldBox.height,
              0,
            );
          }
        }
        await page.screenshot({
          path: testInfo.outputPath(`${path.replaceAll(/[/?=]/g, "_")}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test("dashboard tracking summaries share one row on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const recovery = page.getByRole("region", { name: "Recovery activities" });
  const diet = page.getByRole("region", { name: "Diet checklist" });
  await expect(recovery).toBeVisible();
  await expect(diet).toBeVisible();
  await expect(recovery.getByText("0 activities today")).toBeVisible();
  await expect(diet.getByText("0 foods today")).toBeVisible();
  const recoveryBox = (await recovery.boundingBox())!;
  const dietBox = (await diet.boundingBox())!;
  expect(dietBox.y).toBeCloseTo(recoveryBox.y, 0);
  expect(dietBox.x).toBeGreaterThan(recoveryBox.x + recoveryBox.width);
  expect((await diet.locator("p").first().boundingBox())!.y).toBeCloseTo(
    (await recovery.locator("p").first().boundingBox())!.y,
    0,
  );
  await page
    .locator(".dashboard-tracking-summaries")
    .screenshot({ path: "test-results/layout/dashboard-tracking-desktop.png" });
  await page.setViewportSize({ width: 320, height: 900 });
  const mobileRecovery = (await recovery.boundingBox())!;
  const mobileDiet = (await diet.boundingBox())!;
  expect(mobileDiet.y).toBeGreaterThanOrEqual(
    mobileRecovery.y + mobileRecovery.height,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

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
      json = {
        email: "layout@example.test",
        date_of_birth: null,
        sex: null,
        height_cm: null,
        age: null,
        estimated_bmr: {
          value: null,
          unit: "kcal/day",
          formula: "mifflin_st_jeor",
          reason: "missing_information",
          missing_fields: ["date_of_birth", "sex", "height_cm"],
          weight: null,
        },
      };
    else if (url.pathname.endsWith("/definitions/")) json = definitions;
    else if (url.pathname === "/api/v1/recovery/tools/")
      json = { tools: [], can_create_custom: false };
    else if (url.pathname === "/api/v1/recovery/entries/") json = [];
    else if (url.pathname === "/api/v1/diet/catalog/")
      json = { sections: [], foods: [] };
    else if (url.pathname === "/api/v1/diet/entries/") json = [];
    else if (url.pathname === "/api/v1/workouts/sessions/")
      json = { count: 0, next: null, previous: null, results: [] };
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
        series: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-09-${15 + index}`,
          duration_minutes: index === 6 ? 450 : null,
          shortfall_minutes: index === 6 ? 0 : null,
          recorded_at: index === 6 ? recordedAt : null,
          period_start: index === 6 ? "2026-09-20T23:30:00Z" : null,
        })),
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

for (const width of [390, 1440]) {
  test(`Sleep Insights uses aligned duration fields at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      localStorage.setItem("longevity-theme", "light"),
    );
    await mockApi(page);
    await page.goto("/analytics/sleep");

    await expect(
      page.getByRole("heading", { name: "Sleep Insights", exact: true }),
    ).toBeVisible();
    await page.locator(".sleep-target-settings > summary").click();
    const hours = page.getByLabel("Hours", { exact: true });
    const minutes = page.getByLabel("Minutes", { exact: true });
    await expect(hours).toHaveValue("7");
    await expect(minutes).toHaveValue("30");
    const hoursBox = (await hours.boundingBox())!;
    const minutesBox = (await minutes.boundingBox())!;
    expect(hoursBox.y).toBeCloseTo(minutesBox.y, 0);
    const saveBox = (await page
      .getByRole("button", { name: "Save target", exact: true })
      .boundingBox())!;
    const durationBox = (await page
      .locator(".sleep-target-duration")
      .boundingBox())!;
    if (width > 680) {
      expect(Math.abs(saveBox.width - hoursBox.width)).toBeLessThanOrEqual(24);
      expect(saveBox.height).toBeCloseTo(hoursBox.height, 0);
      expect(saveBox.y).toBeCloseTo(hoursBox.y, 0);
    } else {
      expect(saveBox.x).toBeCloseTo(durationBox.x, 0);
      expect(saveBox.width).toBeCloseTo(durationBox.width, 0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.addStyleTag({
      content:
        '[aria-label="Open TanStack Router Devtools"] { display: none !important; }',
    });
    await page.screenshot({
      path: `../playground/sleep-target-screenshots/target-${width}.png`,
      fullPage: true,
    });
  });
}

test("Sleep target editing keeps focus while recalculating", async ({
  page,
}) => {
  await page.route("**/api/v1/metrics/analytics/sleep/?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("target_minutes") ===
      "510"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.fallback();
  });
  await page.goto("/analytics/sleep");
  await page.locator(".sleep-target-settings > summary").click();
  const hours = page.getByLabel("Hours", { exact: true });
  const recalculated = page.waitForResponse((response) =>
    response.url().includes("/analytics/sleep/?target_minutes=510"),
  );
  await hours.fill("8");
  await expect(
    page.getByRole("status", { name: "Loading Sleep insights" }),
  ).not.toBeVisible();
  await expect(hours).toBeVisible();
  await expect(hours).toBeFocused();
  await recalculated;
  await expect(hours).toBeFocused();
});

test("Sleep chart aligns a target-length bar with the target line", async ({
  page,
}) => {
  await page.goto("/analytics/sleep");
  const line = page.locator(".sleep-target-line");
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  const barBox = (await page
    .locator(".sleep-night-bar")
    .first()
    .boundingBox())!;
  expect(Math.abs(lineBox.y + lineBox.height - barBox.y)).toBeLessThan(1);
});

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`Sleep overview at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      await page.route(
        "**/api/v1/metrics/analytics/sleep/?*",
        async (route) => {
          const durations = [null, 360, 480, 450, null, 390, 510];
          await route.fulfill({
            json: {
              range_days: 7,
              target_minutes: 450,
              series: durations.map((duration, index) => ({
                date: `2026-09-${15 + index}`,
                duration_minutes: duration,
                shortfall_minutes:
                  duration === null ? null : Math.max(450 - duration, 0),
                recorded_at:
                  duration === null ? null : `2026-09-${15 + index}T07:00:00Z`,
                period_start:
                  duration === null
                    ? null
                    : new Date(
                        Date.parse(`2026-09-${15 + index}T07:00:00Z`) -
                          duration * 60000,
                      ).toISOString(),
              })),
              summary: {
                tracked_nights: 5,
                nights_under_target: 2,
                total_shortfall_minutes: 150,
                average_duration_minutes: 438,
                worst_night: { date: "2026-09-16", duration_minutes: 360 },
              },
            },
          });
        },
      );
      await page.goto("/analytics/sleep");
      const chart = page.getByRole("img", { name: /Nightly sleep durations/ });
      await expect(chart).toBeVisible();
      await expect(page.getByLabel("Hours", { exact: true })).not.toBeVisible();
      expect((await chart.boundingBox())!.y).toBeLessThan(650);
      await expect(
        page.getByText(/Calculated from 5 of 7 nights/),
      ).toBeVisible();
      await expect(
        page.getByText(/Longer nights do not subtract/),
      ).not.toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("sleep.png"),
        fullPage: true,
      });
      await page.getByText("How this works", { exact: true }).click();
      await expect(
        page.getByText(/Longer nights do not subtract/),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }
}

for (const width of [320, 390, 1440]) {
  test(`recovery tracking and custom tools at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      localStorage.setItem("longevity-theme", "light"),
    );
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
    if (width === 390 || width === 1440) {
      await page.screenshot({
        path: testInfo.outputPath(
          `recovery-${width === 390 ? "mobile" : "desktop"}-light.png`,
        ),
        fullPage: true,
      });
    }
    if (width === 320) {
      const dailySummary = page.getByRole("region", { name: "Daily tracking" });
      await expect(dailySummary).toBeVisible();
      expect((await dailySummary.boundingBox())!.y).toBeLessThan(
        (await checkbox.boundingBox())!.y,
      );
    }
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(
      page.getByRole("status").filter({ hasText: "activity recorded" }),
    ).toHaveText("1 activity recorded");
    await page.reload();
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await page.getByRole("button", { name: "Add custom tool" }).click();
    await page.getByRole("textbox", { name: "Tool name" }).fill("Sauna");
    await page.getByRole("button", { name: "Add tool", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Sauna" })).toBeVisible();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await page.goto("/");
    const recoveryPanel = page.getByRole("link", {
      name: /^Recovery 1 activity today/,
    });
    await expect(
      recoveryPanel.getByText("1 activity today", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/layout/dashboard-recovery-${width}.png`,
      fullPage: true,
    });
    await recoveryPanel.click();
    await expect(checkbox).toBeChecked();
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

for (const width of [320, 1440]) {
  test(`diet creation, management, history and dashboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date("2026-10-01T12:00:00") });
    const sections: {
      id: string;
      name: string;
      display_order: number;
      is_active: boolean;
    }[] = [];
    const foods: {
      id: string;
      section_id: string;
      name: string;
      display_order: number;
      is_active: boolean;
    }[] = [];
    const dietEntries: {
      id: number;
      food_id: string;
      performed_on: string;
      created_at: string;
    }[] = [];
    await page.route("**/api/v1/diet/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      let json: unknown = {};
      if (url.pathname.endsWith("catalog/")) json = { sections, foods };
      else if (url.pathname.endsWith("entries/"))
        json = dietEntries.filter(
          (e) =>
            e.performed_on >= url.searchParams.get("date_from")! &&
            e.performed_on <= url.searchParams.get("date_to")!,
        );
      else if (url.pathname.includes("entries/")) {
        const day = url.pathname.split("/").at(-2)!;
        if (method === "PUT") {
          const entry = {
            id: 1,
            food_id: "f",
            performed_on: day,
            created_at: "",
          };
          dietEntries.push(entry);
          json = entry;
        } else {
          const i = dietEntries.findIndex((e) => e.performed_on === day);
          if (i >= 0) dietEntries.splice(i, 1);
          await route.fulfill({ status: 204 });
          return;
        }
      } else {
        const data = route.request().postDataJSON();
        if (url.pathname.includes("sections/")) {
          if (method === "POST")
            sections.push({
              id: "s",
              display_order: 10,
              is_active: true,
              ...data,
            });
          else Object.assign(sections[0], data);
          json = sections[0];
        } else {
          if (method === "POST")
            foods.push({
              id: "f",
              display_order: 10,
              is_active: true,
              ...data,
            });
          else Object.assign(foods[0], data);
          json = foods[0];
        }
      }
      await route.fulfill({ status: method === "POST" ? 201 : 200, json });
    });
    await page.goto("/diet");
    await expect(page.getByText("Build your food checklist")).toBeVisible();
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await page.getByLabel("Section name").fill("Protein");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Add food to Protein" }).click();
    await page.getByLabel("Food name").fill("Chicken");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const chicken = page.getByRole("checkbox", {
      name: "Chicken",
      exact: true,
    });
    // Controlled checkboxes update only after the server-confirmed save/refetch.
    await chicken.click();
    await expect(chicken).toBeChecked();
    await page.getByRole("button", { name: "Choose date" }).click();
    await page.getByLabel("Tracking date").fill("2026-09-20");
    await expect(chicken).not.toBeChecked();
    await expect(page.locator(".diet-week button").last()).toHaveAttribute(
      "aria-label",
      "Thursday 1 October",
    );
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(chicken).toBeChecked();
    await page
      .getByRole("button", { name: "Manage checklist", exact: true })
      .click();
    await page.getByLabel("Actions for Chicken", { exact: true }).click();
    await page
      .getByRole("button", { name: "Edit Chicken", exact: true })
      .click();
    await page.getByLabel("Food name").fill("Eggs");
    await page.getByLabel("Display order").fill("0");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByLabel("Actions for Eggs", { exact: true }).click();
    await page
      .getByRole("button", { name: "Archive Eggs", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Eggs · Archived", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Actions for Eggs", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Restore Eggs", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Restore Eggs", exact: true })
      .click();
    await page.getByLabel("Actions for Protein", { exact: true }).click();
    await page
      .getByRole("button", { name: "Archive Protein", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Eggs", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Actions for Protein", { exact: true }).click();
    await page
      .getByRole("button", { name: "Restore Protein", exact: true })
      .click();
    await page.getByRole("button", { name: "Done managing" }).click();
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Eggs", exact: true }),
    ).toBeChecked();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/layout/diet-${width}.png`,
      fullPage: true,
    });
    await page.goto("/");
    const panel = page
      .getByRole("region", { name: "Today's logs" })
      .locator('[data-tracker="diet"]');
    await expect(
      panel.getByText("1 food today", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("1 of 7 days recorded")).toBeVisible();
    await panel.click();
    await page.getByRole("checkbox", { name: "Eggs", exact: true }).click();
    await expect(
      page.getByText("0 foods recorded · 0 sections represented"),
    ).toBeVisible();
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
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption("dark");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await selector.selectOption("light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  for (const path of ["/metrics", "/settings", "/login", "/register"]) {
    await page.goto(path);
    await expect(selector).toHaveValue("light");
    await expect(root).toHaveAttribute("data-theme", "light");
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
    .selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("legacy Sand preference falls back to Dark", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "sand"),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
  await expect(page.getByLabel("Color theme").locator("option")).toHaveCount(2);
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

for (const width of [320, 390, 560, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`Settings overview at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      await page.goto("/settings");
      const personal = page.getByRole("region", {
        name: "Personal info",
        exact: true,
      });
      const birthDate = personal.getByLabel("Date of birth");
      await expect(birthDate).toBeAttached();
      await page.addStyleTag({
        content:
          '[aria-label="Open TanStack Router Devtools"] { display: none !important; }',
      });
      const account = page.getByRole("region", {
        name: "Account data",
        exact: true,
      });
      const downloadBox = (await account
        .getByRole("button", { name: "Download account data" })
        .boundingBox())!;
      const deleteBox = (await account
        .getByRole("button", { name: "Delete account", exact: true })
        .boundingBox())!;
      expect(Math.abs(downloadBox.x - deleteBox.x)).toBeLessThan(1);
      expect(Math.abs(downloadBox.width - deleteBox.width)).toBeLessThan(1);
      await page.screenshot({
        path: testInfo.outputPath("settings.png"),
        fullPage: true,
      });
      await expect(birthDate).not.toBeVisible();
      await personal.locator("summary").click();
      await expect(birthDate).toBeVisible();
      await personal.getByLabel("Height (cm)").fill("180");
      await personal.locator("summary").click();
      await personal.locator("summary").click();
      await expect(personal.getByLabel("Height (cm)")).toHaveValue("180");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.goto("/settings#personal-info");
      await expect(birthDate).toBeVisible();
      const exportButton = page.getByRole("button", {
        name: "Export health data",
        exact: true,
      });
      await exportButton.click();
      const exportDialog = page.getByRole("dialog", {
        name: "Export health data",
        exact: true,
      });
      await expect(exportDialog).toBeVisible();
      expect(
        await exportDialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await exportDialog.getByRole("button", { name: "Close dialog" }).click();
      await expect(exportButton).toBeFocused();
    });
  }
}

for (const width of [320, 1440]) {
  test(`Settings Free-plan tools at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/subscriptions/current/", (route) =>
      route.fulfill({
        json: {
          id: "free",
          status: "active",
          billing_portal_available: false,
          current_period_end: null,
          cancel_at: null,
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
            csv_export_enabled: false,
          },
        },
      }),
    );
    await page.route("**/api/v1/subscriptions/plans/", (route) =>
      route.fulfill({
        json: [
          {
            code: "pro",
            name: "Pro",
            is_default: false,
            active_custom_metric_limit: 10,
            wearable_connection_limit: 2,
            automatic_sync_enabled: true,
            sync_interval_minutes: 15,
            analytics_enabled: true,
            csv_import_enabled: true,
            csv_export_enabled: true,
            prices: [
              {
                id: "month",
                currency: "usd",
                unit_amount: 1000,
                billing_interval: "month",
              },
              {
                id: "year",
                currency: "usd",
                unit_amount: 10000,
                billing_interval: "year",
              },
            ],
          },
        ],
      }),
    );
    await page.goto("/settings");
    await expect(
      page.getByRole("button", { name: "Upgrade to Pro monthly" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export health data" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download account data" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage subscription" }),
    ).not.toBeVisible();
    await page.getByRole("link", { name: "View plans →" }).click();
    await expect(page).toHaveURL(/#available-plans$/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath("settings-free.png"),
      fullPage: true,
    });
  });
}

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`Consistency overview at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      await page.goto("/analytics/consistency");
      await expect(
        page.getByRole("heading", { name: "Consistency & Coverage" }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("consistency.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const days = page.getByRole("link", { name: /^Body Weight on/ });
      await expect(days).toHaveCount(7);
      for (const day of await days.all()) {
        expect((await day.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(days.last()).toHaveAttribute(
        "href",
        "/metrics/body_weight?date=2026-09-21",
      );
      const explanation = page.getByText(/Multiple entries still count/);
      await expect(explanation).not.toBeVisible();
      await page.getByText("How this works", { exact: true }).click();
      await expect(explanation).toBeVisible();
      await days.last().focus();
      await expect(days.last()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/metrics\/body_weight\?date=2026-09-21$/);
    });
  }
}

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
      ["/metrics", "+ New metric"],
      ["/metrics", "Archive Personal wellbeing and energy score"],
      ["/settings", "Export health data"],
    ]) {
      await page.goto(path);
      if (action.startsWith("Archive "))
        await page.getByText("⋯", { exact: true }).click();
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
          "rgb(255, 255, 255)",
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
      if (route.request().method() !== "DELETE") return route.fallback();
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
