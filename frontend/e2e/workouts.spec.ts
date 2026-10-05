import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { WorkoutRoutine } from "../src/features/workouts/workout-api";

const categoryId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const date = "2026-10-02";

async function fixture(page: Page) {
  const category = {
    id: categoryId,
    name: "Chest",
    display_order: 10,
    is_active: true,
  };
  const exercise = {
    ...category,
    id: exerciseId,
    category_id: categoryId,
    name: "Barbell bench press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.500",
    rest_seconds: 90,
  };
  type SetRow = {
    id: string;
    weight: string | null;
    reps: number | null;
    distance: null;
    duration_seconds: null;
    comment: string;
    display_order: number;
    is_completed: boolean;
  };
  const occurrence = {
    id: itemId,
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    category_name: category.name,
    tracking_type: exercise.tracking_type,
    weight_unit: "kg",
    distance_unit: "km",
    display_order: 10,
    sets: [] as SetRow[],
  };
  const sessions: {
    id: string;
    performed_on: string;
    name: string;
    notes: string;
    is_finished: boolean;
    created_at: string;
    completed_set_count: number;
    exercises: (typeof occurrence)[];
  }[] = [];
  const routines: WorkoutRoutine[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    let json: unknown = {};
    if (path.endsWith("/refresh/")) json = { access: "workout-fixture" };
    else if (path.endsWith("/me/")) json = { email: "workout@example.test" };
    else if (path.includes("/workouts/catalog/"))
      json = { categories: [category], exercises: [exercise] };
    else if (path === "/api/v1/workouts/routines/") {
      if (method === "POST") {
        const routine: WorkoutRoutine = {
          id: "88888888-8888-4888-8888-888888888888",
          name: String(body?.name),
          notes: "",
          display_order: 100,
          is_active: true,
          days: [],
        };
        routines.push(routine);
        json = routine;
      } else json = routines;
    } else if (
      path.includes("/workouts/routines/") &&
      path.endsWith("/days/")
    ) {
      const source = sessions.find((w) => w.id === body?.source_workout_id)!;
      const day = {
        id: "99999999-9999-4999-8999-999999999999",
        name: String(body?.name),
        notes: String(body?.notes || ""),
        display_order: Number(body?.display_order ?? 100),
        exercises: structuredClone(source.exercises).map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({
            id: s.id,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            duration_seconds: s.duration_seconds,
            display_order: s.display_order,
          })),
        })),
      };
      routines[0].days.push(day);
      json = day;
    } else if (path.includes("/workouts/routines/")) {
      Object.assign(routines[0], body);
      json = routines[0];
    } else if (
      path.includes("/workouts/routine-days/") &&
      path.endsWith("/preview/")
    ) {
      const day = routines[0].days[0];
      json = {
        day_id: day.id,
        name: routines[0].name + " · " + day.name,
        notes: day.notes,
        performed_on: url.searchParams.get("performed_on"),
        carry_forward: false,
        preview_token: "a".repeat(64),
        exercises: day.exercises.map((item) => ({
          ...item,
          carry_reason: "Fixed template values; carry-forward is off.",
          sets: item.sets.map((row) => ({ ...row, source: null })),
        })),
      };
    } else if (
      path.includes("/workouts/routine-days/") &&
      path.endsWith("/start/")
    ) {
      const day = routines[0].days[0];
      const planned = {
        ...sessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        name: routines[0].name + " · " + day.name,
        performed_on: String(body?.performed_on),
        notes: day.notes,
        is_finished: false,
        completed_set_count: 0,
        exercises: day.exercises.map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({ ...s, comment: "", is_completed: false })),
        })),
      };
      sessions.push(planned);
      json = planned;
    } else if (path.includes("/workouts/routine-days/")) {
      if (method === "DELETE") {
        routines[0].days = [];
        await route.fulfill({ status: 204 });
        return;
      }
      Object.assign(routines[0].days[0], body);
      json = routines[0].days[0];
    } else if (path === "/api/v1/workouts/sessions/" && method === "GET") {
      const rows = sessions.filter(
        (w) =>
          w.performed_on >= url.searchParams.get("date_from")! &&
          w.performed_on <= url.searchParams.get("date_to")!,
      );
      json = { count: rows.length, next: null, previous: null, results: rows };
    } else if (path === "/api/v1/workouts/sessions/" && method === "POST") {
      const session = {
        id: sessionId,
        performed_on: String(body?.performed_on),
        name: "Workout",
        notes: "",
        is_finished: false,
        created_at: date + "T10:00:00Z",
        completed_set_count: 0,
        exercises: [] as (typeof occurrence)[],
      };
      sessions.push(session);
      json = session;
    } else if (path.endsWith(`/${sessionId}/exercises/`)) {
      sessions[0].exercises.push(occurrence);
      json = occurrence;
    } else if (path.endsWith(`/${sessionId}/copy/`)) {
      const copied = {
        ...sessions[0],
        id: "55555555-5555-4555-8555-555555555555",
        performed_on: String(body?.performed_on),
        is_finished: false,
        completed_set_count: 0,
        exercises: sessions[0].exercises.map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({ ...s, is_completed: false, comment: "" })),
        })),
      };
      sessions.push(copied);
      json = copied;
    } else if (path.endsWith(`/${sessionId}/`)) {
      if (method === "PATCH") Object.assign(sessions[0], body);
      json = sessions[0];
    } else if (path.endsWith(`/${itemId}/sets/`)) {
      const set = {
        id:
          "66666666-6666-4666-8666-" +
          String(occurrence.sets.length + 1).padStart(12, "0"),
        weight: null,
        reps: null,
        distance: null,
        duration_seconds: null,
        comment: "",
        display_order: occurrence.sets.length * 10,
        is_completed: true,
        ...body,
      } as SetRow;
      occurrence.sets.push(set);
      json = set;
    } else if (path.includes("/workouts/sets/")) {
      const id = path.split("/").at(-2);
      const set = occurrence.sets.find((s) => s.id === id)!;
      if (method === "DELETE") {
        occurrence.sets = occurrence.sets.filter((s) => s.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
      Object.assign(set, body);
      json = set;
    } else if (path.endsWith("/definitions/")) json = [];
    else if (path.endsWith("/current/"))
      json = { plan: { code: "free", name: "Free" }, status: "active" };
    else if (!path.endsWith("/csrf/")) {
      await route.fulfill({
        status: 404,
        json: { detail: "Unhandled fixture: " + path },
      });
      return;
    }
    for (const session of sessions)
      session.completed_set_count = session.exercises.reduce(
        (sum, i) => sum + i.sets.filter((s) => s.is_completed).length,
        0,
      );
    await route.fulfill({ json });
  });
}

