import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "./support/e2e-api";
import type {
  Workout,
  WorkoutExercise,
  WorkoutSet,
  Exercise,
} from "../src/features/workouts/workout-api";

for (const width of [320, 390, 1440]) {
  test(`real backend bulk history editing at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await resetE2eDatabase(request);
    await page.goto("/register");
    await page.getByLabel(/email/i).fill("bulk-live@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Secret123!Strong");
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await page.getByLabel(/email/i).fill("bulk-live@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Secret123!Strong");
    const login = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/web/login/") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /login/i }).click();
    const { access } = await (await login).json();
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();
    const headers = { Authorization: `Bearer ${access}` };
    const base = "/api/v1/workouts/";
    const catalog = await request.post(base + "catalog/initialize/", {
      headers,
      data: {},
    });
    const exercise: Exercise = (await catalog.json()).exercises.find(
      (e: Exercise) => e.name === "Barbell bench press",
    );
    const fixtures: {
      workout: Workout;
      item: WorkoutExercise;
      set: WorkoutSet;
    }[] = [];
    for (const [n, date] of [
      "2026-10-01",
      "2026-10-03",
      "2026-10-02",
    ].entries()) {
      const workout: Workout = await (
        await request.post(base + "sessions/", {
          headers,
          data: { performed_on: date, name: `Push ${n + 1}` },
        })
      ).json();
      const item: WorkoutExercise = await (
        await request.post(base + `sessions/${workout.id}/exercises/`, {
          headers,
          data: { exercise_id: exercise.id },
        })
      ).json();
      const set: WorkoutSet = await (
        await request.post(base + `session-exercises/${item.id}/sets/`, {
          headers,
          data: {
            weight: "70",
            reps: 5,
            comment: "Keep this comment",
            is_completed: false,
          },
        })
      ).json();
      if (n === 2)
        expect(
          (
            await request.patch(base + `sessions/${workout.id}/`, {
              headers,
              data: { is_finished: true },
            })
          ).ok(),
        ).toBe(true);
      fixtures.push({ workout, item, set });
    }
    const current = fixtures[1];
    await page.goto(
      `/workouts?view=training&date=2026-10-03&session=${current.workout.id}&exercise=${current.item.id}`,
    );
    await page
      .getByRole("button", { name: "Exercise history", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit multiple sets", exact: true })
      .click();
    let dialog = page.getByRole("dialog", { name: "Edit multiple sets" });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      dialog.getByRole("checkbox", { name: /Finished — reopen to edit/ }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Select all editable sets" })
      .click();
    await expect(dialog.getByRole("status")).toHaveText("2 sets selected");
    await dialog.getByLabel("Weight (kg)").fill("80");
    await dialog
      .getByRole("combobox", { name: "Completion", exact: true })
      .selectOption("completed");
    let writes = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/sets/bulk/") && r.method() === "POST") writes++;
    });
    await dialog.getByRole("button", { name: "Preview changes" }).click();
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: `../playground/workout-live-screenshots/${name}-${width}.png`,
        fullPage: true,
      });
    };
    await expect(
      dialog.getByText(/After: 80 kg · 5 reps · Completed/),
    ).toHaveCount(2);
    expect(writes).toBe(0);
    await capture("bulk-preview");
    await dialog.getByRole("button", { name: "Apply to 2 sets" }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Exercise history", exact: true })
      .click();
    await expect(
      page.getByText("80 kg · 5 reps · Completed · Keep this comment", {
        exact: true,
      }),
    ).toHaveCount(2);
    for (const fixture of fixtures.slice(0, 2)) {
      const saved: Workout = await (
        await request.get(base + `sessions/${fixture.workout.id}/`, { headers })
      ).json();
      expect(saved.exercises[0].sets[0]).toEqual({
        ...fixture.set,
        weight: "80.000",
        is_completed: true,
      });
    }

    // A second writer changing a comment invalidates the entire reviewed batch.
    await page.getByRole("button", { name: "Edit multiple sets" }).click();
    dialog = page.getByRole("dialog", { name: "Edit multiple sets" });
    await dialog
      .getByRole("button", { name: "Select all editable sets" })
      .click();
    await dialog.getByLabel("Weight (kg)").fill("90");
    await dialog.getByRole("button", { name: "Preview changes" }).click();
    expect(
      (
        await request.patch(base + `sets/${fixtures[0].set.id}/`, {
          headers,
          data: { comment: "Changed elsewhere" },
        })
      ).ok(),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Apply to 2 sets" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "A selected set changed",
    );
    await expect(
      dialog.getByRole("button", { name: "Apply to 2 sets" }),
    ).toBeDisabled();
    const unchanged: Workout = await (
      await request.get(base + `sessions/${current.workout.id}/`, { headers })
    ).json();
    expect(unchanged.exercises[0].sets[0].weight).toBe("80.000");
    await dialog.getByRole("button", { name: "Refresh history" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/Changed elsewhere/)).toBeVisible();

    // The library overview shares the same explicit destructive preview.
    await page.goto(
      `/workouts?view=overview&date=2026-10-03&exercise=${exercise.id}`,
    );
    await page
      .getByRole("button", { name: "History", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "Edit multiple sets" }).click();
    dialog = page.getByRole("dialog", { name: "Edit multiple sets" });
    await dialog
      .getByRole("button", { name: "Select all editable sets" })
      .click();
    await dialog
      .getByRole("combobox", { name: "Action", exact: true })
      .selectOption("delete");
    await dialog.getByRole("button", { name: "Preview changes" }).click();
    await capture("bulk-delete-preview");
    const beforeCancel = writes;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(writes).toBe(beforeCancel);
    await page.getByRole("button", { name: "Edit multiple sets" }).click();
    dialog = page.getByRole("dialog", { name: "Edit multiple sets" });
    await dialog
      .getByRole("button", { name: "Select all editable sets" })
      .click();
    await dialog
      .getByRole("combobox", { name: "Action", exact: true })
      .selectOption("delete");
    await dialog.getByRole("button", { name: "Preview changes" }).click();
    await dialog.getByRole("button", { name: "Delete 2 sets" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByText("No sets recorded.", { exact: true }),
    ).toHaveCount(2);
    await page.reload();
    for (const fixture of fixtures.slice(0, 2)) {
      const saved: Workout = await (
        await request.get(base + `sessions/${fixture.workout.id}/`, { headers })
      ).json();
      expect(saved.exercises).toHaveLength(1);
      expect(saved.exercises[0].sets).toHaveLength(0);
    }
    const finished: Workout = await (
      await request.get(base + `sessions/${fixtures[2].workout.id}/`, {
        headers,
      })
    ).json();
    expect(finished.exercises[0].sets).toEqual([fixtures[2].set]);
  });
}
