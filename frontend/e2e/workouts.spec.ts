import { expect, test, type Page } from "@playwright/test";

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
    else if (path === "/api/v1/workouts/sessions/" && method === "GET") {
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
    await page.getByLabel("Weight (kg)").fill("60");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByLabel("Set comment").fill("Steady pace");
    await page.getByRole("button", { name: "Save completed set" }).click();
    await expect(
      page.getByText("60 kg · 8 reps", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit set 1" }).click();
    await page.getByLabel("Weight (kg)").fill("65");
    await page.getByRole("button", { name: "Update set" }).click();
    await expect(
      page.getByText("65 kg · 8 reps", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Weight (kg)").fill("");
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
    await page.getByRole("button", { name: "Workout overview" }).click();
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(
      page.getByRole("button", { name: "Reopen workout" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Copy workout" }).click();
    await page.getByLabel("Copy to date").fill("2026-10-03");
    await page.getByRole("button", { name: "Create planned workout" }).click();
    await expect(
      page.getByText("0 completed sets · 1 exercise", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/workouts/home-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByText("0 completed sets · 1 exercise", { exact: true }),
    ).toBeVisible();
  });
