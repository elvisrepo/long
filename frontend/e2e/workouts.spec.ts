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
      page.getByRole("heading", {
        name: "No workout on this day",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start new workout" }).click();
    await page.getByRole("button", { name: "Add Barbell bench press" }).click();

    await page.getByLabel("Weight (kg)", { exact: true }).fill("60");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByText("+ Comment", { exact: true }).click();
    await page.getByLabel("Set comment").fill("Steady pace");
    await page.getByRole("button", { name: "Close menu", exact: true }).click();
    await page.getByRole("button", { name: "Save completed set" }).click();
    await expect(
      page
        .getByRole("button", { name: "Edit set 1", exact: true })
        .locator(".workout-strength-values"),
    ).toHaveText(/60\s*kg8\s*reps/);
    await page.getByRole("button", { name: "Edit set 1" }).click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("65");
    await page.getByRole("button", { name: "Update set" }).click();
    await expect(
      page
        .getByRole("button", { name: "Edit set 1", exact: true })
        .locator(".workout-strength-values"),
    ).toHaveText(/65\s*kg8\s*reps/);
    await page.getByLabel("Weight (kg)", { exact: true }).fill("");
    await page.getByLabel("Reps", { exact: true }).fill("");
    await page.getByLabel("Exercise options", { exact: true }).click();
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
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByRole("button", { name: "Workout overview" }).click();
    await page.getByText("More actions ···", { exact: true }).click();
    await page.getByRole("button", { name: "Finish workout" }).click();
    await page.getByText("More actions ···", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reopen workout" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Export workout" }).click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      }),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Share to", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "WhatsApp", exact: true }),
    ).toHaveAttribute("href", /wa\.me/);
    await expect(
      page.getByRole("link", { name: "Gmail", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Email", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Select all", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await expect(page.getByLabel("Workout summary")).toContainText("65");
    await expect(page.getByLabel("Workout summary")).not.toContainText(
      "Steady pace",
    );
    await page.getByLabel("Include session notes and set comments").check();
    await expect(page.getByLabel("Workout summary")).toContainText(
      "Steady pace",
    );
    await page.getByLabel("Format", { exact: true }).selectOption("csv");
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
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Copy workout" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Copy to date").fill("2026-10-03");
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Open Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("More actions ···", { exact: true }).click();
    await page
      .getByRole("button", { name: "Manage workout", exact: true })
      .click();
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
      page.getByRole("button", {
        name: "Open Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("More actions ···", { exact: true }).click();
    await page
      .getByRole("button", { name: "Comment workout", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Workout comment", exact: true }),
    ).toHaveValue("Warm up first");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
    for (const theme of ["dark", "light"]) {
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

test("mobile exercise editor leads with stepped inputs and Save/Clear", async ({
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
  await expect(saveSet).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Increase Weight (kg)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Graph", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Exercise in this workout", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Exercise options", { exact: true }),
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

for (const width of [390, 1440]) {
  test(`selects, drags and deletes workout exercises at ${width}px`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 950 });
    const items = ["Bench", "Row", "Press"].map((name, index) => ({
      id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
      exercise_id: exerciseId,
      exercise_name: name,
      category_name: "Chest",
      tracking_type: "strength",
      weight_unit: "kg",
      distance_unit: "km",
      display_order: index * 10,
      sets: [],
    }));
    const saved = {
      id: sessionId,
      name: "Workout",
      performed_on: date,
      notes: "",
      is_finished: false,
      created_at: "",
      completed_set_count: 0,
      exercises: items,
    };
    const writes: Record<string, unknown>[] = [];
    await page.route(/\/api\/v1\/workouts\/sessions\//, async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const data = req.postDataJSON();
        writes.push(data);
        saved.exercises =
          data.action === "delete"
            ? saved.exercises.filter(
                (item) => !data.exercise_ids.includes(item.id),
              )
            : data.exercise_ids.map(
                (id: string) => saved.exercises.find((item) => item.id === id)!,
              );
        await route.fulfill({ json: saved });
      } else
        await route.fulfill({
          json: new URL(req.url()).pathname.endsWith(`/${sessionId}/`)
            ? saved
            : { count: 1, next: null, previous: null, results: [saved] },
        });
    });
    await page.goto("/workouts?date=" + date);
    await page.getByLabel("Color theme").selectOption("light");
    const bench = page.getByRole("button", { name: "Open Bench", exact: true });
    const bounds = (await bench.boundingBox())!;
    await page.mouse.move(bounds.x + 30, bounds.y + 25);
    await page.mouse.down();
    await expect(
      page.getByRole("toolbar", { name: "Selected exercises" }),
    ).toContainText("1 exercise selected");
    await page.mouse.up();
    expect(writes).toHaveLength(0);
    const handle = (await page
      .getByRole("button", { name: "Reorder Bench" })
      .boundingBox())!;
    const row = (await page
      .getByRole("button", { name: "Select Row", exact: true })
      .boundingBox())!;
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    const benchBefore = (await page
      .getByRole("button", { name: "Select Bench", exact: true })
      .boundingBox())!;
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2, {
      steps: 5,
    });
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("button", { name: "Select Bench", exact: true })
            .boundingBox())!.y,
      )
      .toBeGreaterThan(benchBefore.y + 20);
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("button", { name: "Select Row", exact: true })
            .boundingBox())!.y,
      )
      .toBeLessThan(row.y - 20);
    expect(writes).toHaveLength(0);
    await page.screenshot({
      path: `test-results/workouts/dragging-${width}.png`,
      fullPage: true,
    });
    await page.mouse.up();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({
      action: "reorder",
      exercise_ids: [items[1].id, items[0].id, items[2].id],
      expected_order: items.map((item) => item.id),
    });
    await expect(
      page.getByRole("button", { name: "Select Row", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Select Row", exact: true }).click();
    await expect(
      page.getByRole("toolbar", { name: "Selected exercises" }),
    ).toContainText("2 exercises selected");
    await page.screenshot({
      path: `test-results/workouts/selection-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    expect(writes).toHaveLength(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm exercise deletion", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual({
      action: "delete",
      exercise_ids: [items[1].id, items[0].id],
    });
    await expect(
      page.getByRole("button", { name: "Open Press", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Bench", exact: true }),
    ).toHaveCount(0);
  });
}