for (const width of [320, 390, 1440])
  test(`workout logging, planning, editing, copy and layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await fixture(page);
    await page.goto("/workouts?date=" + date);
    await expect(
      page.getByRole("heading", { name: "Workouts", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start new workout" }).click();
    await page.getByRole("button", { name: "Add Barbell bench press" }).click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("60");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByLabel("Set comment").fill("Steady pace");
    await page.getByRole("button", { name: "Save completed set" }).click();
    await expect(
      page.getByText("60 kg · 8 reps", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit set 1" }).click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("65");
    await page.getByRole("button", { name: "Update set" }).click();
    await expect(
      page.getByText("65 kg · 8 reps", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("");
    await page.getByLabel("Reps", { exact: true }).fill("");
    await page.getByRole("button", { name: "Add planned set" }).click();
    await expect(page.getByLabel("Set 2 completed")).not.toBeChecked();
    await page.getByRole("button", { name: "Edit set 2" }).click();
    await page.getByRole("button", { name: "Delete set", exact: true }).click();
    await page.getByRole("button", { name: "Confirm set deletion" }).click();
    await expect(page.getByLabel("Set 2 completed")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workouts/training-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Workout options", { exact: true }).click();
    await page.getByRole("button", { name: "Workout overview" }).click();
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(
      page.getByRole("button", { name: "Reopen workout" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Export workout" }).click();
    await expect(page.getByLabel("Workout summary")).toContainText("65");
    await expect(page.getByLabel("Workout summary")).not.toContainText(
      "Steady pace",
    );
    await page.getByLabel("Include session notes and set comments").check();
    await expect(page.getByLabel("Workout summary")).toContainText(
      "Steady pace",
    );
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`longevity-workout-${date}.csv`);
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain('"65","kg","8"');
    expect(csv).toContain('"Completed","Steady pace"');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/workouts/export-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Copy workout" }).click();
    await page.getByLabel("Copy to date").fill("2026-10-03");
    await page
      .getByRole("button", { name: "Preview copy", exact: true })
      .click();
    await page.getByRole("button", { name: "Create planned workout" }).click();
    await expect(
      page.getByText("0 completed sets · 1 exercise", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save as routine day" }).click();
    await page.getByLabel("New routine name").fill("Weekly plan");
    await page.getByLabel("Day name", { exact: true }).fill("Push");
    await page.getByLabel("Day instructions").fill("Warm up first");
    await page
      .getByRole("button", { name: "Save routine day", exact: true })
      .click();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan" }),
    ).toBeVisible();
    await page.getByLabel("Tracking date").fill("2026-10-06");
    await page.getByRole("button", { name: "Start Push", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Preview routine start" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start planned workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await expect(
      page.getByText("0 completed sets · 1 exercise", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Warm up first", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Archive routine" }).click();
    await page.getByLabel("Show archived routines").check();
    await expect(
      page.getByRole("button", { name: "Start Push", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Restore routine" }).click();
    await page
      .getByRole("button", { name: "Edit template", exact: true })
      .click();
    await page.getByLabel("Day name", { exact: true }).fill("Upper body");
    await page.getByRole("button", { name: "Save day details" }).click();
    await expect(
      page.getByRole("heading", { name: "Upper body", exact: true }),
    ).toBeVisible();
    for (const theme of ["light", "sand"]) {
      await page.getByLabel("Color theme").selectOption(theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workouts/routines-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Upper body", exact: true }),
    ).toBeVisible();
  });

test("mobile training puts set logging before exercise management", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  await fixture(page);
  await page.goto("/workouts?date=" + date);
  await page.getByRole("button", { name: "Start new workout" }).click();
  await page.getByRole("button", { name: "Add Barbell bench press" }).click();

  const saveSet = page.getByRole("button", {
    name: "Save completed set",
    exact: true,
  });
  const exerciseSwitcher = page.getByRole("heading", {
    name: "This workout",
    exact: true,
  });
  const setsHeading = page.getByRole("heading", { name: "Sets", exact: true });
  await expect(saveSet).toBeVisible();
  await expect(setsHeading).toBeVisible();
  await expect(exerciseSwitcher).toBeVisible();
  expect((await saveSet.boundingBox())!.y).toBeLessThan(
    (await exerciseSwitcher.boundingBox())!.y,
  );
  expect((await setsHeading.boundingBox())!.y).toBeLessThan(
    (await exerciseSwitcher.boundingBox())!.y,
  );
  await expect(
    page.getByRole("button", { name: "Exercise notes", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Workout options", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("training-mobile-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("training-desktop-light.png"),
    fullPage: true,
  });
});
