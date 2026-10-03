import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "./support/e2e-api";
import { shiftDay } from "../src/features/workouts/workout-navigation";

for (const width of [320, 390, 1440]) {
  test(`real backend workout conveniences at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
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
    await page.getByRole("button", { name: "Add workout template" }).click();
    await page.getByLabel("Day name").fill("Push");
    await page.getByRole("button", { name: "Create day" }).click();
    await expect(
      page.getByRole("dialog", { name: "Edit workout template" }),
    ).toBeVisible();
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
    await expect(
      page.getByText("Training plan", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 workout template", { exact: true }),
    ).toBeVisible();
    await capture("routine-templates");
    await page.getByRole("button", { name: "Start Push", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Preview routine start" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Fill blank fields from earlier completed sets"),
    ).not.toBeChecked();
    await expect(
      page.getByRole("region", { name: "Routine start preview" }),
    ).toContainText("40 kg · 5 reps");
    await capture("routine-start-preview");
    await page
      .getByRole("button", { name: "Start planned workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Edit template" }).click();
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
    await page
      .getByRole("button", { name: "Add to group", exact: true })
      .click();
    await page.getByRole("button", { name: "New group", exact: true }).click();
    await expect(page.getByLabel("Group name")).toHaveValue("Superset 1");
    await expect(
      page.getByLabel("Barbell bench press", { exact: true }),
    ).toBeChecked();
    await page.getByLabel("Group name").fill("Circuit A");
    await page.getByRole("button", { name: "Pink", exact: true }).click();
    await page
      .getByRole("button", { name: "Add exercise to group", exact: true })
      .click();
    await page.getByLabel("Dumbbell incline press", { exact: true }).check();
    await capture("group-editor");
    await page.getByRole("button", { name: "Save group", exact: true }).click();
    await expect(
      page
        .getByRole("complementary")
        .getByRole("button", { name: /^Dumbbell incline press/ }),
    ).toHaveCSS("border-left-color", "rgb(219, 39, 119)");
    await page
      .getByRole("complementary")
      .getByRole("button", { name: /^Barbell bench press/ })
      .click();
    await page.getByRole("timer").click();
    await page.getByLabel("Auto-start after completed set").click();
    await expect(
      page.getByLabel("Auto-start after completed set"),
    ).toBeChecked();
    await expect(
      page.getByLabel("Advance within group after completion"),
    ).toBeChecked();
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
    await page
      .getByRole("button", { name: "Move set 2 up", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".workout-set-values").first()).toContainText(
      "80 kg",
    );
    await page.reload();
    await expect(page.locator(".workout-set-values").first()).toContainText(
      "80 kg",
    );
    await expect(
      page.getByRole("button", { name: "Move set 1 up", exact: true }),
    ).toBeDisabled();
    await capture("set-ordering");
    await page
      .getByRole("button", { name: "Move set 1 down", exact: true })
      .click();
    await expect(page.locator(".workout-set-values").first()).toContainText(
      "40 kg",
    );
    await page
      .getByRole("button", { name: "Workout overview", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Move exercise 2 (Dumbbell incline press) up",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Move exercise 1 (Dumbbell incline press) up",
        exact: true,
      }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.locator(".workout-inset.workout-group-mark").first(),
    ).toContainText("Dumbbell incline press");
    await capture("exercise-ordering");
    await page
      .getByRole("button", { name: "Barbell bench press →", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Move exercise 2 (Barbell bench press) up",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Move exercise 1 (Barbell bench press) up",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Barbell bench press", level: 1 }),
    ).toBeVisible();
    await page.getByText("Workout calculators", { exact: true }).click();
    await page.getByLabel("Lifted load (kg)").fill("100");
    await page.getByLabel("Lifted reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Calculate estimated 1RM" }).click();
    await expect(page.getByText(/Estimated 1RM: 116.7 kg/)).toBeVisible();
    await page.getByLabel("Target including bar (kg)").fill("100");
    await page.getByLabel("Plate 2 total count", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Calculate plates" }).click();
    await expect(page.getByText(/Each side: 2 × 20 kg/)).toBeVisible();
    await page.getByRole("button", { name: "Save equipment defaults" }).click();
    await expect(
      page.getByText("Equipment defaults saved to your account."),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("timer").click();
    await expect(
      page.getByLabel("Auto-start after completed set"),
    ).toBeChecked();
    await expect(
      page.getByLabel("Advance within group after completion"),
    ).toBeChecked();
    await page.getByText("Workout calculators", { exact: true }).click();
    await expect(page.getByLabel("Bar weight (kg)")).toHaveValue("20.000");
    await expect(
      page.getByLabel("Plate 2 total count", { exact: true }),
    ).toHaveValue("4");
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
    const progressChart = page.getByRole("img", {
      name: /Highest logged load by training date/,
    });
    await expect
      .poll(() =>
        progressChart.evaluate((chart) => {
          const svg = chart as SVGSVGElement;
          return Math.abs(
            svg.viewBox.baseVal.width - svg.getBoundingClientRect().width,
          );
        }),
      )
      .toBeLessThan(1);
    await expect(
      progressChart.getByText("0 kg", { exact: true }),
    ).toBeVisible();
    await expect(
      progressChart.getByText("10 kg", { exact: true }),
    ).toBeVisible();
    await expect(
      progressChart.getByText("40 kg", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("estimated_1rm");
    await expect(
      page.getByRole("img", { name: /Estimated 1RM by training date/ }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Graph point details", exact: true })
      .selectOption("1");
    await expect(
      page.getByRole("region", { name: "Selected training point" }),
    ).toContainText(currentDate);
    await expect(
      page.getByRole("region", { name: "Selected training point" }),
    ).toContainText("Source set: 40 kg × 5 reps");
    await expect(
      page.getByText(/Only positive loads with 1–10 reps are included/),
    ).toContainText("reps left in reserve");
    await capture("progress-estimated-1rm");
    for (const [metric, title] of [
      ["max_reps", "Max reps"],
      ["max_volume", "Max volume"],
      ["workout_volume", "Workout volume"],
      ["workout_reps", "Workout reps"],
    ]) {
      await page
        .getByRole("combobox", { name: "Graph", exact: true })
        .selectOption(metric);
      await expect(
        page.getByRole("img", {
          name: new RegExp(`${title} by training date`),
        }),
      ).toBeVisible();
    }
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("workout_volume");
    await capture("progress-workout-volume");
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("max_weight_reps");
    await page.getByLabel("Rep count", { exact: true }).fill("8");
    await expect(
      page.getByText(
        "No eligible completed sets for this graph at 8 reps in this window.",
      ),
    ).toBeVisible();
    await page.getByLabel("Rep count", { exact: true }).fill("5");
    await expect(
      page.getByRole("img", { name: /Max weight for 5 reps/ }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("personal_records");
    await expect(
      page.getByRole("heading", {
        name: "Personal records in this window · kg",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /by training date/ }),
    ).toHaveCount(0);
    await capture("progress-personal-records");
    await page
      .getByRole("combobox", { name: "Progress window", exact: true })
      .selectOption("0");
    await expect(
      page.getByRole("heading", { name: "All-time personal records · kg" }),
    ).toBeVisible();
    await expect(page.getByText(/All recorded training through/)).toBeVisible();
    await page
      .getByRole("button", { name: "PR history for 5 reps (kg)", exact: true })
      .click();
    const recordsDialog = page.getByRole("dialog", {
      name: "PR history · 5 reps · kg",
    });
    await expect(
      recordsDialog.getByText("45 kg × 5 reps", { exact: true }),
    ).toBeVisible();
    await expect(
      recordsDialog.getByRole("button", { name: /Open source set from/ }),
    ).toBeVisible();
    await capture("all-time-record-history");
    await recordsDialog
      .getByRole("button", { name: "Close PR history" })
      .click();
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("max_weight");
    await expect(
      page.getByRole("img", { name: /Highest logged load/ }),
    ).toBeVisible();
    await capture("all-time-progress");
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("max_weight");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await expect(page.getByText(/40 kg/)).toBeVisible();
    let accidentalWrites = 0;
    page.on("request", (outgoing) => {
      if (
        outgoing.method() === "POST" &&
        /\/api\/v1\/workouts\/sessions\/(?:[^/]+\/exercises\/)?$/.test(
          new URL(outgoing.url()).pathname,
        )
      )
        accidentalWrites++;
    });
    await page
      .getByRole("button", { name: "All exercises", exact: true })
      .click();
    await page
      .getByRole("button", { name: "View Barbell bench press", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Barbell bench press");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Favorite Barbell bench press",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Unfavorite Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Unfavorite Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Favorites", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "View Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View Goblet squat", exact: true }),
    ).toHaveCount(0);
    await capture("favorite-library");
    await page
      .getByRole("button", { name: "View Barbell bench press", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Exercise overview", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Exercise overview", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Total reps", { exact: true })).toBeVisible();
    await capture("exercise-statistics");
    const overviewTabs = page.getByRole("navigation", {
      name: "Exercise overview sections",
    });
    await overviewTabs
      .getByRole("button", { name: "History", exact: true })
      .click();
    await expect(
      page.getByText("40 kg · 5 reps · Completed", { exact: true }).first(),
    ).toBeVisible();
    await overviewTabs
      .getByRole("button", { name: "Graphs", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Graph", exact: true }),
    ).toBeVisible();
    await overviewTabs
      .getByRole("button", { name: "Records", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Graph", exact: true }),
    ).toHaveValue("personal_records");
    await expect(page.getByLabel("Progress window")).toHaveValue("0");
    await overviewTabs
      .getByRole("button", { name: "Goals", exact: true })
      .click();
    await page.getByRole("button", { name: "New goal", exact: true }).click();
    await page.getByLabel("Target weight (kg)").fill("45");
    await page
      .getByRole("spinbutton", { name: "Target reps", exact: true })
      .fill("5");
    await capture("goal-editor");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(page.getByText("Achieved", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Edit goal 45 kg for 5 reps", exact: true })
      .click();
    await page.getByLabel("Target weight (kg)").fill("50");
    await page
      .getByRole("combobox", { name: "Rep rule", exact: true })
      .selectOption("exact");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(page.getByText("Not achieved", { exact: true })).toBeVisible();
    await page.reload();
    await overviewTabs
      .getByRole("button", { name: "Goals", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "50 kg × exactly 5 reps",
        exact: true,
      }),
    ).toBeVisible();
    await capture("exercise-goals");
    await page
      .getByRole("button", { name: "Open supporting lift", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Barbell bench press", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("45 kg · 5 reps", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Exercise overview", exact: true })
      .click();
    await overviewTabs
      .getByRole("button", { name: "Goals", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Remove goal 50 kg for 5 reps",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirm remove goal", exact: true })
      .click();
    await expect(
      page.getByText("No goals yet.", { exact: true }),
    ).toBeVisible();
    expect(accidentalWrites).toBe(0);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByLabel("Tracking date").fill(currentDate);
    await page
      .getByRole("button", { name: "Barbell bench press →", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Exercise history", exact: true })
      .click();
    await expect(
      page.getByText("Current session", { exact: true }),
    ).toBeVisible();
    await capture("exercise-history");
    await page
      .getByRole("button", { name: "Back to Track", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add exercise", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open Barbell bench press", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Barbell bench press", level: 1 }),
    ).toBeVisible();
    expect(accidentalWrites).toBe(0);
    await page
      .getByRole("button", { name: "Workout overview", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Remove Dumbbell incline press from workout",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText("sets");
    await capture("exercise-removal");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Dumbbell incline press →",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Remove Dumbbell incline press from workout",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirm exercise removal", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Dumbbell incline press →",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "All exercises", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "View Dumbbell incline press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    const copyDate = shiftDay(currentDate, 1);
    await page.getByLabel("Tracking date").fill(copyDate);
    await page
      .getByRole("button", { name: "Copy previous workout", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Select the workout you would like to copy",
    });
    await expect(picker).toBeVisible();
    // Browsing the source month must not change the chosen destination.
    if (copyDate.slice(0, 7) !== currentDate.slice(0, 7)) {
      await picker
        .getByRole("button", { name: "Previous month", exact: true })
        .click();
    }
    await picker
      .getByRole("button", { name: new RegExp(`^${currentDate}:`) })
      .click();
    await capture("copy-workout-picker");
    await picker
      .getByRole("combobox", { name: "Calendar exercise", exact: true })
      .selectOption({ label: "Barbell bench press" });
    await picker
      .getByRole("combobox", { name: "Calendar status", exact: true })
      .selectOption("training");
    await capture("copy-picker-filters");
    await expect(page.getByLabel("Tracking date")).toHaveValue(copyDate);
    await picker
      .getByRole("button", { name: new RegExp(`^Copy .+ to ${copyDate}$`) })
      .and(picker.locator("button:enabled"))
      .first()
      .click();
    const selection = page.getByRole("dialog", { name: /^Copy / });
    await expect(selection.locator(".workout-copy-choice").first()).toHaveCSS(
      "display",
      "flex",
    );
    await selection
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await expect(
      selection.getByRole("button", { name: "Preview copy", exact: true }),
    ).toBeDisabled();
    await selection
      .getByRole("checkbox", { name: /^Include exercise 1 set 1:/ })
      .check();
    await capture("copy-selection");
    await selection
      .getByRole("button", { name: "Preview copy", exact: true })
      .click();
    const preview = selection.getByRole("region", { name: "Copy preview" });
    await expect(preview).toContainText("40 kg · 5 reps");
    await expect(preview).not.toContainText("80 kg");
    await capture("copy-preview");
    const copiedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/sessions\/[^/]+\/copy\/$/.test(new URL(response.url()).pathname),
    );
    await selection
      .getByRole("button", { name: "Create planned workout", exact: true })
      .click();
    const response = await copiedResponse;
    expect(response.request().postDataJSON().selection).toHaveLength(1);
    const copied = await response.json();
    expect(copied.performed_on).toBe(copyDate);
    expect(copied.completed_set_count).toBe(0);
    expect(copied.exercises).toHaveLength(1);
    expect(copied.exercises[0].sets).toHaveLength(1);
    expect(copied.exercises[0].sets[0].weight).toBe("40.000");
    expect(copied.exercises[0].sets[0].comment).toBe("");
    for (const exercise of copied.exercises) {
      for (const set of exercise.sets) expect(set.is_completed).toBe(false);
    }
    await expect(picker).toHaveCount(0);
    await expect(selection).toHaveCount(0);
    await expect(page.getByLabel("Tracking date")).toHaveValue(copyDate);
    await expect(
      page.getByText("Planned", { exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("40 kg · 5 reps", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("80 kg", { exact: false })).toHaveCount(0);
    // Blank template fields are filled explicitly from earlier completed history,
    // not from the planned copy on the destination date.
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Edit template" }).click();
    await page.getByRole("button", { name: /Set 1:/ }).click();
    await page.getByLabel("Weight (kg)").fill("");
    await page.getByRole("button", { name: "Update planned set" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Start Push", exact: true }).click();
    const routinePreview = page.getByRole("region", {
      name: "Routine start preview",
    });
    await expect(routinePreview).toContainText("5 reps");
    await expect(routinePreview).not.toContainText("40 kg");
    await page
      .getByLabel("Fill blank fields from earlier completed sets")
      .check();
    await expect(routinePreview).toContainText("40 kg · 5 reps");
    await expect(routinePreview).toContainText(`From ${currentDate}: weight`);
    await capture("routine-carry-forward");
    const startedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/routine-days\/[^/]+\/start\/$/.test(
          new URL(response.url()).pathname,
        ),
    );
    await page
      .getByRole("button", { name: "Start planned workout", exact: true })
      .click();
    const started = await (await startedResponse).json();
    expect(started.performed_on).toBe(copyDate);
    expect(started.exercises[0].sets[0].weight).toBe("40.000");
    expect(started.exercises[0].sets[0].is_completed).toBe(false);
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Edit template" }).click();
    await page.getByRole("button", { name: /Set 1:/ }).click();
    await expect(page.getByLabel("Weight (kg)")).toHaveValue("");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page
      .getByRole("button", { name: "Start new workout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add Running", exact: true })
      .click();
    await page.getByLabel("Distance (km)").fill("3");
    await page.getByLabel("Duration (seconds)").fill("900");
    await page
      .getByRole("button", { name: "Save completed set", exact: true })
      .click();
    await page.getByLabel("Distance (km)").fill("5");
    await page.getByLabel("Duration (seconds)").fill("1800");
    await page
      .getByRole("button", { name: "Save completed set", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Exercise overview", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Exercise overview sections" })
      .getByRole("button", { name: "Graphs", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("best_pace");
    await expect(
      page.getByRole("heading", {
        name: "Best logged pace (lower is faster) · min/km",
      }),
    ).toBeVisible();
    await page.getByLabel("Graph point details").selectOption("0");
    await expect(
      page.getByRole("region", { name: "Selected training point" }),
    ).toContainText("5:00 min/km");
    await capture("cardio-pace");
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("max_speed");
    await expect(
      page.getByRole("heading", { name: "Fastest logged speed · km/h" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "12 km/h", exact: true }),
    ).toBeVisible();
    await capture("cardio-speed");
    await page.getByLabel("Progress window").selectOption("0");
    await expect(
      page.getByRole("cell", { name: "12 km/h", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Graph", exact: true })
      .selectOption("best_pace");
    await expect(
      page.getByRole("cell", { name: "5:00 min/km", exact: true }),
    ).toBeVisible();
    await capture("cardio-all-time-pace");
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Calendar exercise", exact: true })
      .selectOption({ label: "Running" });
    await page
      .getByRole("combobox", { name: "Calendar category", exact: true })
      .selectOption({ label: "Cardio" });
    await page
      .getByRole("combobox", { name: "Calendar status", exact: true })
      .selectOption("training");
    await expect(
      page.getByRole("button", {
        name: `${copyDate}: 1 training session, 0 planned sessions`,
        exact: true,
      }),
    ).toBeVisible();
    await capture("calendar-filters");
    await page
      .getByRole("combobox", { name: "Calendar status", exact: true })
      .selectOption("planned");
    await expect(
      page.getByText("No workouts match these filters in this month."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Calendar exercise", exact: true }),
    ).toHaveValue("");
    await expect(page.getByLabel("Tracking date")).toHaveValue(copyDate);
  });
}
