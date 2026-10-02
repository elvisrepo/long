import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "./support/e2e-api";
import { shiftDay } from "../src/features/workouts/workout-navigation";

for (const width of [320, 390, 1440]) {
  test(`real backend workout conveniences at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const capture = async (name: string) => {
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      const dialog = page.getByRole("dialog");
      if (await dialog.count())
        expect(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        ).toBe(true);
      await page.screenshot({
        path: `../playground/workout-live-screenshots/${name}-${width}.png`,
        fullPage: true,
      });
    };
    await resetE2eDatabase(request);
    await page.goto("/register");
    await page.getByLabel(/email/i).fill("workout-live@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Secret123!Strong");
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await page.getByLabel(/email/i).fill("workout-live@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Secret123!Strong");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Workouts", exact: true }).click();
    await page
      .getByRole("button", { name: "Start new workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "All exercises", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page
      .getByRole("button", { name: "New routine", exact: true })
      .click();
    await page.getByLabel("Routine name").fill("Weekly plan");
    await page
      .getByRole("button", { name: "Save routine", exact: true })
      .click();
    await page.getByRole("button", { name: "Add routine day" }).click();
    await page.getByLabel("Day name").fill("Push");
    await page.getByRole("button", { name: "Create day" }).click();
    await page.getByRole("button", { name: "Edit day" }).click();
    await page
      .getByLabel("Add an exercise")
      .selectOption({ label: "Barbell bench press" });
    await page.getByRole("button", { name: "Add exercise to day" }).click();
    await page.getByLabel("Weight (kg)").fill("40");
    await page.getByLabel("Reps", { exact: true }).fill("5");
    await page
      .getByRole("button", { name: "Add planned set", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /Set 1: 40 kg/ }),
    ).toBeVisible();
    await capture("routine-editor");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Start Push", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Edit day" }).click();
    await page.getByRole("button", { name: /Set 1:/ }).click();
    await page.getByLabel("Weight (kg)").fill("55");
    await page.getByRole("button", { name: "Update planned set" }).click();
    await expect(
      page.getByRole("button", { name: /Set 1: 55 kg/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByText(/40 kg/)).toBeVisible();
    await page
      .getByRole("button", { name: "Barbell bench press →", exact: true })
      .click();
    await page.getByRole("button", { name: "Manage exercise" }).click();
    await page.getByLabel("Superset / circuit name").fill("Circuit A");
    await page.getByRole("button", { name: "Save order & group" }).click();
    await page
      .getByRole("button", { name: "Add exercise", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add Dumbbell incline press", exact: true })
      .click();
    await page.getByRole("button", { name: "Manage exercise" }).click();
    await page.getByLabel("Superset / circuit name").fill("Circuit A");
    await page.getByRole("button", { name: "Save order & group" }).click();
    await page
      .getByRole("complementary")
      .getByRole("button", { name: /Barbell bench press/ })
      .click();
    await page.getByRole("timer").click();
    await page.getByLabel("Auto-start after completed set").check();
    await page.getByLabel("Advance within group after completion").check();
    // Server-confirmed control may navigate; don't assert an optimistic toggle.
    await page.getByLabel("Set 1 completed").click();
    await expect(
      page.getByRole("heading", { name: "Dumbbell incline press", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("timer")).not.toHaveText("0:00");
    await page.getByLabel("Weight (kg)", { exact: true }).fill("20");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page
      .getByRole("button", { name: "Save completed set", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Barbell bench press", level: 1 }),
    ).toBeVisible();
    await page.getByText("Workout calculators", { exact: true }).click();
    await page.getByLabel("Base load (kg)").fill("100");
    await page.getByRole("button", { name: "Calculate percentage" }).click();
    await page
      .getByRole("button", { name: "Add calculated planned set" })
      .click();
    await expect(
      page.getByText("80 kg · — reps", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Lifted load (kg)").fill("100");
    await page.getByLabel("Lifted reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Calculate estimated 1RM" }).click();
    await expect(page.getByText(/Estimated 1RM: 116.7 kg/)).toBeVisible();
    await page.getByLabel("Target including bar (kg)").fill("100");
    await page.getByLabel("Plate 2 total count", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Calculate plates" }).click();
    await expect(page.getByText(/Each side: 2 × 20 kg/)).toBeVisible();
    await capture("training-tools");
    await page
      .getByRole("button", { name: "Exercise progress", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Observed records in this window" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "40 kg", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "80 kg", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: /1 training session, 1 planned session/,
      }),
    ).toBeVisible();
    await capture("calendar");
    expect(
      await page
        .locator(".workout-calendar-grid button")
        .evaluateAll((elements) =>
          Math.max(
            ...elements.map(
              (element) => element.getBoundingClientRect().height,
            ),
          ),
        ),
    ).toBeLessThanOrEqual(76);
    await page
      .getByRole("button", { name: /1 training session, 1 planned session/ })
      .click();
    const currentDate = await page.getByLabel("Tracking date").inputValue();
    await page.getByLabel("Tracking date").fill(shiftDay(currentDate, -1));
    await page
      .getByRole("button", { name: "Start new workout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add Barbell bench press", exact: true })
      .click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("45");
    await page.getByLabel("Reps", { exact: true }).fill("5");
    await page
      .getByRole("button", { name: "Save completed set", exact: true })
      .click();
    await expect(page.getByLabel("Set 1 completed")).toBeChecked();
    await page
      .getByRole("button", { name: "Exercise progress", exact: true })
      .click();
    await page.getByLabel("Tracking date").fill(currentDate);
    await expect(
      page.getByRole("img", { name: /Highest logged load by training date/ }),
    ).toBeVisible();
    await capture("progress");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await expect(page.getByText(/40 kg/)).toBeVisible();
  });
}
