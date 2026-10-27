import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type {
  AiReviewResult,
  InsightSnapshot,
  AiTimeframe,
} from "../src/features/metrics/ai-insights-api";
const model = "nvidia/nemotron-3-super-120b-a12b",
  otherModel = "deepseek-ai/deepseek-v4.1-flash";
function snapshot(
  timeframe: AiTimeframe = "week",
  older = false,
): InsightSnapshot {
  const days = timeframe === "day" ? 1 : timeframe === "month" ? 30 : 7;
  const end = new Date("2026-10-26T12:00:00Z");
  if (older) end.setUTCDate(end.getUTCDate() - days);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  return {
    timeframe,
    days,
    timezone: "Europe/Tirane",
    period: { from: date(start), to: date(end) },
    previous_period: { from: date(previousStart), to: date(previousEnd) },
    evidence: {
      hrv: {
        label: "Heart Rate Variability",
        unit: "ms",
        current: {
          daily_average: older ? 55 : 44,
          observed_days: Math.min(days, 2),
        },
        previous: { daily_average: 46, observed_days: days },
        series: [],
      },
      sleep: {
        label: "Sleep duration",
        unit: "hours",
        current: { daily_average: 6.7, observed_days: days },
        previous: { daily_average: 7.1, observed_days: days },
        series: [],
      },
      skin_temperature: {
        label: "Skin temperature change",
        unit: "°C",
        current: { daily_average: 0, observed_days: 1 },
        previous: { daily_average: null, observed_days: 0 },
        series: [],
      },
      workouts: {
        label: "Workouts",
        unit: "",
        current: { count: 2, logged_days: Math.min(days, 2) },
        previous: { count: 3, logged_days: Math.min(days, 3) },
        series: [],
      },
    },
  };
}
function review(
  timeframe: AiTimeframe = "week",
  older = false,
): AiReviewResult {
  return {
    id: older ? "older" : "latest",
    model,
    generated_at: "2026-10-27T07:40:00Z",
    snapshot: snapshot(timeframe, older),
    review: {
      suggestions: [
        {
          text: older
            ? "Compare the prior week."
            : "Make your next workout easy to plan. You logged two workouts in this period. Choose a convenient slot and use one of your saved routines to reduce setup.\nUnlogged sessions are unknown. Record the sessions you actually complete so your next review has a useful comparison.",
          evidence_keys: ["workouts"],
        },
        {
          text: "Keep sleep logging consistent. Check the individual nights before drawing a conclusion from the average. These summaries do not establish why sleep changed.",
          evidence_keys: ["sleep", "hrv"],
        },
        {
          text: "Keep using the trackers that fit your routine. Missing measurements stay unknown; more check-offs do not prove a treatment effect.",
          evidence_keys: ["skin_temperature"],
        },
      ],
    },
  };
}
async function fixture(page: Page, firstUse = false) {
  const state = {
    generation: "pending",
    generations: 0,
    keyWrites: 0,
    hasKey: !firstUse,
    available: !firstUse,
    previewFail: false,
    savedFail: false,
    requests: [] as Record<string, unknown>[],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let json: unknown = {};
    if (path.endsWith("/refresh/")) json = { access: "ai-fixture" };
    else if (path.endsWith("/me/")) json = { email: "ai@example.test" };
    else if (path.endsWith("/ai-key/")) {
      if (request.method() === "PUT") {
        state.keyWrites++;
        state.hasKey = true;
        state.available = true;
      }
      json = { has_personal_key: state.hasKey };
    } else if (path.endsWith("/ai-weekly/")) {
      if (request.method() === "POST") {
        state.generations++;
        state.requests.push(request.postDataJSON());
        json = { job_id: `job-${state.generations}` };
      } else if (url.searchParams.has("job_id"))
        json =
          state.generation === "ready"
            ? {
                status: "ready",
                result: {
                  ...review(),
                  id: "generated",
                  review: {
                    suggestions: [
                      {
                        text: "New suggestions are ready.",
                        evidence_keys: ["sleep"],
                      },
                    ],
                  },
                },
              }
            : state.generation === "failed"
              ? { status: "failed", detail: "Provider unavailable" }
              : { status: "queued" };
      else if (url.searchParams.has("review_id")) {
        if (state.savedFail) {
          await route.fulfill({
            status: 503,
            json: { detail: "Saved review unavailable" },
          });
          return;
        }
        json = { status: "ready", result: review("week", true) };
      } else {
        if (state.previewFail) {
          await route.fulfill({
            status: 503,
            json: { detail: "Preview unavailable" },
          });
          return;
        }
        const timeframe = (url.searchParams.get("timeframe") ??
          "week") as AiTimeframe;
        const latest = review(timeframe),
          older = review(timeframe, true);
        json = {
          available: state.available,
          model,
          models: [
            { id: model, label: "Nemotron 3 Super" },
            { id: otherModel, label: "DeepSeek Flash" },
          ],
          snapshot: snapshot(timeframe),
          latest_review: firstUse ? null : latest,
          review_history: firstUse
            ? []
            : [latest, older].map((row) => ({
                id: row.id,
                model,
                generated_at: row.generated_at,
                timezone: row.snapshot.timezone,
                period_start: row.snapshot.period.from,
                period_end: row.snapshot.period.to,
              })),
        };
      }
    }
    await route.fulfill({ json });
  });
  await page.goto("/analytics/ai");
  await expect(
    page.getByRole("heading", { name: "AI Insights", exact: true }),
  ).toBeVisible();
  if (!firstUse)
    await expect(
      page.getByRole("heading", { name: "Weekly suggestions", exact: true }),
    ).toBeVisible();
  else
    await expect(
      page.getByRole("button", { name: "Save key", exact: true }),
    ).toBeVisible();
  return state;
}
for (const width of [320, 390, 560, 1440])
  for (const theme of ["light", "dark"])
    test(`AI review layout and data scopes at ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("longevity-theme", theme),
        theme,
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const state = await fixture(page);
      expect(state.generations).toBe(0);
      expect(state.keyWrites).toBe(0);
      await expect(
        page.getByLabel("NVIDIA API key", { exact: true }),
      ).not.toBeVisible();
      const generator = page.locator(".ai-new-review");
      await expect(generator).not.toHaveAttribute("open");
      const top = await page
        .getByRole("region", { name: "Your AI suggestions", exact: true })
        .evaluate((el) => Math.round(el.getBoundingClientRect().top + scrollY));
      expect(top).toBeLessThan(650);
      await page.evaluate(() => document.fonts.ready);
      const generatorBox = (await generator.boundingBox())!;
      const suggestionCards = page.locator(".ai-weekly-review > ol > li");
      for (const card of await suggestionCards.all()) {
        const cardBox = (await card.boundingBox())!;
        expect(Math.abs(cardBox.x - generatorBox.x)).toBeLessThan(1);
        expect(Math.abs(cardBox.width - generatorBox.width)).toBeLessThan(1);
      }
      const dir = "../.lavish/ai-insights-cleanup/assets";
      mkdirSync(dir, { recursive: true });
      const provider = page.locator(".ai-provider-settings");
      await provider.locator(":scope > summary").click();
      const replace = provider.getByRole("button", {
          name: "Replace key",
          exact: true,
        }),
        remove = provider.getByRole("button", {
          name: "Remove key",
          exact: true,
        });
      await expect(replace).toBeDisabled();
      await expect(remove).toBeVisible();
      const replaceBox = (await replace.boundingBox())!,
        removeBox = (await remove.boundingBox())!;
      expect(Math.abs(replaceBox.y - removeBox.y)).toBeLessThan(1);
      expect(Math.abs(replaceBox.height - removeBox.height)).toBeLessThan(1);
      expect(replaceBox.width).toBeLessThan(160);
      expect(removeBox.width).toBeLessThan(160);
      await provider.screenshot({
        path: `${dir}/provider-${theme}-${width}.png`,
      });
      await provider.locator(":scope > summary").click();
      await page.screenshot({
        path: `${dir}/saved-${theme}-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("combobox", { name: "Saved reviews", exact: true })
        .selectOption("older");
      await expect(
        page.getByText("Compare the prior week.", { exact: true }),
      ).toBeVisible();
      await page
        .getByText("Data used in this saved review", { exact: true })
        .click();
      await expect(
        page.getByRole("table", {
          name: "Data used in this saved review",
          exact: true,
        }),
      ).toContainText("55 ms");
      await expect(
        page.getByRole("table", {
          name: "Data used in this saved review",
          exact: true,
        }),
      ).toContainText("2026-10-13 – 2026-10-19");
      await generator.locator(":scope > summary").click();
      await page.getByText("Data to share", { exact: true }).first().click();
      const shared = page.getByRole("table", {
        name: "Data to share for a new review",
        exact: true,
      });
      await expect(shared).toContainText("44 ms");
      await expect(shared).not.toContainText("55 ms");
      await expect(shared).toContainText("2026-10-20 – 2026-10-26");
      await expect(shared).toContainText("No measurements");
      await expect(shared).toContainText("0 °C · 1/7 days");
      await page.screenshot({
        path: `${dir}/scopes-${theme}-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("checkbox").check();
      await page
        .getByRole("combobox", { name: "Review model", exact: true })
        .selectOption(otherModel);
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      await page
        .getByRole("combobox", { name: "Data period", exact: true })
        .selectOption("month");
      await expect(
        page.getByRole("heading", { name: "Monthly suggestions", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      expect(state.generations).toBe(0);
      expect(state.keyWrites).toBe(0);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      console.log(JSON.stringify({ theme, width, suggestionsTop: top }));
    });
test("keeps the saved review through a failed generation and focuses the result after retry", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.locator(".ai-new-review > summary").click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Generate suggestions", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Generating your suggestions…",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Weekly suggestions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Data period", exact: true }),
  ).toBeDisabled();
  state.generation = "failed";
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  state.generation = "ready";
  await page
    .getByRole("button", { name: "Generate suggestions", exact: true })
    .click();
  await expect(
    page.getByText("New suggestions are ready.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ai-new-review")).not.toHaveAttribute("open");
  await expect(
    page.getByRole("heading", { name: "Weekly suggestions", exact: true }),
  ).toBeFocused();
  expect(state.generations).toBe(2);
  expect(state.requests[0]).toMatchObject({
    consent: true,
    timeframe: "week",
    model,
  });
  await page.locator(".ai-new-review > summary").click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});
test("opens first-use provider setup and clears the key after saving without generating", async ({
  page,
}) => {
  const state = await fixture(page, true);
  await expect(page.locator(".ai-provider-settings")).toHaveAttribute("open");
  await expect(
    page.getByRole("button", { name: "Generate suggestions", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("NVIDIA API key", { exact: true })
    .fill("nvapi-fixture-only-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(page.getByLabel("NVIDIA API key", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".ai-provider-settings")).not.toHaveAttribute(
    "open",
  );
  expect(state.keyWrites).toBe(1);
  expect(state.generations).toBe(0);
});
test("retries a saved-read error without generating or substituting the current evidence", async ({
  page,
}) => {
  const state = await fixture(page);
  state.savedFail = true;
  await page
    .getByRole("combobox", { name: "Saved reviews", exact: true })
    .selectOption("older");
  await expect(page.getByRole("alert")).toContainText(
    "Saved review unavailable",
    { timeout: 15000 },
  );
  state.savedFail = false;
  await page
    .getByRole("button", { name: "Retry saved review", exact: true })
    .click();
  await expect(
    page.getByText("Compare the prior week.", { exact: true }),
  ).toBeVisible();
  expect(state.generations).toBe(0);
});
